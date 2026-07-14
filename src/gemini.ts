import { sleep } from "./util.ts"

export const DEFAULT_MODEL = "gemini-2.5-flash"
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"

export interface GeminiPart {
  text?: string
  inline_data?: { mime_type: string; data: string }
}

export interface GeminiRequest {
  contents: { role?: string; parts: GeminiPart[] }[]
  generationConfig?: { temperature?: number; responseMimeType?: string }
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

export function apiKey(): string {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) {
    throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY environment variable")
  }
  return key
}

export async function generateContent(model: string, req: GeminiRequest): Promise<string> {
  const url = `${ENDPOINT}/${model}:generateContent`
  const key = apiKey()
  let lastError = "unknown error"
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res: Response
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(req),
      })
    } catch (err) {
      lastError = `network error: ${String(err)}`
      if (attempt < 3) await sleep(500 * 2 ** (attempt - 1))
      continue
    }
    if (res.ok) {
      const json = (await res.json()) as GeminiResponse
      const text = (json.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("")
      if (text.trim()) return text
      lastError = "empty content"
      if (attempt < 3) await sleep(500 * 2 ** (attempt - 1))
      continue
    }
    const body = (await res.text()).slice(0, 300)
    const message = `Gemini HTTP ${res.status}: ${body}`
    if (res.status !== 429 && res.status < 500) throw new Error(message)
    lastError = message
    if (attempt < 3) await sleep(500 * 2 ** (attempt - 1))
  }
  throw new Error(`Gemini request failed after 3 attempts: ${lastError}`)
}
