import { fileURLToPath } from "node:url";

/**
 * @typedef {object} JobConfig
 * @property {string} coverageDatabase Coverage SQLite path. The lock file sits next to it.
 * @property {string} seedPath Seed file, a repository constant.
 * @property {string} overlayPath Overlay file, a repository constant.
 */

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
  return { coverageDatabase, seedPath: SEED_PATH, overlayPath: OVERLAY_PATH };
}
