import type { UivetConfig } from "../src/types.ts"
import base from "./uivet.config.ts"

// Offline demo config. Same scenarios as uivet.config.ts, but generations are
// replayed from examples/fixtures via the module generator and the judge is
// turned off, so it runs with no network calls and no API key.
const config: UivetConfig = {
  scenarios: base.scenarios.map((s) => ({ ...s, runs: 3 })),
  generator: { kind: "module", path: "examples/offline-generator.ts" },
  judge: { mode: "off" },
}

export default config
