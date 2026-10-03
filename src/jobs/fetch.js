/**
 * Fetch entry shim (ADR 0009): wiring only. An error rejects the top-level await, and Node exits 1.
 */
import { loadConfig } from "../config.js";
import { createArticleFetcher } from "../infra/article-fetcher.js";
import { systemClock } from "../infra/clock.js";
import { createHttpClient } from "../infra/http.js";
import { createLogger } from "../infra/logger.js";
import { createRateLimiter, hostIntervalMs } from "../infra/rate-limiter.js";

import { exitCode, runFetch } from "./run-fetch.js";

const config = loadConfig(process.env, process.cwd());
const log = createLogger();
const http = createHttpClient({
  fetch,
  limiter: createRateLimiter({
    clock: systemClock,
    intervalMs: (host) =>
      hostIntervalMs(host, {
        googleMs: config.googleIntervalMs,
        publisherMs: config.publisherIntervalMs,
      }),
  }),
  clock: systemClock,
  random: Math.random,
});
const summary = await runFetch(
  { coverageDatabase: config.coverageDatabase },
  { articles: createArticleFetcher(http), log },
);
log("fetch.finished", { ...summary });
process.exitCode = exitCode(summary);
