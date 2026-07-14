import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser } from "playwright";
import { computeFidelity } from "../src/checks.ts";
import type { Generate } from "../src/generator.ts";
import { makeGenerator } from "../src/generator.ts";
import type { Provider } from "../src/llm.ts";
import { requireApiKey } from "../src/llm.ts";
import { launchBrowser, loadAxeSource, renderHtml } from "../src/render.ts";
import type { Scenario, UivetConfig } from "../src/types.ts";
import { avg, mapPool } from "../src/util.ts";
import type { LeaderboardModel } from "./models.ts";
import { MODELS } from "./models.ts";
import { SCENARIOS } from "./scenarios.ts";

const LB_DIR = dirname(fileURLToPath(import.meta.url));
const CONCURRENCY = 3;

interface LayoutFlags {
  emptyBody: boolean;
  horizontalOverflow: boolean;
  smallTargets: number;
}

interface RunRecord {
  consoleErrors: number;
  critical: number;
  error?: string;
  fidelityRate: number;
  generationFailed: boolean;
  latencyMs: number;
  layout: LayoutFlags;
  serious: number;
}

interface ScenarioResult {
  a11yCriticalSerious: number;
  consoleErrors: number;
  criticalCount: number;
  fidelityRate: number;
  id: string;
  layout: LayoutFlags;
  pass: boolean;
  runs: number;
}

interface ModelResult {
  label: string;
  meanLatencyMs: number | null;
  model: string;
  provider: Provider;
  reason?: string;
  scenarios: ScenarioResult[];
  scenariosPassed: number;
  status: "not-run" | "ok";
}

interface ScenarioMeta {
  id: string;
  prompt: string;
  runs: number;
}

interface Report {
  commit: string;
  generatedAt: string;
  models: ModelResult[];
  scenarios: ScenarioMeta[];
}

interface Ctx {
  axeSource: string;
  browser: Browser;
}

interface Filters {
  models?: Set<string>;
  provider?: Provider;
}

const EMPTY_LAYOUT: LayoutFlags = {
  emptyBody: true,
  horizontalOverflow: false,
  smallTargets: 0,
};

async function renderOnce(
  generate: Generate,
  scenario: Scenario,
  ctx: Ctx
): Promise<RunRecord> {
  const start = performance.now();
  let html: string;
  try {
    html = await generate(scenario);
  } catch (err) {
    return {
      consoleErrors: 0,
      critical: 0,
      error: `generation failed: ${String(err)}`,
      fidelityRate: 0,
      generationFailed: true,
      latencyMs: Math.round(performance.now() - start),
      layout: EMPTY_LAYOUT,
      serious: 0,
    };
  }
  const latencyMs = Math.round(performance.now() - start);
  try {
    const capture = await renderHtml(ctx.browser, html, ctx.axeSource);
    const fidelity = computeFidelity(scenario.data, capture.text);
    return {
      consoleErrors: capture.consoleErrors.length,
      critical: capture.axe.critical,
      fidelityRate: fidelity.rate,
      generationFailed: false,
      latencyMs,
      layout: capture.layout,
      serious: capture.axe.serious,
    };
  } catch (err) {
    return {
      consoleErrors: 0,
      critical: 0,
      error: `render failed: ${String(err)}`,
      fidelityRate: 0,
      generationFailed: false,
      latencyMs,
      layout: EMPTY_LAYOUT,
      serious: 0,
    };
  }
}

function aggregate(scenario: Scenario, records: RunRecord[]): ScenarioResult {
  const criticalCount = records.reduce((a, r) => a + r.critical, 0);
  const fidelityRate = avg(records.map((r) => r.fidelityRate));
  return {
    a11yCriticalSerious: records.reduce(
      (a, r) => a + r.critical + r.serious,
      0
    ),
    consoleErrors: records.reduce((a, r) => a + r.consoleErrors, 0),
    criticalCount,
    fidelityRate,
    id: scenario.id,
    layout: {
      emptyBody: records.some((r) => r.layout.emptyBody),
      horizontalOverflow: records.some((r) => r.layout.horizontalOverflow),
      smallTargets: records.reduce((a, r) => a + r.layout.smallTargets, 0),
    },
    // Deterministic gate, judge off: every data value must render in every run
    // (mean fidelity 100%) and zero axe-core critical violations. Mirrors
    // uivet's default minFidelity=1.0 and maxA11yCritical=0 gates.
    pass: criticalCount === 0 && fidelityRate >= 1,
    runs: records.length,
  };
}

function notRun(model: LeaderboardModel, reason: string): ModelResult {
  return {
    label: model.label,
    meanLatencyMs: null,
    model: model.model,
    provider: model.provider,
    reason,
    scenarios: [],
    scenariosPassed: 0,
    status: "not-run",
  };
}

function makeConfig(model: LeaderboardModel): UivetConfig {
  return {
    generator: {
      kind: "llm-html",
      model: model.model,
      provider: model.provider,
    },
    judge: { mode: "off" },
    scenarios: SCENARIOS,
  };
}

async function evalModel(
  model: LeaderboardModel,
  ctx: Ctx
): Promise<ModelResult> {
  try {
    requireApiKey(model.provider);
  } catch (err) {
    return notRun(model, err instanceof Error ? err.message : String(err));
  }
  const generate = makeGenerator(makeConfig(model));
  const scenarioResults: ScenarioResult[] = [];
  const latencies: number[] = [];
  for (let i = 0; i < SCENARIOS.length; i++) {
    const scenario = SCENARIOS[i];
    const runs = scenario.runs ?? 3;
    const indices = Array.from({ length: runs }, (_, k) => k);
    process.stdout.write(`  ${model.model} :: ${scenario.id} (${runs} runs)\n`);
    // biome-ignore lint/performance/noAwaitInLoops: scenarios run sequentially to share one browser and stream ordered progress
    const records = await mapPool(indices, CONCURRENCY, () =>
      renderOnce(generate, scenario, ctx)
    );
    // A model that rejects every request (bad id, auth) fails generation on the
    // first scenario: record it as not-run and skip the rest instead of burning
    // calls on the remaining scenarios.
    if (i === 0 && records.every((r) => r.generationFailed)) {
      const reason = records.find((r) => r.error)?.error ?? "generation failed";
      return notRun(model, reason);
    }
    for (const r of records) {
      if (!r.generationFailed) {
        latencies.push(r.latencyMs);
      }
    }
    scenarioResults.push(aggregate(scenario, records));
  }
  const scenariosPassed = scenarioResults.filter((s) => s.pass).length;
  return {
    label: model.label,
    meanLatencyMs: latencies.length ? Math.round(avg(latencies)) : null,
    model: model.model,
    provider: model.provider,
    scenarios: scenarioResults,
    scenariosPassed,
    status: "ok",
  };
}

function parseArgs(argv: string[]): Filters {
  const filters: Filters = {};
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--models") {
      const value = argv[i + 1];
      if (value) {
        filters.models = new Set(
          value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        );
      }
      i += 1;
    } else if (arg === "--provider") {
      const value = argv[i + 1];
      if (value !== "google" && value !== "openai") {
        throw new Error(`--provider must be google or openai, got: ${value}`);
      }
      filters.provider = value;
      i += 1;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
    i += 1;
  }
  return filters;
}

function selectModels(filters: Filters): LeaderboardModel[] {
  return MODELS.filter((m) => {
    if (filters.provider && m.provider !== filters.provider) {
      return false;
    }
    if (filters.models && !filters.models.has(m.model)) {
      return false;
    }
    return true;
  });
}

async function loadPrevious(path: string): Promise<Map<string, ModelResult>> {
  const map = new Map<string, ModelResult>();
  if (!existsSync(path)) {
    return map;
  }
  try {
    const prev = JSON.parse(await readFile(path, "utf8")) as {
      models?: ModelResult[];
    };
    for (const m of prev.models ?? []) {
      map.set(m.model, m);
    }
  } catch {
    return new Map();
  }
  return map;
}

function uivetCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: LB_DIR })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

function totalA11y(m: ModelResult): number {
  return m.scenarios.reduce((a, s) => a + s.a11yCriticalSerious, 0);
}

function totalConsole(m: ModelResult): number {
  return m.scenarios.reduce((a, s) => a + s.consoleErrors, 0);
}

function meanFidelity(m: ModelResult): number {
  return m.scenarios.length ? avg(m.scenarios.map((s) => s.fidelityRate)) : 0;
}

function compareModels(a: ModelResult, b: ModelResult): number {
  if (a.scenariosPassed !== b.scenariosPassed) {
    return b.scenariosPassed - a.scenariosPassed;
  }
  const fidelity = meanFidelity(b) - meanFidelity(a);
  if (fidelity !== 0) {
    return fidelity;
  }
  const a11y = totalA11y(a) - totalA11y(b);
  if (a11y !== 0) {
    return a11y;
  }
  return (
    (a.meanLatencyMs ?? Number.POSITIVE_INFINITY) -
    (b.meanLatencyMs ?? Number.POSITIVE_INFINITY)
  );
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function latency(ms: number | null): string {
  return ms === null ? "-" : `${(ms / 1000).toFixed(1)}s`;
}

function summaryTable(ok: ModelResult[], pending: ModelResult[]): string {
  const header =
    "| Rank | Model | Provider | Passed | Mean fidelity | a11y (crit+serious) | Console errors | Mean latency |";
  const divider = "|---:|---|---|---:|---:|---:|---:|---:|";
  const rows = ok.map(
    (m, i) =>
      `| ${i + 1} | ${m.label} | ${m.provider} | ${m.scenariosPassed}/${SCENARIOS.length} | ${pct(meanFidelity(m))} | ${totalA11y(m)} | ${totalConsole(m)} | ${latency(m.meanLatencyMs)} |`
  );
  const pendingRows = pending.map(
    (m) => `| - | ${m.label} | ${m.provider} | pending | - | - | - | - |`
  );
  return [header, divider, ...rows, ...pendingRows].join("\n");
}

function matrixTable(ok: ModelResult[], scenarios: ScenarioMeta[]): string {
  const header = `| Model | ${scenarios.map((s) => s.id).join(" | ")} |`;
  const divider = `|---|${scenarios.map(() => "---").join("|")}|`;
  const rows = ok.map((m) => {
    const cells = scenarios.map((meta) => {
      const s = m.scenarios.find((x) => x.id === meta.id);
      if (!s) {
        return "-";
      }
      return `${s.pass ? "PASS" : "FAIL"} (${pct(s.fidelityRate)})`;
    });
    return `| ${m.label} | ${cells.join(" | ")} |`;
  });
  return [header, divider, ...rows].join("\n");
}

function pendingNote(pending: ModelResult[]): string {
  if (pending.length === 0) {
    return "";
  }
  const byReason = new Map<string, string[]>();
  for (const m of pending) {
    const reason = m.reason ?? "not run";
    const labels = byReason.get(reason) ?? [];
    labels.push(m.label);
    byReason.set(reason, labels);
  }
  const lines = [...byReason.entries()].map(
    ([reason, labels]) => `- ${labels.join(", ")}: ${reason}`
  );
  return `\n### Pending (not run this pass)\n\n${lines.join("\n")}\n`;
}

const METHODOLOGY = `## Methodology

- **Sampling:** N=3 generations per scenario per model, temperature 0. Each
  generation is rendered headless in Chromium (1280x800) and checked.
- **Deterministic checks only.** The judge is off: no LLM grades another LLM.
  Ranking uses only fidelity, axe-core, layout, and console signals.
- **Gate (per scenario), matches uivet's defaults:** a scenario passes iff mean
  fidelity is 100% (every value in the scenario's \`data\` appears verbatim in the
  rendered page text across all runs) **and** there are zero axe-core critical
  violations across all runs.
- **Reported but not gated:** axe-core serious count, layout flags (horizontal
  overflow, empty body, tap targets under 24px), console errors, and mean
  generation latency.
- **Ranking:** scenarios passed (desc), then mean fidelity (desc), then a11y
  critical+serious (asc), then mean latency (asc).
- **Model ids** were verified against the official Google and OpenAI model docs
  on the generation date. Missing an API key leaves a model \`pending\`.

### Reproduce

\`\`\`bash
# full matrix (google filled, openai pending without a key)
bun leaderboard/run.ts

# run halves separately (results.json accumulates across passes)
bun leaderboard/run.ts --provider google
bun leaderboard/run.ts --provider openai
bun leaderboard/run.ts --models gemini-3.5-flash,gpt-5-mini
\`\`\`

Set \`GOOGLE_GENERATIVE_AI_API_KEY\` and/or \`OPENAI_API_KEY\` in the environment.
Raw per-run data is in \`leaderboard/results.json\`.
`;

function buildMarkdown(report: Report): string {
  const ok = report.models.filter((m) => m.status === "ok").sort(compareModels);
  const pending = report.models.filter((m) => m.status !== "ok");
  const [top] = ok;
  const headline = top
    ? `**Top result:** ${top.label} passed ${top.scenariosPassed}/${SCENARIOS.length} scenarios (mean fidelity ${pct(meanFidelity(top))}).`
    : "**No models were run in this pass.**";
  return [
    "# UI Generation Leaderboard",
    "",
    "Which LLM writes correct UI? uivet runs each model through fixed scenarios",
    "and grades the output with deterministic checks only (no LLM judges another",
    "LLM). Rerun on every model release.",
    "",
    `Generated: ${report.generatedAt} - uivet commit \`${report.commit}\` - N=3 runs/scenario, temperature 0.`,
    "",
    headline,
    "",
    "## Ranking",
    "",
    summaryTable(ok, pending),
    pendingNote(pending),
    "## Per-scenario results",
    "",
    matrixTable(ok, report.scenarios),
    "",
    METHODOLOGY,
  ].join("\n");
}

function printConsole(models: ModelResult[]): void {
  const lines = ["", "leaderboard summary:"];
  for (const m of models) {
    lines.push(
      m.status === "ok"
        ? `  ${m.model}: ${m.scenariosPassed}/${SCENARIOS.length} passed`
        : `  ${m.model}: not run (${m.reason ?? "unknown"})`
    );
  }
  lines.push("");
  process.stdout.write(lines.join("\n"));
}

async function main(): Promise<void> {
  const filters = parseArgs(process.argv.slice(2));
  const models = selectModels(filters);
  if (models.length === 0) {
    throw new Error("no models match the given filters");
  }
  const resultsPath = join(LB_DIR, "results.json");
  const previous = await loadPrevious(resultsPath);

  const browser = await launchBrowser();
  const ctx: Ctx = { axeSource: loadAxeSource(), browser };
  try {
    for (const model of models) {
      process.stdout.write(`\nmodel ${model.model} (${model.provider})...\n`);
      // biome-ignore lint/performance/noAwaitInLoops: models run sequentially to share one browser and stream ordered progress
      previous.set(model.model, await evalModel(model, ctx));
    }
  } finally {
    await browser.close();
  }

  // Emit every known model in a stable order; ones never run appear as pending.
  const ordered = MODELS.map(
    (m) => previous.get(m.model) ?? notRun(m, "not run yet")
  );
  const report: Report = {
    commit: uivetCommit(),
    generatedAt: new Date().toISOString(),
    models: ordered,
    scenarios: SCENARIOS.map((s) => ({
      id: s.id,
      prompt: s.prompt,
      runs: s.runs ?? 3,
    })),
  };
  await writeFile(resultsPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(LB_DIR, "LEADERBOARD.md"), buildMarkdown(report));
  printConsole(ordered);
}

main().catch((err) => {
  process.stderr.write(
    `error: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
