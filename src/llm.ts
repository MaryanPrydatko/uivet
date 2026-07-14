import { generateContent, googleApiKey } from "./gemini.ts";
import { chatCompletion, openaiApiKey } from "./openai.ts";

export type Provider = "google" | "openai";

// Verified 2026-07-15 against the official model pages:
// google: https://ai.google.dev/gemini-api/docs/models
// openai: https://developers.openai.com/api/docs/models/gpt-5-mini
export const DEFAULT_GOOGLE_MODEL = "gemini-3.5-flash";
export const DEFAULT_OPENAI_MODEL = "gpt-5-mini";

export interface LlmTarget {
  baseUrl?: string;
  model: string;
  provider: Provider;
}

export function defaultModel(provider: Provider): string {
  return provider === "openai" ? DEFAULT_OPENAI_MODEL : DEFAULT_GOOGLE_MODEL;
}

export function requireApiKey(provider: Provider): void {
  if (provider === "openai") {
    openaiApiKey();
    return;
  }
  googleApiKey();
}

export function completeText(
  target: LlmTarget,
  prompt: string
): Promise<string> {
  if (target.provider === "openai") {
    return chatCompletion(target.model, target.baseUrl, {
      messages: [{ content: prompt, role: "user" }],
      temperature: 0,
    });
  }
  return generateContent(target.model, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0 },
  });
}

export function completeVision(
  target: LlmTarget,
  prompt: string,
  imageBase64: string
): Promise<string> {
  if (target.provider === "openai") {
    return chatCompletion(target.model, target.baseUrl, {
      json: true,
      messages: [
        {
          content: [
            { text: prompt, type: "text" },
            {
              image_url: { url: `data:image/png;base64,${imageBase64}` },
              type: "image_url",
            },
          ],
          role: "user",
        },
      ],
      temperature: 0,
    });
  }
  return generateContent(target.model, {
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { data: imageBase64, mime_type: "image/png" } },
        ],
      },
    ],
    generationConfig: { responseMimeType: "application/json", temperature: 0 },
  });
}
