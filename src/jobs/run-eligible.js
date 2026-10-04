import {
  markAlertEligible,
  openCoverageStore,
} from "../infra/coverage-store.js";
import { withCommandLock } from "../infra/lock.js";

/**
 * @typedef {object} EligibleConfig
 * @property {string} coverageDatabase Coverage SQLite path. The lock sits next to it.
 * @typedef {object} EligibleSummary
 * @property {number} marked Daily mentions marked on this run.
 */

/**
 * Marks daily mentions that can alert. The pipeline step after classify.
 * It does not collect, unwrap, fetch, extract, classify, enqueue, or send.
 * Backfill rows stay ineligible.
 * @param {EligibleConfig} config Coverage settings.
 * @returns {Promise<EligibleSummary>} How many rows this run marked.
 * @throws {Error} Another eligible run holds the lock.
 */
export async function runEligible(config) {
  return withCommandLock(config.coverageDatabase, "eligible", async () => {
    const database = openCoverageStore(config.coverageDatabase);
    try {
      return { marked: markAlertEligible(database) };
    } finally {
      database.close();
    }
  });
}
