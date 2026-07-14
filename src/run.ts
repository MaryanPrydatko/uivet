import { mkdir, readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { avg, mapPool, round, stdDev, timestamp, uniq } from "./util.ts"
import { apiKey } from "./gemini.ts"
import { makeGenerator } from "./generator.ts"
import type { Generate } from "./generator.ts"
import { launchBrowser, loadAxeSource, renderHtml } from "./render.ts"
import { computeFidelity } from "./checks.ts"
import { DEFAULT_RUBRIC, judgeRun, rubricKey } from "./judge.ts"
import { buildReport } from "./report.ts"
import { printSummary } from "./summary.ts"
import type {
  Baseline,
  GateStatus,
  JudgeResult,
  RunResult,
  ScenarioAggregate,
  Scenario,
  UivetConfig,
} from "./types.ts"

export interface RunOptions {
  config: string
  out?: string
  saveBaseline: boolean
}

interface Gates {
  minJudgeScore: number
  maxA11yCritical: number
  minFidelity: number
  maxScoreStdDev: number
}

interface Context {
  config: UivetConfig
  generate: Generate
  browser: Awaited<ReturnType<typeof launchBrowser>>
  axeSource: string
  gates: Gates
}

async function loadConfig(path: string): Promise<UivetConfig> {
  const abs = resolve(process.cwd(), path)
  if (!existsSync(abs)) throw new Error(`Config not found: ${abs}`)
  const mod = (await import(abs)) as { default?: UivetConfig }
  const config = mod.default
  if (!config || !Array.isArray(config.scenarios) || config.scenarios.length === 0) {
    throw new Error(`Config ${path} must default-export { scenarios: [...] }`)
  }
  return config
}

function resolveGates(config: UivetConfig): Gates {
  const g = config.gates ?? {}
  return {
    minJudgeScore: g.minJudgeScore ?? 6,
    maxA11yCritical: g.maxA11yCritical ?? 0,
    minFidelity: g.minFidelity ?? 1.0,
    maxScoreStdDev: g.maxScoreStdDev ?? 1.5,
  }
}

function emptyJudge(error: string, rubric: string[], judgeOff: boolean): JudgeResult | null {
  if (judgeOff) return null
  const scores: Record<string, number> = {}
  for (const item of rubric) scores[rubricKey(item)] = 1
  return { scores, overall: 1, rationale: error }
}

function emptyRun(index: number, latencyMs: number, error: string, judge: JudgeResult | null): RunResult {
  return {
    index,
    html: "",
    screenshot: "",
    text: "",
    consoleErrors: [],
    latencyMs,
    error,
    fidelity: { rate: 0, total: 0, found: 0, missing: [] },
    layout: { horizontalOverflow: false, smallTargets: 0, emptyBody: true },
    axe: { critical: 0, serious: 0, ruleIds: [], violations: [] },
    judge,
  }
}

async function executeRun(index: number, scenario: Scenario, ctx: Context): Promise<RunResult> {
  const rubric = ctx.config.judge?.rubric ?? DEFAULT_RUBRIC
  const judgeOff = ctx.config.judge?.mode === "off"
  const start = performance.now()
  let html: string
  try {
    html = await ctx.generate(scenario)
  } catch (err) {
    const error = `generation failed: ${String(err)}`
    return emptyRun(index, Math.round(performance.now() - start), error, emptyJudge(error, rubric, judgeOff))
  }
  const latencyMs = Math.round(performance.now() - start)
  try {
    const capture = await renderHtml(ctx.browser, html, ctx.axeSource)
    const fidelity = computeFidelity(scenario.data, capture.text)
    const judge = judgeOff ? null : await judgeRun(ctx.config.judge, scenario, capture.screenshot)
    return {
      index,
      html,
      screenshot: capture.screenshot,
      text: capture.text,
      consoleErrors: capture.consoleErrors,
      latencyMs,
      fidelity,
      layout: capture.layout,
      axe: capture.axe,
      judge,
    }
  } catch (err) {
    const error = `render failed: ${String(err)}`
    return { ...emptyRun(index, latencyMs, error, emptyJudge(error, rubric, judgeOff)), html }
  }
}

function gateStatus(agg: Omit<ScenarioAggregate, "gates" | "pass" | "regressions">, gates: Gates, totalCritical: number): GateStatus[] {
  const judgeGate: GateStatus =
    agg.meanOverall === null
      ? { name: "judge score", pass: true, detail: "skipped (judge off)", skipped: true }
      : {
          name: "judge score",
          pass: agg.meanOverall >= gates.minJudgeScore,
          detail: `mean ${round(agg.meanOverall)} >= ${gates.minJudgeScore}`,
        }
  const consistencyGate: GateStatus =
    agg.scoreStdDev === null
      ? { name: "consistency", pass: true, detail: "skipped (judge off)", skipped: true }
      : {
          name: "consistency",
          pass: agg.scoreStdDev <= gates.maxScoreStdDev,
          detail: `stddev ${round(agg.scoreStdDev)} <= ${gates.maxScoreStdDev}`,
        }
  return [
    judgeGate,
    {
      name: "a11y critical",
      pass: totalCritical <= gates.maxA11yCritical,
      detail: `${totalCritical} <= ${gates.maxA11yCritical}`,
    },
    {
      name: "fidelity",
      pass: agg.fidelityRate >= gates.minFidelity,
      detail: `${round(agg.fidelityRate)} >= ${gates.minFidelity}`,
    },
    consistencyGate,
  ]
}

function detectRegressions(agg: ScenarioAggregate, baseline: Baseline | undefined): string[] {
  const prev = baseline?.scenarios[agg.id]
  if (!prev) return []
  const out: string[] = []
  if (agg.meanOverall !== null && agg.meanOverall < prev.meanOverall - 1.0) {
    out.push(`mean score ${round(prev.meanOverall)} -> ${round(agg.meanOverall)}`)
  }
  const newRules = agg.a11yRuleIds.filter((id) => !prev.a11yRuleIds.includes(id))
  if (newRules.length) out.push(`new a11y rules: ${newRules.join(", ")}`)
  if (agg.fidelityRate < prev.fidelityRate - 1e-9) {
    out.push(`fidelity ${round(prev.fidelityRate)} -> ${round(agg.fidelityRate)}`)
  }
  return out
}

async function runScenario(scenario: Scenario, ctx: Context, baseline: Baseline | undefined): Promise<ScenarioAggregate> {
  const total = scenario.runs ?? 3
  const indices = Array.from({ length: total }, (_, i) => i)
  const runs = await mapPool(indices, 3, (i) => executeRun(i, scenario, ctx))
  const judgeOff = ctx.config.judge?.mode === "off"
  const overalls = runs.map((r) => r.judge?.overall ?? 0)
  const totalCritical = runs.reduce((a, r) => a + r.axe.critical, 0)
  const base = {
    id: scenario.id,
    prompt: scenario.prompt,
    meanOverall: judgeOff ? null : avg(overalls),
    minOverall: judgeOff ? null : Math.min(...overalls),
    maxOverall: judgeOff ? null : Math.max(...overalls),
    scoreStdDev: judgeOff ? null : stdDev(overalls),
    fidelityRate: avg(runs.map((r) => r.fidelity.rate)),
    a11yCriticalSerious: runs.reduce((a, r) => a + r.axe.critical + r.axe.serious, 0),
    a11yRuleIds: uniq(runs.flatMap((r) => r.axe.ruleIds)).sort(),
    runs,
  }
  const gates = gateStatus(base, ctx.gates, totalCritical)
  const agg: ScenarioAggregate = {
    ...base,
    gates,
    pass: gates.every((g) => g.pass),
    regressions: [],
  }
  agg.regressions = detectRegressions(agg, baseline)
  return agg
}

function toBaseline(scenarios: ScenarioAggregate[]): Baseline {
  const map: Baseline["scenarios"] = {}
  for (const s of scenarios) {
    map[s.id] = {
      meanOverall: s.meanOverall ?? 0,
      fidelityRate: s.fidelityRate,
      a11yRuleIds: s.a11yRuleIds,
    }
  }
  return { createdAt: new Date().toISOString(), scenarios: map }
}

export async function runCommand(options: RunOptions): Promise<number> {
  const config = await loadConfig(options.config)
  const generatorKind = config.generator?.kind ?? "gemini-html"
  const needsApiKey = generatorKind === "gemini-html" || config.judge?.mode !== "off"
  if (needsApiKey) apiKey()
  const out = options.out ?? join("results", timestamp())
  const baselinePath = join(dirname(out), "baseline.json")
  let baseline: Baseline | undefined
  if (!options.saveBaseline && existsSync(baselinePath)) {
    baseline = JSON.parse(await readFile(baselinePath, "utf8")) as Baseline
  }

  const browser = await launchBrowser()
  const ctx: Context = {
    config,
    generate: makeGenerator(config),
    browser,
    axeSource: loadAxeSource(),
    gates: resolveGates(config),
  }

  const results: ScenarioAggregate[] = []
  try {
    for (const scenario of config.scenarios) {
      process.stdout.write(`running scenario ${scenario.id} (${scenario.runs ?? 3} runs)...\n`)
      results.push(await runScenario(scenario, ctx, baseline))
    }
  } finally {
    await browser.close()
  }

  await mkdir(out, { recursive: true })
  const meta = { createdAt: new Date().toISOString(), config: options.config, gates: ctx.gates }
  await writeFile(join(out, "results.json"), JSON.stringify({ meta, scenarios: results }, null, 2))
  await writeFile(join(out, "report.html"), buildReport(results, baseline, meta.createdAt))

  if (options.saveBaseline) {
    await writeFile(baselinePath, JSON.stringify(toBaseline(results), null, 2))
  }

  const failed = results.some((r) => !r.pass || r.regressions.length > 0)
  printSummary(results, out, Boolean(baseline))
  return failed ? 1 : 0
}
