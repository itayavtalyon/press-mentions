import { fileURLToPath } from "node:url";

/**
 * @typedef {object} JobConfig
 * @property {string} coverageDatabase Coverage SQLite path. The lock file sits next to it.
 * @property {string} seedPath Seed file, a repository constant.
 * @property {string} overlayPath Overlay file, a repository constant.
 * @property {number} googleIntervalMs Minimum milliseconds between two requests to news.google.com.
 */

const DEFAULT_GOOGLE_INTERVAL_MS = 1000;

const SEED_PATH = fileURLToPath(
  new URL("../../seed/companies.txt", import.meta.url),
);
const OVERLAY_PATH = fileURLToPath(
  new URL("../../seed/overlay.json", import.meta.url),
);

/**
 * Reads job configuration from the environment.
 * @param {Record<string, string | undefined>} environment Usually `process.env`.
 * @returns {JobConfig} The configuration.
 * @throws {Error} A required variable is missing or blank.
 */
export function readConfig(environment) {
  const coverageDatabase = environment.COVERAGE_DB?.trim();
  if (!coverageDatabase) {
    throw new Error("COVERAGE_DB is not set. Copy .env.example to .env");
  }
  return {
    coverageDatabase,
    seedPath: SEED_PATH,
    overlayPath: OVERLAY_PATH,
    googleIntervalMs: readInterval(
      environment.GOOGLE_TOKEN_MS,
      DEFAULT_GOOGLE_INTERVAL_MS,
    ),
  };
}

/**
 * @param {string | undefined} value Raw variable.
 * @param {number} fallback Default when unset or blank.
 * @returns {number} A positive whole number of milliseconds.
 * @throws {Error} The value is set but is not a positive whole number.
 */
function readInterval(value, fallback) {
  const text = value?.trim() ?? "";
  if (text === "") {
    return fallback;
  }
  if (!/^[1-9]\d*$/u.test(text)) {
    throw new Error(
      `GOOGLE_TOKEN_MS must be a positive whole number of milliseconds, got "${text}"`,
    );
  }
  return Number(text);
}
