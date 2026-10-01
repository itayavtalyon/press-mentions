/**
 * Backfill entry shim (ADR 0009): wiring only. An error rejects the top-level await, and Node exits 1.
 */
import { loadConfig } from "../config.js";
import { systemClock } from "../infra/clock.js";
import { createGoogleNewsFeed } from "../infra/google-news.js";
import { createHttpClient } from "../infra/http.js";
import { createLogger } from "../infra/logger.js";
import { createRateLimiter } from "../infra/rate-limiter.js";

import { exitCode, runBackfill } from "./run-backfill.js";

const config = loadConfig(process.env, process.cwd());
const log = createLogger();
const limiter = createRateLimiter({
  clock: systemClock,
  intervalMs: () => config.googleIntervalMs,
});
const http = createHttpClient({
  fetch,
  limiter,
  clock: systemClock,
  random: Math.random,
});
const summary = await runBackfill(config, {
  feed: createGoogleNewsFeed(http),
  log,
  now: new Date(),
});
log("backfill.finished", { ...summary });
process.exitCode = exitCode(summary);
