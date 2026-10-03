import path from "node:path";

import { openCoverageStore } from "../../src/infra/coverage-store.js";

import { givenTemporaryDirectory } from "./files.js";

/**
 * @typedef {object} QueuedArticle
 * @property {string} guid Article id.
 * @property {string} publishedAt ISO timestamp from `toISOString`.
 * @property {"unwrap" | "fetch" | "extract" | "classify"} stage Queue stage.
 * @property {string} [publisherUrl] Unwrapped URL. Omitted stores NULL.
 * @property {string} [title] Defaults to `Title <guid>`.
 * @property {string} [bodyHtml] Page stored by fetch.
 * @property {number} [attemptCount] Defaults to 0.
 * @property {number} [retryable] Defaults to 1.
 */

/**
 * Inserts one coverage article with no company link.
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {QueuedArticle} article Row to insert.
 * @returns {void}
 */
export function addQueuedArticle(database, article) {
  database
    .prepare(
      `INSERT INTO articles (
         guid, title, published_at, publisher_url, google_url, body_html, stage, attempt_count, retryable
       ) VALUES (
         @guid, @title, @publishedAt, @publisherUrl, @googleUrl, @bodyHtml, @stage, @attemptCount, @retryable
       )`,
    )
    .run({
      attemptCount: article.attemptCount ?? 0,
      bodyHtml: article.bodyHtml,
      googleUrl: `https://news.google.com/rss/articles/${article.guid}`,
      guid: article.guid,
      publishedAt: article.publishedAt,
      publisherUrl: article.publisherUrl,
      retryable: article.retryable ?? 1,
      stage: article.stage,
      title: article.title ?? `Title ${article.guid}`,
    });
}

/**
 * @returns {{ coverageDatabase: string, database: import("better-sqlite3").Database, directory: string }}
 *   A store the test closes before the job opens it.
 */
export function givenQueueStore() {
  const directory = givenTemporaryDirectory();
  const coverageDatabase = path.join(directory, "coverage.sqlite");
  return {
    coverageDatabase,
    database: openCoverageStore(coverageDatabase),
    directory,
  };
}

/**
 * @param {string} file Coverage store path.
 * @param {string} guid Article id.
 * @returns {Record<string, unknown>} That article.
 */
export function readArticle(file, guid) {
  const database = openCoverageStore(file);
  try {
    const row = database
      .prepare(
        `SELECT guid, stage, text_source AS textSource, extracted_text AS extractedText,
                body_html AS bodyHtml, publisher_url AS publisherUrl,
                attempt_count AS attemptCount, retryable, last_error AS lastError
           FROM articles WHERE guid = ?`,
      )
      .get(guid);
    if (row === undefined) {
      throw new Error(`missing article ${guid}`);
    }
    return /** @type {Record<string, unknown>} */ (row);
  } finally {
    database.close();
  }
}
