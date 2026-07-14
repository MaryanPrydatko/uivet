import { resolve } from "node:path"
import { DEFAULT_MODEL, generateContent } from "./gemini.ts"
import type { Scenario, UivetConfig } from "./types.ts"

export type Generate = (scenario: Scenario) => Promise<string>

export function stripFences(raw: string): string {
  const s = raw.trim()
  const fenced = s.match(/```(?:html)?\s*\n?([\s\S]*?)\n?```/i)
  if (fenced?.[1]) return fenced[1].trim()
  return s.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim()
}

function buildPrompt(scenario: Scenario): string {
  const data =
    scenario.data === undefined ? "(none)" : JSON.stringify(scenario.data, null, 2)
  return [
    "You are a senior frontend engineer. Produce one complete, self-contained HTML document that implements the UI below.",
    "",
    `Task: ${scenario.prompt}`,
    "",
    "Data to display faithfully (render every value exactly as given):",
    data,
    "",
    "Requirements:",
    "- Return a single full HTML document that starts with <!doctype html>.",
    "- Inline all CSS in a <style> tag. No external resources, scripts, fonts, or images.",
    "- Show all provided data values verbatim, including currency and special characters.",
    "- Use semantic, accessible markup with sufficient color contrast and a page title.",
    "Return only the HTML with no explanation and no markdown fences.",
  ].join("\n")
}

async function generateHtml(model: string, scenario: Scenario): Promise<string> {
  const raw = await generateContent(model, {
    contents: [{ parts: [{ text: buildPrompt(scenario) }] }],
    generationConfig: { temperature: 0 },
  })
  return stripFences(raw)
}

export function makeGenerator(config: UivetConfig): Generate {
  const gen = config.generator ?? { kind: "gemini-html" }
  if (gen.kind === "module") {
    const abs = resolve(process.cwd(), gen.path)
    let loaded: Promise<{ generate: Generate }> | undefined
    return async (scenario) => {
      if (!loaded) loaded = import(abs)
      const mod = await loaded
      if (typeof mod.generate !== "function") {
        throw new Error(`Generator module ${gen.path} must export generate(scenario)`)
      }
      return stripFences(await mod.generate(scenario))
    }
  }
  const model = gen.model ?? DEFAULT_MODEL
  return (scenario) => generateHtml(model, scenario)
}
