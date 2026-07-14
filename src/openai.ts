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

export function openaiApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("Missing OPENAI_API_KEY environment variable");
  }
  return key;
}

export async function chatCompletion(
  model: string,
  baseUrl: string | undefined,
  req: OpenAiRequest
): Promise<string> {
  const url = endpoint(baseUrl);
  const key = openaiApiKey();
  const payload = requestBody(model, req);
  let lastError = "unknown error";
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res: Response;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: sequential retry with exponential backoff
      res = await fetch(url, {
        body: payload,
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        method: "POST",
      });
    } catch (err) {
      lastError = `network error: ${String(err)}`;
      if (attempt < 3) {
        await sleep(500 * 2 ** (attempt - 1));
      }
      continue;
    }
    if (res.ok) {
      const json = (await res.json()) as OpenAiResponse;
      const text = json.choices?.[0]?.message?.content ?? "";
      if (text.trim()) {
        return text;
      }
      lastError = "empty content";
      if (attempt < 3) {
        await sleep(500 * 2 ** (attempt - 1));
      }
      continue;
    }
    const errBody = (await res.text()).slice(0, 300);
    const message = `OpenAI HTTP ${res.status}: ${errBody}`;
    if (res.status !== 429 && res.status < 500) {
      throw new Error(message);
    }
    lastError = message;
    if (attempt < 3) {
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`OpenAI request failed after 3 attempts: ${lastError}`);
}
