import type {
  AxeViolation,
  Baseline,
  RunResult,
  ScenarioAggregate,
} from "./types.ts";
import { round, uniq } from "./util.ts";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Tone = "pass" | "warn" | "fail" | "skip";

function chip(tone: Tone, label: string): string {
  return `<span class="chip ${tone}">${esc(label)}</span>`;
}

function metric(label: string, value: string): string {
  return `<div class="metric"><span class="mlabel">${esc(label)}</span><span class="mvalue">${esc(value)}</span></div>`;
}

function unionViolations(runs: RunResult[]): AxeViolation[] {
  const byId = new Map<string, AxeViolation>();
  for (const run of runs) {
    for (const v of run.axe.violations) {
      const prev = byId.get(v.id);
      if (!prev || v.nodes > prev.nodes) {
        byId.set(v.id, v);
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function runCard(run: RunResult): string {
  const thumb = run.screenshot
    ? `<img class="shot" alt="run ${run.index + 1} screenshot" src="data:image/png;base64,${run.screenshot}" />`
    : `<div class="shot empty">no render</div>`;
  const missing = run.fidelity.missing.length
    ? `<div class="missing">missing: ${esc(run.fidelity.missing.slice(0, 8).join(", "))}</div>`
    : "";
  const errs = run.consoleErrors.length
    ? `<div class="warnrow">console errors: ${run.consoleErrors.length}</div>`
    : "";
  const err = run.error ? `<div class="warnrow">${esc(run.error)}</div>` : "";
  const score = run.judge
    ? `<span class="score">${round(run.judge.overall)}/10</span>`
    : "";
  const rationale = run.judge
    ? `<p class="rationale">${esc(run.judge.rationale)}</p>`
    : "";
  return `<div class="card">
      ${thumb}
      <div class="cardbody">
        <div class="cardhead"><span class="num">#${run.index + 1}</span>${score}</div>
        <div class="kv"><span>latency</span><span class="num">${run.latencyMs} ms</span></div>
        <div class="kv"><span>fidelity</span><span class="num">${run.fidelity.found}/${run.fidelity.total}</span></div>
        <div class="kv"><span>a11y c/s</span><span class="num">${run.axe.critical}/${run.axe.serious}</span></div>
        ${errs}${err}
        ${rationale}
        ${missing}
      </div>
    </div>`;
}

function baselineDeltas(
  agg: ScenarioAggregate,
  baseline: Baseline | undefined
): string {
  const prev = baseline?.scenarios[agg.id];
  if (!prev) {
    return "";
  }
  const dFid = round(agg.fidelityRate - prev.fidelityRate);
  const sign = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);
  const meanCell =
    agg.meanOverall === null
      ? metric("baseline mean", `${round(prev.meanOverall)} (-)`)
      : metric(
          "baseline mean",
          `${round(prev.meanOverall)} (${sign(round(agg.meanOverall - prev.meanOverall))})`
        );
  return `<div class="deltas">${meanCell}${metric(
    "baseline fidelity",
    `${round(prev.fidelityRate)} (${sign(dFid)})`
  )}</div>`;
}

function gateTone(g: {
  advisory?: boolean;
  pass: boolean;
  skipped?: boolean;
}): Tone {
  if (g.skipped) {
    return "skip";
  }
  if (g.pass) {
    return "pass";
  }
  return g.advisory ? "warn" : "fail";
}

function scenarioSection(
  agg: ScenarioAggregate,
  baseline: Baseline | undefined
): string {
  const gates = agg.gates
    .map((g) => chip(gateTone(g), `${g.name}: ${g.detail}`))
    .join("");
  const regs = agg.regressions
    .map((r) =>
      chip(
        r.advisory ? "warn" : "fail",
        `${r.advisory ? "warn" : "regression"}: ${r.detail}`
      )
    )
    .join("");
  const violations = unionViolations(agg.runs);
  const vhtml = violations.length
    ? `<ul class="axe">${violations
        .map(
          (v) =>
            `<li><span class="chip ${v.impact === "critical" ? "fail" : "warn"}">${esc(v.impact)}</span> <span class="num">${esc(v.id)}</span> ${esc(v.description)} (${v.nodes})</li>`
        )
        .join("")}</ul>`
    : `<p class="ok">no axe violations</p>`;
  const missing = uniq(agg.runs.flatMap((r) => r.fidelity.missing));
  const missHtml = missing.length
    ? `<div class="missblock"><strong>missing values across runs:</strong> ${esc(missing.join(", "))}</div>`
    : "";
  return `<section class="scenario">
    <h2>${esc(agg.id)} <span class="status ${agg.pass ? "pass" : "fail"}">${agg.pass ? "PASS" : "FAIL"}</span></h2>
    <p class="prompt">${esc(agg.prompt)}</p>
    <div class="chips">${gates}${regs}</div>
    <div class="metrics">
      ${metric("mean", agg.meanOverall === null ? "-" : String(round(agg.meanOverall)))}
      ${metric(
        "min-max",
        agg.minOverall === null || agg.maxOverall === null
          ? "-"
          : `${round(agg.minOverall)}-${round(agg.maxOverall)}`
      )}
      ${metric("stddev", agg.scoreStdDev === null ? "-" : String(round(agg.scoreStdDev)))}
      ${metric("fidelity", `${Math.round(agg.fidelityRate * 100)}%`)}
      ${metric("a11y c+s", String(agg.a11yCriticalSerious))}
    </div>
    ${baselineDeltas(agg, baseline)}
    <div class="cards">${agg.runs.map(runCard).join("")}</div>
    <details open><summary>axe violations</summary>${vhtml}</details>
    ${missHtml}
  </section>`;
}

const STYLE = `:root{--bg:#ffffff;--panel:#f6f7f9;--fg:#1a1d21;--muted:#5c636e;--line:#e3e6ea;--pass:#137a3f;--passbg:#e4f4ea;--warn:#8a5a00;--warnbg:#fdf1d6;--fail:#b0242a;--failbg:#fbe6e6}
@media(prefers-color-scheme:dark){:root{--bg:#0f1216;--panel:#171b21;--fg:#e6e9ee;--muted:#9aa3af;--line:#262c34;--pass:#57c98a;--passbg:#12301f;--warn:#e0b25a;--warnbg:#332612;--fail:#f08a8f;--failbg:#341417}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5}
.wrap{max-width:1040px;margin:0 auto;padding:32px 20px}
.num,.mvalue,.score{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
header h1{margin:0 0 4px;font-size:22px}
header .sub{color:var(--muted);font-size:13px}
.banner{margin:16px 0 8px;padding:10px 14px;border-radius:10px;border:1px solid var(--line);background:var(--panel);font-size:14px}
.scenario{border:1px solid var(--line);border-radius:12px;padding:18px;margin:18px 0;background:var(--panel)}
.scenario h2{font-size:17px;margin:0 0 4px;display:flex;align-items:center;gap:10px}
.prompt{color:var(--muted);margin:0 0 12px;font-size:13px}
.status{font-size:11px;padding:2px 8px;border-radius:999px}
.status.pass{background:var(--passbg);color:var(--pass)}
.status.fail{background:var(--failbg);color:var(--fail)}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.chip{font-size:11px;padding:3px 8px;border-radius:999px;font-family:ui-monospace,monospace}
.chip.pass{background:var(--passbg);color:var(--pass)}
.chip.warn{background:var(--warnbg);color:var(--warn)}
.chip.fail{background:var(--failbg);color:var(--fail)}
.chip.skip{background:var(--panel);color:var(--muted);border:1px solid var(--line)}
.metrics,.deltas{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px}
.metric{border:1px solid var(--line);border-radius:8px;padding:6px 10px;background:var(--bg);min-width:96px}
.mlabel{display:block;font-size:11px;color:var(--muted)}
.mvalue{font-size:16px}
.cards{display:flex;flex-wrap:wrap;gap:12px;margin:4px 0 14px}
.card{border:1px solid var(--line);border-radius:10px;overflow:hidden;width:230px;background:var(--bg)}
.shot{display:block;width:100%;height:150px;object-fit:cover;object-position:top;border-bottom:1px solid var(--line)}
.shot.empty{display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:12px;height:150px}
.cardbody{padding:10px}
.cardhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.cardhead .num{color:var(--muted);font-size:12px}
.score{font-size:15px}
.kv{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin:2px 0}
.rationale{font-size:12px;margin:8px 0 4px}
.missing,.warnrow{font-size:11px;color:var(--warn)}
details{border-top:1px solid var(--line);padding-top:8px}
summary{cursor:pointer;font-size:13px;font-weight:600}
.axe{margin:8px 0;padding-left:18px;font-size:12px}
.axe li{margin:4px 0}
.ok{color:var(--pass);font-size:13px}
.missblock{font-size:12px;margin-top:10px;color:var(--fail)}`;

export function buildReport(
  results: ScenarioAggregate[],
  baseline: Baseline | undefined,
  createdAt: string
): string {
  const passCount = results.filter(
    (r) => r.gates.every((g) => g.pass) && r.regressions.length === 0
  ).length;
  const regressed = results.filter((r) => r.regressions.length > 0).length;
  const banner = `${passCount}/${results.length} scenarios clean${
    baseline ? ` (baseline compared, ${regressed} with regressions)` : ""
  }`;
  const sections = results.map((r) => scenarioSection(r, baseline)).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>uivet report</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>uivet report</h1>
  <div class="sub">generated ${esc(createdAt)}</div>
</header>
<div class="banner">${esc(banner)}</div>
${sections}
</div>
</body>
</html>`;
}
