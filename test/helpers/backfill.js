import path from "node:path";

import Database from "better-sqlite3";

import { ThrottledError } from "../../src/infra/http.js";

import { givenLog } from "./fakes.js";
import { givenFile, givenTemporaryDirectory } from "./files.js";

export const NOW = new Date("2026-10-05T00:00:00.000Z");

/**
 * @param {string} [seed] Seed file contents.
 * @returns {import("../../src/jobs/config.js").JobConfig} Config pointing at a fresh directory.
 */
export function givenConfig(seed = "Harvey\nLudeo (formerly Edge)\nWave") {
  const directory = givenTemporaryDirectory();
  return {
    coverageDatabase: path.join(directory, "coverage.sqlite"),
    seedPath: givenFile(directory, "companies.txt", seed),
    overlayPath: givenFile(directory, "overlay.json", "{}"),
    googleIntervalMs: 1000,
  };
}

/**
 * A feed that answers per company: an array of items, or an error to throw. Unlisted companies get no items.
 * @param {Record<string, import("../../src/core/collect.js").FeedItem[] | Error>} answers By company id.
 * @returns {{ feed: import("../../src/core/collect.js").Feed, asked: string[] }} The feed and who it was asked about.
 */
export function givenFeed(answers) {
  /**
   * @type {string[]}
   */
  const asked = [];
  const byCompany = new Map(Object.entries(answers));
  return {
    asked,
    feed: {
      search: async (company) => {
        asked.push(company.id);
        const answer = byCompany.get(company.id) ?? [];
        if (answer instanceof Error) {
          throw answer;
        }
        return answer;
      },
    },
  };
}

/**
 * @param {import("../../src/core/collect.js").Feed} feed Feed port.
 * @returns {import("../../src/jobs/run-backfill.js").BackfillDependencies} Dependencies with a silent logger.
 */
export function givenDependencies(feed) {
  return { feed, log: givenLog().log, now: NOW };
}

/**
 * @returns {import("../../src/jobs/run-backfill.js").BackfillDependencies} Dependencies whose feed finds nothing.
 */
export function givenQuietDependencies() {
  return givenDependencies(givenFeed({}).feed);
}

/**
 * @param {string} file Coverage store path.
 * @param {string} sql A query returning one column.
 * @returns {unknown[]} That column.
 */
export function column(file, sql) {
  const database = new Database(file, { readonly: true });
  try {
    return database.prepare(sql).pluck().all();
  } finally {
    database.close();
  }
}

/**
 * @returns {ThrottledError} Google throttling that outlasted the backoff.
 */
export function throttled() {
  return new ThrottledError("news.google.com", "HTTP 429");
}
