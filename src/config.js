import path from "node:path";
import { fileURLToPath } from "node:url";

import { ownValue } from "./core/common.js";

const DEFAULT_DATABASE = "data/evaluation.sqlite";
const DEFAULT_HOST = "http://127.0.0.1:11434";
const DEFAULT_GOOGLE_INTERVAL_MS = 1000;
const DEFAULT_PUBLISHER_INTERVAL_MS = 2000;
const SEED_PATH = fileURLToPath(
  new URL("../seed/companies.txt", import.meta.url),
);
const OVERLAY_PATH = fileURLToPath(
  new URL("../seed/overlay.json", import.meta.url),
);
const BROWSER_ASSETS_PATH = fileURLToPath(
  new URL("ui/browser/", import.meta.url),
);
const DEFAULT_PORT = 3000;
const MAX_PORT = 65_535;
const DEFAULT_ALERTS_DATABASE = "data/alerts.sqlite";
const DEFAULT_ALERT_EMAIL = "alerts@example.com";

/**
 * @typedef {object} AppConfig
 * @property {string} coverageDatabase Coverage SQLite path. The lock file sits next to it.
 * @property {string} seedPath Seed file.
 * @property {string} overlayPath Overlay file.
 * @property {number} googleIntervalMs Minimum milliseconds between two Google News requests.
 * @property {number} publisherIntervalMs Minimum milliseconds between two requests to any other host.
 * @property {string} databasePath Evaluation SQLite path.
 * @property {string} ollamaHost Ollama host.
 * @property {string} alertsDatabase Alerts SQLite path. Default `data/alerts.sqlite`.
 * @property {string} alertEmail Default subscriber for every company.
 * @property {number} port Dashboard port on 127.0.0.1 (ADR 0008).
 * @property {string} browserAssetsPath Directory of `app.css` and `app.js`.
 */

/**
 * Read every environment setting. Jobs do not read these variables themselves.
 * @param {Record<string, string | undefined>} environment Process environment.
 * @param {string} cwd Working directory for a relative evaluation database path.
 * @returns {AppConfig} Settings.
 */
export function loadConfig(environment, cwd) {
  const databasePath = setting(environment, "EVAL_DB", DEFAULT_DATABASE);

  return {
    coverageDatabase: coverageDatabase(environment),
    databasePath: path.isAbsolute(databasePath)
      ? databasePath
      : path.join(cwd, databasePath),
    googleIntervalMs: intervalMs(
      environment,
      "GOOGLE_TOKEN_MS",
      DEFAULT_GOOGLE_INTERVAL_MS,
    ),
    publisherIntervalMs: intervalMs(
      environment,
      "PUBLISHER_TOKEN_MS",
      DEFAULT_PUBLISHER_INTERVAL_MS,
    ),
    ollamaHost: setting(environment, "OLLAMA_HOST", DEFAULT_HOST),
    port: port(environment),
    alertsDatabase: setting(environment, "ALERTS_DB", DEFAULT_ALERTS_DATABASE),
    alertEmail: setting(environment, "ALERT_EMAIL", DEFAULT_ALERT_EMAIL),
    browserAssetsPath: BROWSER_ASSETS_PATH,
    overlayPath: OVERLAY_PATH,
    seedPath: SEED_PATH,
  };
}

/**
 * @param {Record<string, string | undefined>} environment Process environment.
 * @returns {string} Trimmed coverage database path.
 */
function coverageDatabase(environment) {
  const value = ownValue(environment, "COVERAGE_DB");
  const text = typeof value === "string" ? value.trim() : "";

  if (text === "") {
    throw new Error("COVERAGE_DB is not set. Copy .env.example to .env");
  }

  return text;
}

/**
 * @param {Record<string, string | undefined>} environment Process environment.
 * @param {string} name `GOOGLE_TOKEN_MS` or `PUBLISHER_TOKEN_MS`.
 * @param {number} fallback Milliseconds used when the variable is absent.
 * @returns {number} A positive whole number of milliseconds.
 */
function intervalMs(environment, name, fallback) {
  const value = ownValue(environment, name);
  const text = typeof value === "string" ? value.trim() : "";

  if (text === "") {
    return fallback;
  }

  if (!/^[1-9]\d*$/u.test(text)) {
    throw new Error(
      `${name} must be a positive whole number of milliseconds, got "${text}"`,
    );
  }

  return Number(text);
}

/**
 * @param {Record<string, string | undefined>} environment Process environment.
 * @param {string} name Variable name.
 * @param {string} fallback Value used when the variable is absent.
 * @returns {string} Configured text.
 */
function setting(environment, name, fallback) {
  const value = ownValue(environment, name);

  if (value === "") {
    throw new Error(`${name} is empty`);
  }

  return typeof value === "string" ? value : fallback;
}

/**
 * @param {Record<string, string | undefined>} environment Process environment.
 * @returns {number} PORT, or 3000 when it is not set.
 * @throws {Error} PORT is set and is not a whole number from 1 to 65535.
 */
function port(environment) {
  const value = ownValue(environment, "PORT");
  if (typeof value !== "string") {
    return DEFAULT_PORT;
  }
  const text = value.trim();
  if (!/^[1-9]\d{0,4}$/u.test(text) || Number(text) > MAX_PORT) {
    throw new Error(
      `PORT must be a whole number from 1 to 65535, got "${text}"`,
    );
  }
  return Number(text);
}
