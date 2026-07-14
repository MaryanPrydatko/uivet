#!/usr/bin/env bun
import type { RunOptions } from "./run.ts";
import { runCommand } from "./run.ts";

const USAGE = `uivet - test and eval harness for LLM-generated UI

usage:
  uivet run [--config path] [--save-baseline] [--out dir]

options:
  --config <path>    config file (default uivet.config.ts)
  --out <dir>        output directory (default results/<timestamp>)
  --save-baseline    write baseline.json next to the output dir
`;

function parseRun(argv: string[]): RunOptions {
  const options: RunOptions = {
    config: "uivet.config.ts",
    saveBaseline: false,
  };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--config") {
      options.config = argv[i + 1] ?? options.config;
      i += 1;
    } else if (arg === "--out") {
      options.out = argv[i + 1];
      i += 1;
    } else if (arg === "--save-baseline") {
      options.saveBaseline = true;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
    i += 1;
  }
  return options;
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== "run") {
    process.stdout.write(USAGE);
    process.exit(command ? 1 : 0);
  }
  const code = await runCommand(parseRun(rest));
  process.exit(code);
}

main().catch((err) => {
  process.stderr.write(
    `error: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(2);
});
