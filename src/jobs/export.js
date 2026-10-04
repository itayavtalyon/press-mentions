/**
 * Export entry shim (ADR 0009): wiring only. An error rejects the top-level await, and Node exits 1.
 */
import { loadConfig } from "../config.js";
import { systemClock } from "../infra/clock.js";
import { createLogger } from "../infra/logger.js";

import { runExport } from "./run-export.js";

const config = loadConfig(process.env, process.cwd());
const log = createLogger();
const summary = await runExport(
  {
    alertsDatabase: config.alertsDatabase,
    coverageDatabase: config.coverageDatabase,
    evaluationDatabase: config.databasePath,
    outDirectory: "data",
  },
  { clock: systemClock },
);
log("export.finished", { ...summary });
process.exitCode = 0;
