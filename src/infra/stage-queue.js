import { isRecord, ownValue } from "../core/common.js";

/**
 * Stage queue (ADR 0006). A text step reads only its own stage and writes that checkpoint.
 * It does not start the next step. The coverage row is the queue.
 */

/**
 * @typedef {object} ArticleText
 * @property {string} guid Google item id.
 * @property {string} title Article title.
 * @property {string} googleUrl Google News URL.
 * @property {string} publisherUrl Empty until unwrap stores one.
 * @property {string} bodyHtml Empty until fetch stores the page.
 * @property {number} attemptCount Failed runs of the current stage.
 */

const QUEUE = `SELECT guid, title, google_url AS googleUrl, publisher_url AS publisherUrl,
  body_html AS bodyHtml, attempt_count AS attemptCount
  FROM articles WHERE retryable = 1 AND stage = ? ORDER BY published_at, guid`;

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {"unwrap" | "fetch" | "extract"} stage Queue this job owns.
 * @returns {ArticleText[]} Retryable articles waiting at that stage, oldest first.
 */
export function articlesAtStage(database, stage) {
  return database
    .prepare(QUEUE)
    .all(stage)
    .map((queued) => articleFromRow(queued));
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {"unwrap" | "fetch" | "extract"} stage Queue to count.
 * @returns {number} Retryable articles still at that stage.
 */
export function articlesRemaining(database, stage) {
  return Number(
    database
      .prepare(
        "SELECT COUNT(*) FROM articles WHERE retryable = 1 AND stage = ?",
      )
      .pluck()
      .get(stage),
  );
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {string} guid Article guid.
 * @param {string} publisherUrl Resolved article URL.
 * @returns {void}
 */
export function savePublisherUrl(database, guid, publisherUrl) {
  writeArticle(
    database,
    `UPDATE articles SET publisher_url = ?, stage = 'fetch', attempt_count = 0,
      last_error = NULL, retryable = 1 WHERE guid = ?`,
    [publisherUrl, guid],
    guid,
  );
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {string} guid Article guid.
 * @param {string} html Publisher page.
 * @returns {void}
 */
export function saveBodyHtml(database, guid, html) {
  writeArticle(
    database,
    `UPDATE articles SET body_html = ?, stage = 'extract', attempt_count = 0,
      last_error = NULL, retryable = 1 WHERE guid = ?`,
    [html, guid],
    guid,
  );
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {string} guid Article guid.
 * @returns {void}
 */
export function saveTitlePath(database, guid) {
  writeArticle(
    database,
    `UPDATE articles SET extracted_text = title, text_source = 'title', stage = 'classify',
      body_html = NULL, attempt_count = 0, last_error = NULL, retryable = 1 WHERE guid = ?`,
    [guid],
    guid,
  );
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {string} guid Article guid.
 * @param {string} text Readability text.
 * @returns {void}
 */
export function saveExtractedText(database, guid, text) {
  writeArticle(
    database,
    `UPDATE articles SET extracted_text = ?, text_source = 'body', stage = 'classify',
      body_html = NULL, attempt_count = 0, last_error = NULL, retryable = 1 WHERE guid = ?`,
    [text, guid],
    guid,
  );
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {string} guid Article guid.
 * @param {number} attemptCount Failed runs already stored.
 * @param {string} message Failure a later run can retry.
 * @returns {number} 0 when this was the third exhausted run, otherwise 1.
 */
export function leaveForRetry(database, guid, attemptCount, message) {
  const next = attemptCount + 1;
  const retryable = next >= 3 ? 0 : 1;

  writeArticle(
    database,
    "UPDATE articles SET attempt_count = ?, last_error = ?, retryable = ? WHERE guid = ?",
    [next, message, retryable, guid],
    guid,
  );

  return retryable;
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {string} guid Article guid.
 * @param {string} message Failure that will not change on its own.
 * @returns {void}
 */
export function saveTerminal(database, guid, message) {
  writeArticle(
    database,
    "UPDATE articles SET last_error = ?, retryable = 0 WHERE guid = ?",
    [message, guid],
    guid,
  );
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {string} sql Update with bound values.
 * @param {unknown[]} values Bound values, guid last.
 * @param {string} guid Article guid.
 * @returns {void}
 */
function writeArticle(database, sql, values, guid) {
  requireArticle(database.prepare(sql).run(...values), guid);
}

/**
 * @param {import("better-sqlite3").RunResult} result SQLite write result.
 * @param {string} guid Article guid.
 * @returns {void}
 */
function requireArticle(result, guid) {
  if (result.changes !== 1) {
    throw new Error(`article ${guid} is not in the coverage store`);
  }
}

/**
 * @param {unknown} row SQLite row.
 * @returns {ArticleText} Queue fields.
 */
function articleFromRow(row) {
  if (!isRecord(row)) {
    throw new TypeError("article row is missing");
  }

  const publisher = ownValue(row, "publisherUrl");
  const body = ownValue(row, "bodyHtml");

  return {
    attemptCount: Number(ownValue(row, "attemptCount")),
    bodyHtml: typeof body === "string" ? body : "",
    googleUrl: String(ownValue(row, "googleUrl")),
    guid: String(ownValue(row, "guid")),
    publisherUrl: typeof publisher === "string" ? publisher : "",
    title: String(ownValue(row, "title")),
  };
}
