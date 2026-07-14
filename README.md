# uivet

uivet is a test and eval harness for generative UI. It generates an LLM-rendered interface N times per scenario, renders each one in headless Chromium, runs deterministic checks plus an LLM judge, computes how consistent the outputs are, and gates the results against a saved baseline so nondeterministic UI can be tested in CI.

## Why

Teams are starting to ship UI that an LLM produces at request time, and there is no test story for it. Visual regression tools assume the UI comes from deterministic code, so a fresh render that differs on every run defeats them. LLM eval frameworks judge text answers, not the pixels and DOM of a rendered interface. uivet fills that gap: it treats each generation as a sample, measures spread across samples, and checks the rendered result, not just the model output string.

## Quickstart

```bash
bun install
bunx playwright install chromium
export GOOGLE_GENERATIVE_AI_API_KEY=your_key
bun run demo
```

`bun run demo` runs three example scenarios (flight results, expense form, metrics dashboard) three times each and writes a report you can open in a browser.

Run your own config:

```bash
bun run src/cli.ts run --config uivet.config.ts
bun run src/cli.ts run --save-baseline        # record a baseline
bun run src/cli.ts run                          # later runs compare to it
```

Exit code is 1 if any gate fails or a regression is detected, else 0, so it drops into CI as is.

## Config reference

`uivet.config.ts` default-exports a `UivetConfig`:

```ts
interface UivetConfig {
  scenarios: {
    id: string
    prompt: string      // what the UI should do
    data?: unknown       // JSON the UI must display faithfully
    runs?: number        // samples per scenario, default 3
  }[]
  generator?:
    | { kind: "gemini-html"; model?: string }   // default, model default gemini-2.5-flash
    | { kind: "module"; path: string }           // module exporting generate(scenario): Promise<string>
  judge?: { model?: string; rubric?: string[] }  // default rubric: task fit, usability, visual quality
  gates?: {
    minJudgeScore?: number   // default 6   (mean overall, 1-10)
    maxA11yCritical?: number // default 0   (summed critical axe rules across runs)
    minFidelity?: number     // default 1.0 (fraction of data values rendered)
    maxScoreStdDev?: number  // default 1.5 (consistency of judge scores)
  }
}
```

The `module` generator lets you point uivet at your own generation code (any model, any framework) as long as it returns a full HTML document.

## How each check works

- **Generation.** For the builtin generator, uivet asks Gemini for one complete self-contained HTML document (inline CSS, no external resources) implementing the prompt for the data, and strips markdown fences if present. Generation latency is recorded per run.
- **Render.** Each document is loaded with Playwright at 1280x800 via `setContent`, waiting for network idle up to a 3s cap. uivet captures a full-page PNG, the page text, and console plus page errors.
- **Accessibility.** The axe-core source is injected into the page and `axe.run` is executed. Violations are grouped by impact; critical and serious counts feed the a11y gate.
- **Fidelity.** Every leaf string and number in `scenario.data` is collected recursively and searched for in the page text after whitespace and case normalization. Numbers also match thousands-separated variants. Fidelity is the fraction found; missing values are listed.
- **Layout.** uivet flags horizontal overflow (`scrollWidth > clientWidth`), counts interactive elements smaller than 24x24, and detects an empty body.
- **Judge.** The screenshot plus the prompt and data go to Gemini at temperature 0, which returns strict JSON with a 1-10 score per rubric item, an overall score, and a short rationale. One retry on a parse failure.
- **Aggregate and gate.** Per scenario uivet computes mean/min/max overall, the score standard deviation (consistency), the fidelity rate, and total critical plus serious a11y issues, then evaluates each gate.
- **Baseline.** `--save-baseline` records per-scenario mean, fidelity, and a11y rule ids. Later runs flag a regression when mean overall drops more than 1.0, the fidelity rate drops, or a new a11y rule id appears.

## Output

Each run writes to `results/<timestamp>/`:

- `results.json` - every scenario, run, metric, and judge rationale.
- `report.html` - a single self-contained file (screenshots inlined) with run cards, aggregate metrics, gate chips, judge rationales, axe violations, missing fidelity values, and baseline deltas. Works in light and dark.

## Limitations

- Single viewport (1280x800). Responsive behavior is not tested.
- Fidelity is substring matching, so a value rendered inside a larger token can register as present and formatting-only differences may pass or fail imprecisely.
- The judge is subjective. Research on UI quality rating shows designer agreement around kappa 0.25, so a single judge score is a weak signal; consistency across runs and the deterministic checks matter more.
- English only. Normalization and the judge prompt assume English text.

## Roadmap

- Schema validation for structured UI protocols (A2UI, MCP Apps) instead of only free-form HTML.
- Runtime sampling and monitoring of production generations, not just offline scenarios.
- Multi-viewport rendering and responsive checks.
- Per-team calibrated rubrics and judge ensembles to raise agreement above a single-judge baseline.
