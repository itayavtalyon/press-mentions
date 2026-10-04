/**
 * Eligible entry shim (ADR 0009): wiring only. An error rejects the top-level await, and Node exits 1.
 */
import { loadConfig } from "../config.js";
import { createLogger } from "../infra/logger.js";

import { runEligible } from "./run-eligible.js";

const config = loadConfig(process.env, process.cwd());
const log = createLogger();
const summary = await runEligible({
  coverageDatabase: config.coverageDatabase,
});
log("eligible.finished", { ...summary });
process.exitCode = 0;
