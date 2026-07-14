export interface Scenario {
  data?: unknown;
  id: string;
  prompt: string;
  runs?: number;
}

// Deprecated alias for { kind: "llm-html", provider: "google" }. Kept working
// for back-compat; new configs should use LlmGeneratorConfig.
export interface GeminiGeneratorConfig {
  kind: "gemini-html";
  model?: string;
}

export interface LlmGeneratorConfig {
  baseUrl?: string;
  kind: "llm-html";
  model?: string;
  provider?: "google" | "openai";
}

export interface ModuleGeneratorConfig {
  kind: "module";
  path: string;
}

export type GeneratorConfig =
  | GeminiGeneratorConfig
  | LlmGeneratorConfig
  | ModuleGeneratorConfig;

export interface JudgeConfig {
  baseUrl?: string;
  enforce?: boolean;
  mode?: "off";
  model?: string;
  provider?: "google" | "openai";
  rubric?: string[];
}

export interface GatesConfig {
  maxA11yCritical?: number;
  maxScoreStdDev?: number;
  minFidelity?: number;
  minJudgeScore?: number;
}

export interface UivetConfig {
  gates?: GatesConfig;
  generator?: GeneratorConfig;
  judge?: JudgeConfig;
  scenarios: Scenario[];
}

export interface FidelityResult {
  found: number;
  missing: string[];
  rate: number;
  total: number;
}

export interface LayoutResult {
  emptyBody: boolean;
  horizontalOverflow: boolean;
  smallTargets: number;
}

export interface AxeViolation {
  description: string;
  id: string;
  impact: string;
  nodes: number;
}

export interface AxeResult {
  critical: number;
  ruleIds: string[];
  serious: number;
  violations: AxeViolation[];
}

export interface JudgeResult {
  overall: number;
  rationale: string;
  scores: Record<string, number>;
}

export interface RunResult {
  axe: AxeResult;
  consoleErrors: string[];
  error?: string;
  fidelity: FidelityResult;
  html: string;
  index: number;
  judge: JudgeResult | null;
  latencyMs: number;
  layout: LayoutResult;
  screenshot: string;
  text: string;
}

export interface GateStatus {
  advisory?: boolean;
  detail: string;
  name: string;
  pass: boolean;
  skipped?: boolean;
}

export interface Regression {
  advisory?: boolean;
  detail: string;
}

export interface ScenarioAggregate {
  a11yCriticalSerious: number;
  a11yRuleIds: string[];
  fidelityRate: number;
  gates: GateStatus[];
  id: string;
  maxOverall: number | null;
  meanOverall: number | null;
  minOverall: number | null;
  pass: boolean;
  prompt: string;
  regressions: Regression[];
  runs: RunResult[];
  scoreStdDev: number | null;
}

export interface BaselineEntry {
  a11yRuleIds: string[];
  fidelityRate: number;
  meanOverall: number;
}

export interface Baseline {
  createdAt: string;
  scenarios: Record<string, BaselineEntry>;
}
