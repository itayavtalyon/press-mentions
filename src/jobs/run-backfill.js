import { collectBackfill } from "../core/collect.js";
import {
  backfilledCompanyIds,
  openCoverageStore,
  recordBackfill,
  syncCompanies,
} from "../infra/coverage-store.js";
import { ThrottledError } from "../infra/http.js";
import { withCommandLock } from "../infra/lock.js";
import { loadCompanies } from "../infra/seed-file.js";

/**
Consecutive exhausted backoffs that stop a stage for the rest of the run (ADR 0006).
 */
const STAGE_STOP_AFTER = 3;

/**
 * @typedef {Pick<import("../config.js").AppConfig, "coverageDatabase" | "googleIntervalMs" | "overlayPath" | "seedPath">} BackfillConfig
 */

/**
 * @typedef {object} BackfillDependencies
 * @property {import("../core/collect.js").Feed} feed News search port.
 * @property {import("../infra/logger.js").Log} log Structured logger.
 * @property {Date} now Run start. It ends the backfill window.
 */

/**
 * @typedef {object} BackfillSummary
 * @property {number} companies Companies in the seed.
 * @property {number} skipped Companies whose feed stage committed in an earlier run.
 * @property {number} collected Companies collected in this run.
 * @property {number} inserted New company links.
 * @property {number} failed Companies that failed and stay pending for the next run.
 * @property {string | undefined} stoppedBy Host whose throttling stopped the feed stage, if any.
 */

/**
 * The backfill job. It never opens the alerts store (ADR 0007).
 * Syncs the seed, then collects each pending company's candidates. A failed company is logged and the run
 * continues. STAGE_STOP_AFTER exhausted backoffs in a row stop the feed stage.
 * @param {BackfillConfig} config Coverage settings from the app config.
 * @param {BackfillDependencies} dependencies Ports.
 * @returns {Promise<BackfillSummary>} What happened.
 * @throws {Error} Another job holds the lock, or the seed, overlay, or store is unusable.
 */
export async function runBackfill(config, dependencies) {
  return withCommandLock(config.coverageDatabase, "feed", async () => {
    const companies = loadCompanies(config.seedPath, config.overlayPath);
    const database = openCoverageStore(config.coverageDatabase);
    try {
      syncCompanies(database, companies);
      return await collectAll(database, companies, dependencies);
    } finally {
      database.close();
    }
  });
}

/**
 * @param {BackfillSummary} summary Result of runBackfill.
 * @returns {number} 0 when every company is collected, 1 when anything stays pending.
 */
export function exitCode(summary) {
  return summary.failed === 0 && summary.stoppedBy === undefined ? 0 : 1;
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {import("../core/overlay.js").Company[]} companies Seed companies.
 * @param {BackfillDependencies} dependencies Ports.
 * @returns {Promise<BackfillSummary>} What happened.
 */
async function collectAll(database, companies, dependencies) {
  const done = backfilledCompanyIds(database);
  const pending = companies.filter((company) => !done.has(company.id));
  /**
   * @type {BackfillSummary}
   */
  const summary = {
    companies: companies.length,
    skipped: done.size,
    collected: 0,
    inserted: 0,
    failed: 0,
    stoppedBy: undefined,
  };
  let throttledInARow = 0;
  for (const company of pending) {
    try {
      summary.inserted += await collectOne(database, company, dependencies);
      summary.collected += 1;
      throttledInARow = 0;
    } catch (error) {
      summary.failed += 1;
      dependencies.log("feed.failed", {
        company: company.id,
        error: String(error),
      });
      throttledInARow =
        error instanceof ThrottledError ? throttledInARow + 1 : 0;
      if (
        error instanceof ThrottledError &&
        throttledInARow >= STAGE_STOP_AFTER
      ) {
        summary.stoppedBy = error.host;
        dependencies.log("feed.stopped", {
          host: error.host,
          pending: pending.length - summary.collected - summary.failed,
        });
        break;
      }
    }
  }
  return summary;
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {import("../core/overlay.js").Company} company Company to collect.
 * @param {BackfillDependencies} dependencies Ports.
 * @returns {Promise<number>} New company links.
 */
async function collectOne(database, company, dependencies) {
  const { items, fullPages } = await collectBackfill(
    company,
    dependencies.feed,
    dependencies.now,
  );
  const inserted = recordBackfill(database, {
    companyId: company.id,
    items,
    at: dependencies.now.toISOString(),
  });
  dependencies.log("feed.collected", {
    company: company.id,
    items: items.length,
    inserted,
    fullPages,
  });
  return inserted;
}
