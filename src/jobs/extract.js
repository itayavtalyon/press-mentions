/**
 * Extract entry shim (ADR 0009): wiring only. An error rejects the top-level await, and Node exits 1.
 */
import { loadConfig } from "../config.js";
import { extractArticleText } from "../infra/extractor.js";
import { createLogger } from "../infra/logger.js";

import { exitCode, runExtract } from "./run-extract.js";

const config = loadConfig(process.env, process.cwd());
const log = createLogger();
const summary = await runExtract(
  { coverageDatabase: config.coverageDatabase },
  { extract: extractArticleText, log },
);
log("extract.finished", { ...summary });
process.exitCode = exitCode(summary);
