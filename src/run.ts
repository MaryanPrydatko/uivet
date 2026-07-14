import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { computeFidelity } from "./checks.ts";
import type { Generate } from "./generator.ts";
import { makeGenerator } from "./generator.ts";
import { DEFAULT_RUBRIC, judgeRun, rubricKey } from "./judge.ts";
import { type Provider, requireApiKey } from "./llm.ts";
import { launchBrowser, loadAxeSource, renderHtml } from "./render.ts";
import { buildReport } from "./report.ts";
import { hasBlockingFailure, printSummary } from "./summary.ts";
import type {
  Baseline,
  GateStatus,
  JudgeResult,
  Regression,
  RunResult,
  Scenario,
  ScenarioAggregate,
  UivetConfig,
} from "./types.ts";
import { avg, mapPool, round, stdDev, timestamp, uniq } from "./util.ts";

export interface RunOptions {
  config: string;
  out?: string;
  saveBaseline: boolean;
}

interface Gates {
  maxA11yCritical: number;
  maxScoreStdDev: number;
  minFidelity: number;
  minJudgeScore: number;
}

interface Context {
  axeSource: string;
  browser: Awaited<ReturnType<typeof launchBrowser>>;
  config: UivetConfig;
  gates: Gates;
  generate: Generate;
}

async function loadConfig(path: string): Promise<UivetConfig> {
  const abs = resolve(process.cwd(), path);
  if (!existsSync(abs)) {
    throw new Error(`Config not found: ${abs}`);
  }
  const mod = (await import(abs)) as { default?: UivetConfig };
  const config = mod.default;
  if (
    !(config && Array.isArray(config.scenarios)) ||
    config.scenarios.length === 0
  ) {
    throw new Error(`Config ${path} must default-export { scenarios: [...] }`);
  }
  return config;
}

function resolveGates(config: UivetConfig): Gates {
  const g = config.gates ?? {};
  return {
    maxA11yCritical: g.maxA11yCritical ?? 0,
    maxScoreStdDev: g.maxScoreStdDev ?? 1.5,
    minFidelity: g.minFidelity ?? 1.0,
    minJudgeScore: g.minJudgeScore ?? 6,
  };
}

function emptyJudge(
  error: string,
  rubric: string[],
  judgeOff: boolean
): JudgeResult | null {
  if (judgeOff) {
    return null;
  }
  const scores: Record<string, number> = {};
  for (const item of rubric) {
    scores[rubricKey(item)] = 1;
  }
  return { overall: 1, rationale: error, scores };
}

function emptyRun(
  index: number,
  latencyMs: number,
  error: string,
  judge: JudgeResult | null
): RunResult {
  return {
    axe: { critical: 0, ruleIds: [], serious: 0, violations: [] },
    consoleErrors: [],
    error,
    fidelity: { found: 0, missing: [], rate: 0, total: 0 },
    html: "",
    index,
    judge,
    latencyMs,
    layout: { emptyBody: true, horizontalOverflow: false, smallTargets: 0 },
    screenshot: "",
    text: "",
  };
}

async function executeRun(
  index: number,
  scenario: Scenario,
  ctx: Context
): Promise<RunResult> {
  const rubric = ctx.config.judge?.rubric ?? DEFAULT_RUBRIC;
  const judgeOff = ctx.config.judge?.mode === "off";
  const start = performance.now();
  let html: string;
  try {
    html = await ctx.generate(scenario);
  } catch (err) {
    const error = `generation failed: ${String(err)}`;
    return emptyRun(
      index,
      Math.round(performance.now() - start),
      error,
      emptyJudge(error, rubric, judgeOff)
    );
  }
  const latencyMs = Math.round(performance.now() - start);
  try {
    const capture = await renderHtml(ctx.browser, html, ctx.axeSource);
    const fidelity = computeFidelity(scenario.data, capture.text);
    const judge = judgeOff
      ? null
      : await judgeRun(ctx.config.judge, scenario, capture.screenshot);
    return {
      axe: capture.axe,
      consoleErrors: capture.consoleErrors,
      fidelity,
      html,
      index,
      judge,
      latencyMs,
      layout: capture.layout,
      screenshot: capture.screenshot,
      text: capture.text,
    };
  } catch (err) {
    const error = `render failed: ${String(err)}`;
    return {
      ...emptyRun(index, latencyMs, error, emptyJudge(error, rubric, judgeOff)),
      html,
    };
  }
}

function gateStatus(
  agg: Omit<ScenarioAggregate, "gates" | "pass" | "regressions">,
  gates: Gates,
  totalCritical: number,
  enforce: boolean
): GateStatus[] {
  const advisory = !enforce;
  const judgeGate: GateStatus =
    agg.meanOverall === null
      ? {
          detail: "skipped (judge off)",
          name: "judge score",
          pass: true,
          skipped: true,
        }
      : {
          advisory,
          detail: `mean ${round(agg.meanOverall)} >= ${gates.minJudgeScore}`,
          name: "judge score",
          pass: agg.meanOverall >= gates.minJudgeScore,
        };
  const consistencyGate: GateStatus =
    agg.scoreStdDev === null
      ? {
          detail: "skipped (judge off)",
          name: "consistency",
          pass: true,
          skipped: true,
        }
      : {
          advisory,
          detail: `stddev ${round(agg.scoreStdDev)} <= ${gates.maxScoreStdDev}`,
          name: "consistency",
          pass: agg.scoreStdDev <= gates.maxScoreStdDev,
        };
  return [
    judgeGate,
    {
      detail: `${totalCritical} <= ${gates.maxA11yCritical}`,
      name: "a11y critical",
      pass: totalCritical <= gates.maxA11yCritical,
    },
    {
      detail: `${round(agg.fidelityRate)} >= ${gates.minFidelity}`,
      name: "fidelity",
      pass: agg.fidelityRate >= gates.minFidelity,
    },
    consistencyGate,
  ];
}

function detectRegressions(
  agg: ScenarioAggregate,
  baseline: Baseline | undefined,
  enforce: boolean
): Regression[] {
  const prev = baseline?.scenarios[agg.id];
  if (!prev) {
    return [];
  }
  const out: Regression[] = [];
  if (agg.meanOverall !== null && agg.meanOverall < prev.meanOverall - 1.0) {
    out.push({
      advisory: !enforce,
      detail: `mean score ${round(prev.meanOverall)} -> ${round(agg.meanOverall)}`,
    });
  }
  const newRules = agg.a11yRuleIds.filter(
    (id) => !prev.a11yRuleIds.includes(id)
  );
  if (newRules.length) {
    out.push({ detail: `new a11y rules: ${newRules.join(", ")}` });
  }
  if (agg.fidelityRate < prev.fidelityRate - 1e-9) {
    out.push({
      detail: `fidelity ${round(prev.fidelityRate)} -> ${round(agg.fidelityRate)}`,
    });
  }
  return out;
}

async function runScenario(
  scenario: Scenario,
  ctx: Context,
  baseline: Baseline | undefined
): Promise<ScenarioAggregate> {
  const total = scenario.runs ?? 3;
  const indices = Array.from({ length: total }, (_, i) => i);
  const runs = await mapPool(indices, 3, (i) => executeRun(i, scenario, ctx));
  const judgeOff = ctx.config.judge?.mode === "off";
  const overalls = runs.map((r) => r.judge?.overall ?? 0);
  const totalCritical = runs.reduce((a, r) => a + r.axe.critical, 0);
  const base = {
    a11yCriticalSerious: runs.reduce(
      (a, r) => a + r.axe.critical + r.axe.serious,
      0
    ),
    a11yRuleIds: uniq(runs.flatMap((r) => r.axe.ruleIds)).sort((a, b) =>
      a.localeCompare(b)
    ),
    fidelityRate: avg(runs.map((r) => r.fidelity.rate)),
    id: scenario.id,
    maxOverall: judgeOff ? null : Math.max(...overalls),
    meanOverall: judgeOff ? null : avg(overalls),
    minOverall: judgeOff ? null : Math.min(...overalls),
    prompt: scenario.prompt,
    runs,
    scoreStdDev: judgeOff ? null : stdDev(overalls),
  };
  const enforce = Boolean(ctx.config.judge?.enforce);
  const gates = gateStatus(base, ctx.gates, totalCritical, enforce);
  const agg: ScenarioAggregate = {
    ...base,
    gates,
    // Advisory gates (judge score, consistency when enforce is off) warn but
    // never block, so they do not flip pass.
    pass: gates.every((g) => g.advisory || g.pass),
    regressions: [],
  };
  agg.regressions = detectRegressions(agg, baseline, enforce);
  return agg;
}

function toBaseline(scenarios: ScenarioAggregate[]): Baseline {
  const map: Baseline["scenarios"] = {};
  for (const s of scenarios) {
    map[s.id] = {
      a11yRuleIds: s.a11yRuleIds,
      fidelityRate: s.fidelityRate,
      meanOverall: s.meanOverall ?? 0,
    };
  }
  return { createdAt: new Date().toISOString(), scenarios: map };
}

function providersNeedingKeys(config: UivetConfig): Provider[] {
  const providers = new Set<Provider>();
  const gen = config.generator ?? { kind: "gemini-html" };
  if (gen.kind === "gemini-html") {
    providers.add("google");
  } else if (gen.kind === "llm-html") {
    providers.add(gen.provider ?? "google");
  }
  if (config.judge?.mode !== "off") {
    providers.add(config.judge?.provider ?? "google");
  }
  return [...providers];
}

export async function runCommand(options: RunOptions): Promise<number> {
  const config = await loadConfig(options.config);
  for (const provider of providersNeedingKeys(config)) {
    requireApiKey(provider);
  }
  const out = options.out ?? join("results", timestamp());
  const baselinePath = join(dirname(out), "baseline.json");
  let baseline: Baseline | undefined;
  if (!options.saveBaseline && existsSync(baselinePath)) {
    baseline = JSON.parse(await readFile(baselinePath, "utf8")) as Baseline;
  }

  const browser = await launchBrowser();
  const ctx: Context = {
    axeSource: loadAxeSource(),
    browser,
    config,
    gates: resolveGates(config),
    generate: makeGenerator(config),
  };

  const results: ScenarioAggregate[] = [];
  try {
    for (const scenario of config.scenarios) {
      process.stdout.write(
        `running scenario ${scenario.id} (${scenario.runs ?? 3} runs)...\n`
      );
      // biome-ignore lint/performance/noAwaitInLoops: scenarios run sequentially to share one browser and stream ordered progress
      results.push(await runScenario(scenario, ctx, baseline));
    }
  } finally {
    await browser.close();
  }

  await mkdir(out, { recursive: true });
  const meta = {
    config: options.config,
    createdAt: new Date().toISOString(),
    gates: ctx.gates,
  };
  await writeFile(
    join(out, "results.json"),
    JSON.stringify({ meta, scenarios: results }, null, 2)
  );
  await writeFile(
    join(out, "report.html"),
    buildReport(results, baseline, meta.createdAt)
  );

  if (options.saveBaseline) {
    await writeFile(baselinePath, JSON.stringify(toBaseline(results), null, 2));
  }

  const failed = results.some(hasBlockingFailure);
  printSummary(results, out, Boolean(baseline));
  return failed ? 1 : 0;
}
