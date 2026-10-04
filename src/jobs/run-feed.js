import { FEED_PAGE_LIMIT } from "../core/collect.js";
import { contains, forwardWindow } from "../core/collection.js";
import {
  openCoverageStore,
  recordDaily,
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
 * @typedef {Pick<import("../config.js").AppConfig, "coverageDatabase" | "overlayPath" | "seedPath">} FeedConfig
 */

/**
 * @typedef {object} FeedDependencies
 * @property {import("../core/collect.js").Feed} feed News search port.
 * @property {import("../infra/logger.js").Log} log Structured logger.
 * @property {Date} now Run start. It ends the forward window.
 */

/**
 * @typedef {object} FeedSummary
 * @property {number} companies Companies in the seed.
 * @property {number} collected Companies collected in this run.
 * @property {number} inserted New company links.
 * @property {number} failed Companies that failed and stay for the next run.
 * @property {string | undefined} stoppedBy Host whose throttling stopped the feed stage, if any.
 */

/**
 * The forward feed. It never opens the alerts store (ADR 0007).
 * Syncs the seed, then searches each company for the trailing three days. A failed company is logged and
 * the run continues. STAGE_STOP_AFTER exhausted backoffs in a row stop the feed stage.
 * @param {FeedConfig} config Coverage settings from the app config.
 * @param {FeedDependencies} dependencies Ports.
 * @returns {Promise<FeedSummary>} What happened.
 * @throws {Error} Another feed holds the lock, or the seed, overlay, or store is unusable.
 */
export async function runFeed(config, dependencies) {
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
 * @param {FeedSummary} summary Result of runFeed.
 * @returns {number} 0 when every company is collected, 1 when anything stays pending.
 */
export function exitCode(summary) {
  return summary.failed === 0 && summary.stoppedBy === undefined ? 0 : 1;
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {import("../core/overlay.js").Company[]} companies Seed companies.
 * @param {FeedDependencies} dependencies Ports.
 * @returns {Promise<FeedSummary>} What happened.
 */
async function collectAll(database, companies, dependencies) {
  /**
   * @type {FeedSummary}
   */
  const summary = {
    companies: companies.length,
    collected: 0,
    inserted: 0,
    failed: 0,
    stoppedBy: undefined,
  };
  let throttledInARow = 0;
  for (const company of companies) {
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
          pending: companies.length - summary.collected - summary.failed,
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
 * @param {FeedDependencies} dependencies Ports.
 * @returns {Promise<number>} New company links.
 */
async function collectOne(database, company, dependencies) {
  const window = forwardWindow(dependencies.now);
  const page = await dependencies.feed.search(company, window);
  const items = page.filter((item) => contains(window, item.publishedAt));
  const inserted = recordDaily(database, { companyId: company.id, items });
  dependencies.log("feed.collected", {
    company: company.id,
    items: items.length,
    inserted,
    fullPages: page.length >= FEED_PAGE_LIMIT ? 1 : 0,
  });
  return inserted;
}
