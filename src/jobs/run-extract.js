import { openCoverageStore } from "../infra/coverage-store.js";
import { withCommandLock } from "../infra/lock.js";
import {
  articlesAtStage,
  articlesRemaining,
  leaveForRetry,
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
 * @throws {Error} Another extract holds the lock.
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
  let counts = { extracted: 0, moved: 0, titled: 0 };
  for (const article of articlesAtStage(database, "extract")) {
    counts = countOutcome(counts, oneArticle(database, article, dependencies));
  }
  return {
    ...counts,
    remaining: articlesRemaining(database, "extract"),
  };
}

/**
 * @param {{ extracted: number, moved: number, titled: number }} counts Rows so far.
 * @param {"extracted" | "titled" | "moved" | "failed"} outcome What happened to one row.
 * @returns {{ extracted: number, moved: number, titled: number }} Counts including this row.
 */
function countOutcome(counts, outcome) {
  if (outcome === "extracted") {
    return { ...counts, extracted: counts.extracted + 1 };
  }
  if (outcome === "titled") {
    return { ...counts, titled: counts.titled + 1 };
  }
  return outcome === "moved" ? { ...counts, moved: counts.moved + 1 } : counts;
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {import("../infra/stage-queue.js").ArticleText} article Queue row.
 * @param {ExtractDependencies} dependencies Ports.
 * @returns {"extracted" | "titled" | "moved" | "failed"} What happened to this row.
 */
function oneArticle(database, article, dependencies) {
  try {
    return storeText(
      database,
      article,
      dependencies,
      dependencies.extract(article.bodyHtml).trim(),
    );
  } catch (error) {
    return markFailure(database, article, dependencies, error);
  }
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {import("../infra/stage-queue.js").ArticleText} article Queue row.
 * @param {ExtractDependencies} dependencies Ports.
 * @param {string} text Trimmed Readability text.
 * @returns {"extracted" | "titled" | "moved"} Stored text, title path, or a row that already moved.
 */
function storeText(database, article, dependencies, text) {
  const changed =
    text === ""
      ? saveTitlePath(database, article.guid, "extract")
      : saveExtractedText(database, article.guid, text);
  if (changed === 0) {
    dependencies.log("extract.moved", {
      guid: article.guid,
      stage: "extract",
    });
    return "moved";
  }
  return text === "" ? "titled" : "extracted";
}

/**
 * Records the extractor failure on the row and lets the run continue.
 * The third failure leaves the row at `extract` with `retryable` 0.
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {import("../infra/stage-queue.js").ArticleText} article Queue row.
 * @param {ExtractDependencies} dependencies Ports.
 * @param {unknown} error Failure from the extractor.
 * @returns {"moved" | "failed"} Moved when the row was no longer at `extract`.
 */
function markFailure(database, article, dependencies, error) {
  const message = String(error);
  const retryable = leaveForRetry(
    database,
    {
      attemptCount: article.attemptCount,
      guid: article.guid,
      stage: "extract",
    },
    message,
  );
  if (retryable === null) {
    dependencies.log("extract.moved", {
      guid: article.guid,
      stage: "extract",
    });
    return "moved";
  }
  dependencies.log("extract.retry", {
    error: message,
    guid: article.guid,
    retryable,
    stage: "extract",
  });
  return "failed";
}
