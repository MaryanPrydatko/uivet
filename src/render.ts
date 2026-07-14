import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { chromium } from "playwright"
import type { Browser } from "playwright"
import type { AxeResult, AxeViolation, LayoutResult } from "./types.ts"

export interface RenderCapture {
  screenshot: string
  text: string
  consoleErrors: string[]
  layout: LayoutResult
  axe: AxeResult
}

export function loadAxeSource(): string {
  const require = createRequire(import.meta.url)
  const entry = require.resolve("axe-core")
  return readFileSync(join(dirname(entry), "axe.min.js"), "utf8")
}

export function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true })
}

function summarizeAxe(raw: AxeViolation[]): AxeResult {
  let critical = 0
  let serious = 0
  for (const v of raw) {
    if (v.impact === "critical") critical += 1
    else if (v.impact === "serious") serious += 1
  }
  return { critical, serious, ruleIds: raw.map((v) => v.id).sort(), violations: raw }
}

export async function renderHtml(
  browser: Browser,
  html: string,
  axeSource: string,
): Promise<RenderCapture> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  const consoleErrors: string[] = []
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text())
  })
  page.on("pageerror", (err) => consoleErrors.push(err.message))
  try {
    await page
      .setContent(html, { waitUntil: "networkidle", timeout: 3000 })
      .catch(() => undefined)
    const text = await page.evaluate(() => document.body?.innerText ?? "")
    const layout = await page.evaluate((): LayoutResult => {
      const de = document.documentElement
      const body = document.body
      const horizontalOverflow =
        de.scrollWidth > de.clientWidth ||
        (body ? body.scrollWidth > body.clientWidth : false)
      const nodes = Array.from(
        document.querySelectorAll("a, button, input, select, [role=button]"),
      )
      let smallTargets = 0
      for (const node of nodes) {
        const r = (node as HTMLElement).getBoundingClientRect()
        if (r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24)) smallTargets += 1
      }
      const emptyBody = !body || body.innerText.trim().length === 0
      return { horizontalOverflow, smallTargets, emptyBody }
    })
    await page.addScriptTag({ content: axeSource })
    const violations = await page.evaluate(async (): Promise<AxeViolation[]> => {
      const axe = (window as unknown as { axe: { run: Function } }).axe
      const result = await axe.run(document, { resultTypes: ["violations"] })
      return (result.violations as { id: string; impact: string; description: string; nodes: unknown[] }[]).map(
        (v) => ({
          id: v.id,
          impact: v.impact ?? "minor",
          description: v.description ?? "",
          nodes: v.nodes.length,
        }),
      )
    })
    const buffer = await page.screenshot({ fullPage: true })
    return {
      screenshot: buffer.toString("base64"),
      text,
      consoleErrors,
      layout,
      axe: summarizeAxe(violations),
    }
  } finally {
    await context.close()
  }
}
