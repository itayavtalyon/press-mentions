/**
 * Dashboard entry shim (ADR 0008, ADR 0009): wiring only. It binds 127.0.0.1.
 */
import { createServer } from "node:http";

import { loadConfig } from "../config.js";
import { systemClock } from "../infra/clock.js";
import { openCoverageStore } from "../infra/coverage-store.js";
import { createLogger } from "../infra/logger.js";

import { createApp, readAssets } from "./app.js";

const config = loadConfig(process.env, process.cwd());
const log = createLogger();
const app = createApp({
  assets: readAssets(config.browserAssetsPath),
  clock: systemClock,
  coverage: openCoverageStore(config.coverageDatabase),
  log,
});
createServer(app).listen(config.port, "127.0.0.1", () => {
  log("server.listening", { url: `http://127.0.0.1:${config.port}/` });
});
