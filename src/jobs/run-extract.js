import { openCoverageStore } from "../infra/coverage-store.js";
import { withCommandLock } from "../infra/lock.js";
import {
  articlesAtStage,
  articlesRemaining,
  saveExtractedText,
  saveTitlePath,
} from "../infra/stage-queue.js";

/**
 * @typedef {object} ExtractConfig
 * @property {string} coverageDatabase Coverage SQLite path.
 */

/**
 * @typedef {object} ExtractDependencies
 * @property {(html: string) => string} extract Readability text for one stored page.
 * @property {import("../infra/logger.js").Log} log Structured logger.
 */

/**
 * @typedef {object} ExtractSummary
 * @property {number} extracted Rows whose body text was stored.
 * @property {number} titled Rows sent to classify because the text was empty after trim.
 * @property {number} moved Rows that were no longer at `extract`.
 * @property {number} remaining Retryable rows still at `extract`.
 */

/**
 * Extracts text for articles at stage `extract`. It does not unwrap, fetch, or classify.
 * @param {ExtractConfig} config Coverage settings.
 * @param {ExtractDependencies} dependencies Ports.
 * @returns {Promise<ExtractSummary>} What happened.
 * @throws {Error} Another extract holds the lock, or the extractor throws.
 */
export async function runExtract(config, dependencies) {
  return withCommandLock(config.coverageDatabase, "extract", async () => {
    const database = openCoverageStore(config.coverageDatabase);
    try {
      return extractAll(database, dependencies);
    } finally {
      database.close();
    }
  });
}

/**
 * @param {ExtractSummary} summary Result of runExtract.
 * @returns {number} 0 when no retryable row remains at `extract`.
 */
export function exitCode(summary) {
  return summary.remaining === 0 ? 0 : 1;
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {ExtractDependencies} dependencies Ports.
 * @returns {ExtractSummary} What happened.
 */
function extractAll(database, dependencies) {
  let extracted = 0;
  let titled = 0;
  let moved = 0;
  for (const article of articlesAtStage(database, "extract")) {
    const text = dependencies.extract(article.bodyHtml).trim();
    const changed =
      text === ""
        ? saveTitlePath(database, article.guid, "extract")
        : saveExtractedText(database, article.guid, text);
    if (changed === 0) {
      dependencies.log("extract.moved", {
        guid: article.guid,
        stage: "extract",
      });
      moved += 1;
    } else if (text === "") {
      titled += 1;
    } else {
      extracted += 1;
    }
  }
  return {
    extracted,
    moved,
    remaining: articlesRemaining(database, "extract"),
    titled,
  };
}
