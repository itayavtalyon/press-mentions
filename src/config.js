import path from "node:path";
import { fileURLToPath } from "node:url";

import { ownValue } from "./core/common.js";

const DEFAULT_DATABASE = "data/evaluation.sqlite";
const DEFAULT_HOST = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "gemma4:12b";
const DEFAULT_PROMPT_VERSION = "v002";
const DEFAULT_GOOGLE_INTERVAL_MS = 1000;
const PROMPT_VERSION_PATTERN = /^v\d{3}$/u;
const SEED_PATH = fileURLToPath(
  new URL("../seed/companies.txt", import.meta.url),
);
const OVERLAY_PATH = fileURLToPath(
  new URL("../seed/overlay.json", import.meta.url),
);

/**
 * @typedef {object} AppConfig
 * @property {string} coverageDatabase Coverage SQLite path. The lock file sits next to it.
 * @property {string} seedPath Seed file.
 * @property {string} overlayPath Overlay file.
 * @property {number} googleIntervalMs Minimum milliseconds between two Google News requests.
 * @property {string} databasePath Evaluation SQLite path.
 * @property {string} ollamaHost Ollama host.
 * @property {string} model Classifier model name.
 * @property {string} promptVersion Classifier prompt id, such as `v002`.
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
    googleIntervalMs: googleInterval(environment),
    model: setting(environment, "MODEL", DEFAULT_MODEL),
    ollamaHost: setting(environment, "OLLAMA_HOST", DEFAULT_HOST),
    overlayPath: OVERLAY_PATH,
    promptVersion: promptVersion(environment),
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
 * @returns {number} A positive whole number of milliseconds.
 */
function googleInterval(environment) {
  const value = ownValue(environment, "GOOGLE_TOKEN_MS");
  const text = typeof value === "string" ? value.trim() : "";

  if (text === "") {
    return DEFAULT_GOOGLE_INTERVAL_MS;
  }

  if (!/^[1-9]\d*$/u.test(text)) {
    throw new Error(
      `GOOGLE_TOKEN_MS must be a positive whole number of milliseconds, got "${text}"`,
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
 * @returns {string} Prompt id, such as `v002`.
 */
function promptVersion(environment) {
  const value = setting(environment, "PROMPT_VERSION", DEFAULT_PROMPT_VERSION);

  if (!PROMPT_VERSION_PATTERN.test(value)) {
    throw new Error("PROMPT_VERSION is not a prompt version");
  }

  return value;
}
