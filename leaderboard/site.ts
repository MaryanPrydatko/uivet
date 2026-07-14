// Generates docs/leaderboard.html from leaderboard/results.json.
// Rerun after every leaderboard pass: bun leaderboard/site.ts
import { readFile, writeFile } from "node:fs/promises";

interface ScenarioRow {
  a11yCriticalSerious: number;
  consoleErrors: number;
  criticalCount: number;
  fidelityRate: number;
  id: string;
  pass: boolean;
  runs: number;
}

interface ModelRow {
  label: string;
  meanLatencyMs?: number;
  model: string;
  provider: string;
  reason?: string;
  scenarios?: ScenarioRow[];
  scenariosPassed?: number;
  status: string;
}

interface Results {
  commit: string;
  generatedAt: string;
  models: ModelRow[];
}

const results = JSON.parse(
  await readFile(new URL("results.json", import.meta.url).pathname, "utf8")
) as Results;

const ran = results.models.filter((m) => m.status === "ok");
const pending = results.models.filter((m) => m.status !== "ok");
const scen = (m: ModelRow | undefined) => m?.scenarios ?? [];
const scenarioIds = scen(ran.at(0)).map((s) => s.id);

const fmtLatency = (ms?: number) =>
  ms === undefined ? "-" : `${(ms / 1000).toFixed(1)}s`;
const fidelity = (m: ModelRow) => {
  const rates = scen(m).map((s) => s.fidelityRate);
  if (rates.length === 0) {
    return "-";
  }
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  return `${Math.round(mean * 100)}%`;
};
const a11y = (m: ModelRow) =>
  (m.scenarios ?? []).reduce((a, s) => a + s.a11yCriticalSerious, 0);

const rankedRows = ran
  .map(
    (m, i) => `<tr>
  <td class="rank">${i + 1}</td>
  <td class="model">${m.label}<span class="mid">${m.model}</span></td>
  <td>${m.provider}</td>
  <td class="pass">${m.scenariosPassed}/${scenarioIds.length}</td>
  <td>${fidelity(m)}</td>
  <td>${a11y(m)}</td>
  <td>${fmtLatency(m.meanLatencyMs)}</td>
</tr>`
  )
  .join("\n");

const pendingRows = pending
  .map(
    (m) => `<tr class="pending">
  <td class="rank">-</td>
  <td class="model">${m.label}<span class="mid">${m.model}</span></td>
  <td>${m.provider}</td>
  <td colspan="4">pending: ${m.reason ?? "not run"}</td>
</tr>`
  )
  .join("\n");

const perScenario = ran
  .map(
    (m) =>
      `<tr><td class="model">${m.label}</td>${(m.scenarios ?? [])
        .map(
          (s) =>
            `<td class="${s.pass ? "ok" : "bad"}">${s.pass ? "PASS" : "FAIL"} <span class="mid">${Math.round(s.fidelityRate * 100)}%</span></td>`
        )
        .join("")}</tr>`
  )
  .join("\n");

const generated = results.generatedAt.slice(0, 10);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>UI generation leaderboard: which LLM writes correct UI?</title>
<meta name="description" content="uivet runs each model through fixed UI scenarios and grades the rendered output with deterministic checks only. No LLM judges another LLM." />
<meta property="og:title" content="Which LLM writes correct UI?" />
<meta property="og:description" content="Deterministic pass rates for LLM-generated interfaces: data fidelity, axe-core accessibility, layout, console errors. Rerun on every model release." />
<meta property="og:image" content="https://maryanprydatko.github.io/uivet/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" type="image/svg+xml" href="logo.svg" />
<style>
  :root {
    --ground: #050607; --raised: #0E1012; --hair: #1F2427;
    --headline: #F5F7F8; --body: #C6CDD4; --muted: #7E8B96;
    --accent: #3FB6C0; --pass: #3ECF7A; --fail: #F87171;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  }
  * { box-sizing: border-box; margin: 0; }
  body { background: var(--ground); color: var(--body); font-family: var(--sans); line-height: 1.55; }
  .wrap { max-width: 880px; margin: 0 auto; padding: 0 24px; }
  nav { border-bottom: 1px solid var(--hair); }
  .nav-inner { display: flex; align-items: center; justify-content: space-between; height: 58px; }
  .wordmark { display: inline-flex; align-items: center; gap: 8px; font-family: var(--mono); font-size: 15px; color: var(--headline); text-decoration: none; }
  .nav-links a { color: var(--muted); text-decoration: none; font-size: 14px; margin-left: 22px; }
  .nav-links a:hover { color: var(--headline); }
  header { padding: 56px 0 8px; }
  h1 { color: var(--headline); font-size: 34px; letter-spacing: -0.02em; text-wrap: balance; }
  .sub { margin-top: 12px; max-width: 62ch; }
  .meta { font-family: var(--mono); font-size: 12px; color: var(--muted); margin-top: 14px; }
  section { padding: 28px 0; }
  h2 { color: var(--headline); font-size: 18px; margin-bottom: 12px; }
  .tablewrap { overflow-x: auto; border: 1px solid var(--hair); background: var(--raised); }
  table { border-collapse: collapse; width: 100%; font-size: 14px; font-variant-numeric: tabular-nums; }
  th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid var(--hair); white-space: nowrap; }
  th { font-family: var(--mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 500; }
  tr:last-child td { border-bottom: none; }
  .rank { font-family: var(--mono); color: var(--muted); }
  .model { color: var(--headline); }
  .mid { display: block; font-family: var(--mono); font-size: 11px; color: var(--muted); }
  .pass { color: var(--pass); font-family: var(--mono); }
  .ok { color: var(--pass); font-family: var(--mono); font-size: 13px; }
  .bad { color: var(--fail); font-family: var(--mono); font-size: 13px; }
  .pending td { color: var(--muted); }
  ul { padding-left: 20px; display: grid; gap: 6px; }
  a { color: var(--accent); }
  footer { border-top: 1px solid var(--hair); margin-top: 40px; padding: 24px 0 48px; font-size: 13px; color: var(--muted); }
</style>
</head>
<body>
<nav><div class="wrap nav-inner">
  <a class="wordmark" href="index.html"><svg viewBox="0 0 64 64" width="18" height="18" aria-hidden="true"><path d="M8 42V8h36v8" fill="none" stroke="#6ee7b7" stroke-width="6"/><path d="M20 20h36v36H20zM20 31h36" fill="none" stroke="#e9f5ef" stroke-width="6"/><path d="m30 43 6 6 11-12" fill="none" stroke="#6ee7b7" stroke-width="6" stroke-linecap="square"/></svg>uivet</a>
  <div class="nav-links">
    <a href="https://github.com/MaryanPrydatko/uivet">GitHub</a>
    <a href="index.html">Home</a>
  </div>
</div></nav>

<header class="wrap">
  <h1>Which LLM writes correct UI?</h1>
  <p class="sub">Each model generates the same ${scenarioIds.length} interfaces, sampled 3 times each, rendered in headless Chromium, and graded with deterministic checks only: data fidelity, axe-core accessibility, layout, console errors. No LLM judges another LLM. Rerun on every model release.</p>
  <p class="meta">generated ${generated} &middot; uivet ${results.commit} &middot; N=3 runs/scenario &middot; temperature 0</p>
</header>

<section class="wrap">
  <h2>Ranking</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>#</th><th>Model</th><th>Provider</th><th>Passed</th><th>Fidelity</th><th>A11y crit+serious</th><th>Latency</th></tr></thead>
    <tbody>
${rankedRows}
${pendingRows}
    </tbody>
  </table></div>
</section>

<section class="wrap">
  <h2>Per scenario</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Model</th>${scenarioIds.map((id) => `<th>${id}</th>`).join("")}</tr></thead>
    <tbody>
${perScenario}
    </tbody>
  </table></div>
</section>

<section class="wrap">
  <h2>Method</h2>
  <ul>
    <li>A scenario passes iff mean fidelity is 100% (every value in the scenario data appears in the rendered page text across all runs) and there are zero axe-core critical violations.</li>
    <li>Reported, not gated: serious axe violations, layout flags, console errors, mean generation latency.</li>
    <li>Ranking: scenarios passed, then fidelity, then a11y critical+serious, then latency.</li>
    <li>Raw per-run data: <a href="https://github.com/MaryanPrydatko/uivet/blob/main/leaderboard/results.json">results.json</a>. Reproduce: <code>bun leaderboard/run.ts</code>.</li>
  </ul>
</section>

<footer><div class="wrap">
  Built with <a href="https://github.com/MaryanPrydatko/uivet">uivet</a>, an MIT-licensed CI test harness for LLM-generated UI. The judge stays off here: only deterministic checks rank models.
</div></footer>
</body>
</html>
`;

await writeFile(
  new URL("../docs/leaderboard.html", import.meta.url).pathname,
  html
);
process.stdout.write("wrote docs/leaderboard.html\n");
