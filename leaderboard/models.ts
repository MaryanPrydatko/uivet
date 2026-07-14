import type { Provider } from "../src/llm.ts";

export interface LeaderboardModel {
  label: string;
  model: string;
  provider: Provider;
}

// Model ids verified 2026-07-15:
//   google  -> https://ai.google.dev/gemini-api/docs/models (and per-model pages)
//   openai  -> https://developers.openai.com/api/docs/models/<id>
// All six confirmed as live ids; no substitutions were needed.
export const MODELS: LeaderboardModel[] = [
  { label: "Gemini 3.5 Flash", model: "gemini-3.5-flash", provider: "google" },
  {
    label: "Gemini 3.1 Flash-Lite",
    model: "gemini-3.1-flash-lite",
    provider: "google",
  },
  { label: "Gemini 2.5 Flash", model: "gemini-2.5-flash", provider: "google" },
  { label: "GPT-5 mini", model: "gpt-5-mini", provider: "openai" },
  { label: "GPT-5", model: "gpt-5", provider: "openai" },
  { label: "GPT-4.1 nano", model: "gpt-4.1-nano", provider: "openai" },
];
