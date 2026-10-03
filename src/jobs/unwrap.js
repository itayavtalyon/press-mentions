/**
 * Unwrap entry shim (ADR 0009): wiring only. An error rejects the top-level await, and Node exits 1.
 */
import { loadConfig } from "../config.js";
import { systemClock } from "../infra/clock.js";
import { createHttpClient } from "../infra/http.js";
import { createLogger } from "../infra/logger.js";
import { createRateLimiter, hostIntervalMs } from "../infra/rate-limiter.js";
import { createArticleResolver } from "../infra/resolver.js";

import { exitCode, runUnwrap } from "./run-unwrap.js";

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
const summary = await runUnwrap(
  { coverageDatabase: config.coverageDatabase },
  { articles: createArticleResolver(http), log },
);
log("unwrap.finished", { ...summary });
process.exitCode = exitCode(summary);
