/**
 * Mail entry shim (ADR 0009): wiring only. An error rejects the top-level await, and Node exits 1.
 */
import { loadConfig } from "../config.js";
import { systemClock } from "../infra/clock.js";
import { createLogger } from "../infra/logger.js";

import { runMail } from "./run-mail.js";

const config = loadConfig(process.env, process.cwd());
const log = createLogger();
const summary = await runMail(
  { alertsDatabase: config.alertsDatabase },
  { clock: systemClock, log },
);
log("mail.finished", { ...summary });
process.exitCode = 0;
