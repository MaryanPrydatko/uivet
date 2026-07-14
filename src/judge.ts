import { completeVision, defaultModel, type LlmTarget } from "./llm.ts";
import type { JudgeConfig, JudgeResult, Scenario } from "./types.ts";

export const DEFAULT_RUBRIC = ["task fit", "usability", "visual quality"];

const JSON_FENCE_OPEN = /^```(?:json)?\s*/i;
const JSON_FENCE_CLOSE = /```\s*$/i;

export function rubricKey(item: string): string {
  return item
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function buildPrompt(scenario: Scenario, rubric: string[]): string {
  const items = rubric.map((r, i) => `${i + 1}. ${r}`).join("\n");
  const keys = rubric.map((r) => `"${rubricKey(r)}": <1-10>`).join(", ");
  const data =
    scenario.data === undefined ? "(none)" : JSON.stringify(scenario.data);
  return [
    "You are a strict UI reviewer. A screenshot of a generated UI is attached.",
    "",
    `Intended task: ${scenario.prompt}`,
    `Data the UI should display: ${data}`,
    "",
    "Rate the UI on each rubric item from 1 (poor) to 10 (excellent):",
    items,
    "",
    "Respond with strict JSON only, no markdown, in this exact shape:",
    `{"scores": {${keys}}, "overall": <1-10>, "rationale": "<max 2 sentences>"}`,
  ].join("\n");
}

function clampScore(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) {
    return null;
  }
  return Math.min(10, Math.max(1, n));
}

function extractJson(raw: string): string | null {
  const s = raw
    .trim()
    .replace(JSON_FENCE_OPEN, "")
    .replace(JSON_FENCE_CLOSE, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    return null;
  }
  return s.slice(start, end + 1);
}

function parseJudge(raw: string, rubric: string[]): JudgeResult | null {
  const jsonText = extractJson(raw);
  if (!jsonText) {
    return null;
  }
  let obj: {
    scores?: Record<string, unknown>;
    overall?: unknown;
    rationale?: unknown;
  };
  try {
    obj = JSON.parse(jsonText);
  } catch {
    return null;
  }
  const overall = clampScore(obj.overall);
  if (overall === null) {
    return null;
  }
  const scores: Record<string, number> = {};
  for (const item of rubric) {
    const key = rubricKey(item);
    scores[key] = clampScore(obj.scores?.[key]) ?? overall;
  }
  const rationale = typeof obj.rationale === "string" ? obj.rationale : "";
  return { overall, rationale, scores };
}

function judgeTarget(config: JudgeConfig | undefined): LlmTarget {
  const provider = config?.provider ?? "google";
  return {
    baseUrl: config?.baseUrl,
    model: config?.model ?? defaultModel(provider),
    provider,
  };
}

export async function judgeRun(
  config: JudgeConfig | undefined,
  scenario: Scenario,
  screenshotBase64: string
): Promise<JudgeResult> {
  const target = judgeTarget(config);
  const rubric = config?.rubric ?? DEFAULT_RUBRIC;
  const prompt = buildPrompt(scenario, rubric);
  const first = await completeVision(target, prompt, screenshotBase64);
  const parsed =
    parseJudge(first, rubric) ??
    parseJudge(await completeVision(target, prompt, screenshotBase64), rubric);
  if (parsed) {
    return parsed;
  }
  const zero: Record<string, number> = {};
  for (const item of rubric) {
    zero[rubricKey(item)] = 1;
  }
  return {
    overall: 1,
    rationale: "Judge returned unparseable JSON.",
    scores: zero,
  };
}
