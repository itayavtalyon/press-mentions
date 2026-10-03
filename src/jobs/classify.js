/**
 * Classify entry shim (ADR 0009): wiring only. An error rejects the top-level await, and Node exits 1.
 */
import { loadConfig } from "../config.js";
import { systemClock } from "../infra/clock.js";
import { createLogger } from "../infra/logger.js";
import { OllamaClient } from "../infra/ollama.js";

import { exitCode, runClassify } from "./run-classify.js";

const config = loadConfig(process.env, process.cwd());
const log = createLogger();
const ollama = new OllamaClient(config.ollamaHost);
const summary = await runClassify(
  { coverageDatabase: config.coverageDatabase },
  {
    chat: (request) => ollama.chat(request),
    clock: systemClock,
    log,
    random: Math.random,
  },
);
log("classify.finished", { ...summary });
process.exitCode = exitCode(summary);
