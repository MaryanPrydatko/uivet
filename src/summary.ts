import { round } from "./util.ts"
import type { ScenarioAggregate } from "./types.ts"

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length)
}

export function printSummary(results: ScenarioAggregate[], out: string, hasBaseline: boolean): void {
  const cols: [string, number][] = [
    ["scenario", 20],
    ["mean", 6],
    ["min-max", 9],
    ["stddev", 7],
    ["fidelity", 9],
    ["a11y c+s", 9],
    ["gate", 6],
  ]
  const header = cols.map(([name, w]) => pad(name, w)).join("  ")
  const lines: string[] = ["", header, "-".repeat(header.length)]
  for (const r of results) {
    const mean = r.meanOverall === null ? "-" : String(round(r.meanOverall))
    const minMax =
      r.minOverall === null || r.maxOverall === null
        ? "-"
        : `${round(r.minOverall)}-${round(r.maxOverall)}`
    const stddev = r.scoreStdDev === null ? "-" : String(round(r.scoreStdDev))
    const cells = [
      pad(r.id, 20),
      pad(mean, 6),
      pad(minMax, 9),
      pad(stddev, 7),
      pad(`${Math.round(r.fidelityRate * 100)}%`, 9),
      pad(String(r.a11yCriticalSerious), 9),
      pad(r.pass ? "PASS" : "FAIL", 6),
    ]
    lines.push(cells.join("  "))
    for (const g of r.gates.filter((x) => !x.pass)) {
      lines.push(`  fail: ${g.name} (${g.detail})`)
    }
    for (const reg of r.regressions) {
      lines.push(`  regression: ${reg}`)
    }
  }
  const anyFail = results.some((r) => !r.pass || r.regressions.length > 0)
  lines.push("")
  lines.push(`baseline: ${hasBaseline ? "compared" : "none"}`)
  lines.push(`result: ${anyFail ? "FAIL" : "PASS"}  (exit ${anyFail ? 1 : 0})`)
  lines.push(`output: ${out}`)
  lines.push("")
  process.stdout.write(lines.join("\n"))
}
