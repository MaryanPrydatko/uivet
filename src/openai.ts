import { sleep } from "./util.ts";

const DEFAULT_BASE = "https://api.openai.com/v1";
const TRAILING_SLASH = /\/+$/;

function endpoint(baseUrl: string | undefined): string {
  const base = (baseUrl ?? DEFAULT_BASE).replace(TRAILING_SLASH, "");
  return `${base}/chat/completions`;
}

function requestBody(model: string, req: OpenAiRequest): string {
  return JSON.stringify({
    messages: req.messages,
    model,
    response_format: req.json ? { type: "json_object" } : undefined,
    temperature: req.temperature,
  });
}

export interface OpenAiImagePart {
  image_url: { url: string };
  type: "image_url";
}

export interface OpenAiTextPart {
  text: string;
  type: "text";
}

export interface OpenAiMessage {
  content: string | (OpenAiImagePart | OpenAiTextPart)[];
  role: "user";
}

export interface OpenAiRequest {
  json?: boolean;
  messages: OpenAiMessage[];
  temperature?: number;
}

interface OpenAiResponse {
  choices?: { message?: { content?: string } }[];
}

// Reasoning models (gpt-5 family) only accept the default temperature.
function rejectedTemperature(status: number, body: string): boolean {
  return status === 400 && body.includes('"param": "temperature"');
}

export function openaiApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("Missing OPENAI_API_KEY environment variable");
  }
  return key;
}

type Outcome =
  | { kind: "fatal"; error: string }
  | { kind: "ok"; text: string }
  | { kind: "retry"; error: string }
  | { kind: "strip-temperature" };

async function readResponse(
  res: Response,
  canStripTemperature: boolean
): Promise<Outcome> {
  if (res.ok) {
    const json = (await res.json()) as OpenAiResponse;
    const text = json.choices?.[0]?.message?.content ?? "";
    if (text.trim()) {
      return { kind: "ok", text };
    }
    return { error: "empty content", kind: "retry" };
  }
  const body = (await res.text()).slice(0, 300);
  if (canStripTemperature && rejectedTemperature(res.status, body)) {
    return { kind: "strip-temperature" };
  }
  const error = `OpenAI HTTP ${res.status}: ${body}`;
  if (res.status !== 429 && res.status < 500) {
    return { error, kind: "fatal" };
  }
  return { error, kind: "retry" };
}

export async function chatCompletion(
  model: string,
  baseUrl: string | undefined,
  req: OpenAiRequest
): Promise<string> {
  const url = endpoint(baseUrl);
  const key = openaiApiKey();
  let payload = requestBody(model, req);
  let { temperature } = req;
  let lastError = "unknown error";
  for (let attempt = 1; attempt <= 3; attempt++) {
    let outcome: Outcome;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: sequential retry with exponential backoff
      const res = await fetch(url, {
        body: payload,
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        method: "POST",
      });
      outcome = await readResponse(res, temperature !== undefined);
    } catch (err) {
      outcome = { error: `network error: ${String(err)}`, kind: "retry" };
    }
    if (outcome.kind === "ok") {
      return outcome.text;
    }
    if (outcome.kind === "fatal") {
      throw new Error(outcome.error);
    }
    if (outcome.kind === "strip-temperature") {
      temperature = undefined;
      payload = requestBody(model, { ...req, temperature: undefined });
      process.stderr.write(
        `note: ${model} rejected temperature ${req.temperature}, retrying with the model default\n`
      );
      continue;
    }
    lastError = outcome.error;
    if (attempt < 3) {
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`OpenAI request failed after 3 attempts: ${lastError}`);
}
