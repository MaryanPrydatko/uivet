export interface Scenario {
  id: string
  prompt: string
  data?: unknown
  runs?: number
}

export interface GeminiGeneratorConfig {
  kind: "gemini-html"
  model?: string
}

export interface ModuleGeneratorConfig {
  kind: "module"
  path: string
}

export type GeneratorConfig = GeminiGeneratorConfig | ModuleGeneratorConfig

export interface JudgeConfig {
  model?: string
  rubric?: string[]
}

export interface GatesConfig {
  minJudgeScore?: number
  maxA11yCritical?: number
  minFidelity?: number
  maxScoreStdDev?: number
}

export interface UivetConfig {
  scenarios: Scenario[]
  generator?: GeneratorConfig
  judge?: JudgeConfig
  gates?: GatesConfig
}

export interface FidelityResult {
  rate: number
  total: number
  found: number
  missing: string[]
}

export interface LayoutResult {
  horizontalOverflow: boolean
  smallTargets: number
  emptyBody: boolean
}

export interface AxeViolation {
  id: string
  impact: string
  description: string
  nodes: number
}

export interface AxeResult {
  critical: number
  serious: number
  ruleIds: string[]
  violations: AxeViolation[]
}

export interface JudgeResult {
  scores: Record<string, number>
  overall: number
  rationale: string
}

export interface RunResult {
  index: number
  html: string
  screenshot: string
  text: string
  consoleErrors: string[]
  latencyMs: number
  error?: string
  fidelity: FidelityResult
  layout: LayoutResult
  axe: AxeResult
  judge: JudgeResult
}

export interface GateStatus {
  name: string
  pass: boolean
  detail: string
}

export interface ScenarioAggregate {
  id: string
  prompt: string
  meanOverall: number
  minOverall: number
  maxOverall: number
  scoreStdDev: number
  fidelityRate: number
  a11yCriticalSerious: number
  a11yRuleIds: string[]
  gates: GateStatus[]
  pass: boolean
  regressions: string[]
  runs: RunResult[]
}

export interface BaselineEntry {
  meanOverall: number
  fidelityRate: number
  a11yRuleIds: string[]
}

export interface Baseline {
  createdAt: string
  scenarios: Record<string, BaselineEntry>
}
