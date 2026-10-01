import { openCoverageStore, syncCompanies } from "../infra/coverage-store.js";
import { withLock } from "../infra/lock.js";
import { loadCompanies } from "../infra/seed-file.js";

/**
 * The backfill job. It never opens the alerts store (ADR 0007).
 * So far it only syncs the seed into the coverage store under the job lock.
 * @param {import("./config.js").JobConfig} config Job configuration.
 * @returns {Promise<number>} How many companies were synced.
 * @throws {Error} Another job holds the lock, or the seed, overlay, or store is unusable.
 */
export async function runBackfill(config) {
  return withLock(`${config.coverageDatabase}.lock`, () => {
    const companies = loadCompanies(config.seedPath, config.overlayPath);
    const database = openCoverageStore(config.coverageDatabase);
    try {
      syncCompanies(database, companies);
      return companies.length;
    } finally {
      database.close();
    }
  });
}
