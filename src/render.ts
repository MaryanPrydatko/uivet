import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Browser } from "playwright";
import { chromium } from "playwright";
import type { AxeResult, AxeViolation, LayoutResult } from "./types.ts";

export interface RenderCapture {
  axe: AxeResult;
  consoleErrors: string[];
  layout: LayoutResult;
  screenshot: string;
  text: string;
}

export function loadAxeSource(): string {
  const require = createRequire(import.meta.url);
  const entry = require.resolve("axe-core");
  return readFileSync(join(dirname(entry), "axe.min.js"), "utf8");
}

export function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

function summarizeAxe(raw: AxeViolation[]): AxeResult {
  let critical = 0;
  let serious = 0;
  for (const v of raw) {
    if (v.impact === "critical") {
      critical += 1;
    } else if (v.impact === "serious") {
      serious += 1;
    }
  }
  return {
    critical,
    ruleIds: raw.map((v) => v.id).sort((a, b) => a.localeCompare(b)),
    serious,
    violations: raw,
  };
}

export async function renderHtml(
  browser: Browser,
  html: string,
  axeSource: string
): Promise<RenderCapture> {
  const context = await browser.newContext({
    viewport: { height: 800, width: 1280 },
  });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));
  try {
    await page
      .setContent(html, { timeout: 3000, waitUntil: "networkidle" })
      .catch(() => undefined);
    const text = await page.evaluate(() => document.body?.innerText ?? "");
    const layout = await page.evaluate((): LayoutResult => {
      const de = document.documentElement;
      const { body } = document;
      const horizontalOverflow =
        de.scrollWidth > de.clientWidth ||
        (body ? body.scrollWidth > body.clientWidth : false);
      const nodes = Array.from(
        document.querySelectorAll("a, button, input, select, [role=button]")
      );
      let smallTargets = 0;
      for (const node of nodes) {
        const r = (node as HTMLElement).getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24)) {
          smallTargets += 1;
        }
      }
      const emptyBody = !body || body.innerText.trim().length === 0;
      return { emptyBody, horizontalOverflow, smallTargets };
    });
    await page.addScriptTag({ content: axeSource });
    const violations = await page.evaluate(
      async (): Promise<AxeViolation[]> => {
        const { axe } = window as unknown as {
          axe: {
            run: (
              context: Document,
              options: { resultTypes: string[] }
            ) => Promise<{ violations: unknown[] }>;
          };
        };
        const result = await axe.run(document, { resultTypes: ["violations"] });
        return (
          result.violations as {
            id: string;
            impact: string;
            description: string;
            nodes: unknown[];
          }[]
        ).map((v) => ({
          description: v.description ?? "",
          id: v.id,
          impact: v.impact ?? "minor",
          nodes: v.nodes.length,
        }));
      }
    );
    const buffer = await page.screenshot({ fullPage: true });
    return {
      axe: summarizeAxe(violations),
      consoleErrors,
      layout,
      screenshot: buffer.toString("base64"),
      text,
    };
  } finally {
    await context.close();
  }
}
