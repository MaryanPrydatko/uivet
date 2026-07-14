# Contributing

Thanks for your interest. The fastest ways to help:

- Try the offline demo (`bun install && bunx playwright install chromium && bun run demo:offline`) and file an issue for anything rough.
- Framework adapters: anything that turns your generation pipeline into a `generate(scenario): Promise<string>` module is a useful example.
- Pick up an issue labeled `good first issue`.

Before a PR: `bun run lint` and `bunx tsc --noEmit` must pass, and `bun run demo:offline` must exit 0.
Keep PRs small and focused. No new dependencies without discussion.
