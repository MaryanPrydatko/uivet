# UI Generation Leaderboard

Which LLM writes correct UI? uivet runs each model through fixed scenarios
and grades the output with deterministic checks only (no LLM judges another
LLM). Rerun on every model release.

Generated: 2026-07-14T22:52:13.628Z - uivet commit `5c077ed` - N=3 runs/scenario, temperature 0.

**Top result:** GPT-5 passed 5/5 scenarios (mean fidelity 100%).

## Ranking

| Rank | Model | Provider | Passed | Mean fidelity | a11y (crit+serious) | Console errors | Mean latency |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | GPT-5 | openai | 5/5 | 100% | 1 | 0 | 53.2s |
| 2 | Gemini 3.5 Flash | google | 5/5 | 100% | 3 | 0 | 37.0s |
| 3 | Gemini 3.1 Flash-Lite | google | 5/5 | 100% | 6 | 0 | 3.0s |
| 4 | Gemini 2.5 Flash | google | 5/5 | 100% | 17 | 0 | 23.7s |
| 5 | GPT-5 mini | openai | 4/5 | 100% | 6 | 0 | 35.4s |
| 6 | GPT-4.1 nano | openai | 4/5 | 100% | 10 | 0 | 8.5s |

## Per-scenario results

| Model | flight-results | expense-form | metrics-dashboard | pricing-table | settings-form |
|---|---|---|---|---|---|
| GPT-5 | PASS (100%) | PASS (100%) | PASS (100%) | PASS (100%) | PASS (100%) |
| Gemini 3.5 Flash | PASS (100%) | PASS (100%) | PASS (100%) | PASS (100%) | PASS (100%) |
| Gemini 3.1 Flash-Lite | PASS (100%) | PASS (100%) | PASS (100%) | PASS (100%) | PASS (100%) |
| Gemini 2.5 Flash | PASS (100%) | PASS (100%) | PASS (100%) | PASS (100%) | PASS (100%) |
| GPT-5 mini | FAIL (100%) | PASS (100%) | PASS (100%) | PASS (100%) | PASS (100%) |
| GPT-4.1 nano | PASS (100%) | PASS (100%) | PASS (100%) | PASS (100%) | FAIL (100%) |

## Methodology

- **Sampling:** N=3 generations per scenario per model, temperature 0. Each
  generation is rendered headless in Chromium (1280x800) and checked.
- **Deterministic checks only.** The judge is off: no LLM grades another LLM.
  Ranking uses only fidelity, axe-core, layout, and console signals.
- **Gate (per scenario), matches uivet's defaults:** a scenario passes iff mean
  fidelity is 100% (every value in the scenario's `data` appears verbatim in the
  rendered page text across all runs) **and** there are zero axe-core critical
  violations across all runs.
- **Reported but not gated:** axe-core serious count, layout flags (horizontal
  overflow, empty body, tap targets under 24px), console errors, and mean
  generation latency.
- **Ranking:** scenarios passed (desc), then mean fidelity (desc), then a11y
  critical+serious (asc), then mean latency (asc).
- **Model ids** were verified against the official Google and OpenAI model docs
  on the generation date. Missing an API key leaves a model `pending`.

### Reproduce

```bash
# full matrix (google filled, openai pending without a key)
bun leaderboard/run.ts

# run halves separately (results.json accumulates across passes)
bun leaderboard/run.ts --provider google
bun leaderboard/run.ts --provider openai
bun leaderboard/run.ts --models gemini-3.5-flash,gpt-5-mini
```

Set `GOOGLE_GENERATIVE_AI_API_KEY` and/or `OPENAI_API_KEY` in the environment.
Raw per-run data is in `leaderboard/results.json`.
