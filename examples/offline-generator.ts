import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Scenario } from "../src/types.ts";

// Offline generator: replays the recorded generations in examples/fixtures/<id>/
// so the demo runs with no network calls and no API key. Satisfies the
// module-generator contract in src/generator.ts (export generate(scenario)).

const here = dirname(fileURLToPath(import.meta.url));
const cache: Record<string, string[]> = {};
const counters: Record<string, number> = {};

function fixtures(id: string): string[] {
  const existing = cache[id];
  if (existing) {
    return existing;
  }
  const dir = join(here, "fixtures", id);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".html"))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"));
  cache[id] = files;
  return files;
}

export function generate(scenario: Scenario): Promise<string> {
  const files = fixtures(scenario.id);
  if (files.length === 0) {
    throw new Error(`No recorded fixtures for scenario "${scenario.id}"`);
  }
  const i = counters[scenario.id] ?? 0;
  counters[scenario.id] = i + 1;
  return Promise.resolve(files[i % files.length] as string);
}
