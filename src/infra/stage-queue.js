import { isRecord, ownValue } from "../core/common.js";

/**
 * @typedef {"unwrap" | "fetch" | "extract"} TextStage
 * @typedef {TextStage | "classify"} RetryStage
 * @typedef {object} ClassifyLink
 * @property {string} companyId Company id.
 * @property {string} queryName Name sent to the model.
 * @property {string | null} descriptor Overlay note, or null.
 * @typedef {object} ClassifyArticle
 * @property {string} guid Google item id.
 * @property {string | null} extractedText Stored text. Null was not written by extract.
 * @property {string | null} publisherName Publisher, or null.
 * @property {string | null} publisherHomepage Homepage, or null.
 * @property {number} attemptCount Failed runs of classify.
 * @property {ClassifyLink[]} links Open links, ordered by company id.
 * @typedef {object} StoredVerdict
 * @property {string} companyId Company id.
 * @property {string} verdict Verdict for this link.
 * @property {number} reviewFlag 1 when the reply was not a JSON object.
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
const OPEN_LINK =
  "(ca.verdict IS NULL OR ca.model_id IS NOT ? OR ca.prompt_version IS NOT ?)";
const CLASSIFY_ROWS = `SELECT a.guid, a.extracted_text AS extractedText,
  a.publisher_name AS publisherName, a.publisher_homepage AS publisherHomepage,
  a.attempt_count AS attemptCount, ca.company_id AS companyId,
  c.query_name AS queryName, c.descriptor AS descriptor
  FROM articles AS a JOIN company_articles AS ca ON ca.guid = a.guid
  JOIN companies AS c ON c.id = ca.company_id
  WHERE a.retryable = 1 AND a.stage = 'classify' AND ${OPEN_LINK}
  ORDER BY a.published_at, a.guid, ca.company_id`;

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {TextStage} stage Queue this job owns.
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
 * @param {TextStage} stage Queue to count.
 * @returns {number} Retryable articles still at that stage.
 */
export function articlesRemaining(database, stage) {
  const sql = "SELECT COUNT(*) FROM articles WHERE retryable = 1 AND stage = ?";
  return Number(database.prepare(sql).pluck().get(stage));
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {string} guid Article guid.
 * @param {string} publisherUrl Resolved article URL.
 * @returns {number} 1 when the row was still at `unwrap`, otherwise 0.
 */
export function savePublisherUrl(database, guid, publisherUrl) {
  return writeArticle(
    database,
    `UPDATE articles SET publisher_url = ?, stage = 'fetch', attempt_count = 0,
      last_error = NULL, retryable = 1 WHERE guid = ? AND stage = 'unwrap'`,
    [publisherUrl, guid],
  );
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {string} guid Article guid.
 * @param {string} html Publisher page.
 * @returns {number} 1 when the row was still at `fetch`, otherwise 0.
 */
export function saveBodyHtml(database, guid, html) {
  return writeArticle(
    database,
    `UPDATE articles SET body_html = ?, stage = 'extract', attempt_count = 0,
      last_error = NULL, retryable = 1 WHERE guid = ? AND stage = 'fetch'`,
    [html, guid],
  );
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {string} guid Article guid.
 * @param {TextStage} stage Stage this step owns. Unwrap, fetch, and extract may take this path.
 * @returns {number} 1 when the row was still at `stage`, otherwise 0.
 */
export function saveTitlePath(database, guid, stage) {
  return writeArticle(
    database,
    `UPDATE articles SET extracted_text = title, text_source = 'title', stage = 'classify',
      body_html = NULL, attempt_count = 0, last_error = NULL, retryable = 1
      WHERE guid = ? AND stage = ?`,
    [guid, stage],
  );
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {string} guid Article guid.
 * @param {string} text Readability text.
 * @returns {number} 1 when the row was still at `extract`, otherwise 0.
 */
export function saveExtractedText(database, guid, text) {
  return writeArticle(
    database,
    `UPDATE articles SET extracted_text = ?, text_source = 'body', stage = 'classify',
      body_html = NULL, attempt_count = 0, last_error = NULL, retryable = 1
      WHERE guid = ? AND stage = 'extract'`,
    [text, guid],
  );
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {string} modelId Live model id.
 * @param {string} promptVersion Live prompt version.
 * @returns {ClassifyArticle[]} Open links, oldest first, ordered by company id.
 */
export function articlesToClassify(database, modelId, promptVersion) {
  /**
   * @type {ClassifyArticle[]}
   */
  const articles = [];
  const rows = database.prepare(CLASSIFY_ROWS).all(modelId, promptVersion);
  for (const row of rows) {
    const parsed = classifyFromRow(row);
    const last = articles.at(-1);
    if (last !== undefined && last.guid === parsed.guid) {
      last.links.push(parsed.link);
    } else {
      articles.push({
        attemptCount: parsed.attemptCount,
        extractedText: parsed.extractedText,
        guid: parsed.guid,
        links: [parsed.link],
        publisherHomepage: parsed.publisherHomepage,
        publisherName: parsed.publisherName,
      });
    }
  }
  return articles;
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {string} modelId Live model id.
 * @param {string} promptVersion Live prompt version.
 * @returns {number} Retryable articles at `classify` that still have an open link.
 */
export function classifyRemaining(database, modelId, promptVersion) {
  const sql = `SELECT COUNT(DISTINCT a.guid) FROM articles AS a
    JOIN company_articles AS ca ON ca.guid = a.guid
    WHERE a.retryable = 1 AND a.stage = 'classify' AND ${OPEN_LINK}`;
  return Number(database.prepare(sql).pluck().get(modelId, promptVersion));
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {string} guid Article guid.
 * @param {{ modelId: string, promptVersion: string, rawResponse: string, verdicts: StoredVerdict[] }} stored Verdicts for this call.
 * @returns {number} 1 when the row was still at `classify`, otherwise 0.
 */
export function saveVerdicts(database, guid, stored) {
  const finish = database.prepare(
    `UPDATE articles SET attempt_count = 0, last_error = NULL, retryable = 1
      WHERE guid = ? AND stage = 'classify'`,
  );
  const writeLink = database.prepare(
    `UPDATE company_articles SET verdict = ?, model_id = ?, prompt_version = ?,
      raw_response = ?, review_flag = ? WHERE company_id = ? AND guid = ?`,
  );
  return database.transaction(() => {
    if (finish.run(guid).changes !== 1) {
      return 0;
    }
    for (const row of stored.verdicts) {
      writeLink.run(
        row.verdict,
        stored.modelId,
        stored.promptVersion,
        stored.rawResponse,
        row.reviewFlag,
        row.companyId,
        guid,
      );
    }
    return 1;
  })();
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {{ attemptCount: number, guid: string, stage: RetryStage }} article Row this step still owns.
 * @param {string} message Failure a later run can retry.
 * @returns {number | null} 0 when this was the third exhausted run, 1 when it stays queued, null when the row had already moved.
 */
export function leaveForRetry(database, article, message) {
  const next = article.attemptCount + 1;
  const retryable = next >= 3 ? 0 : 1;
  const changed = writeArticle(
    database,
    `UPDATE articles SET attempt_count = ?, last_error = ?, retryable = ?
      WHERE guid = ? AND stage = ?`,
    [next, message, retryable, article.guid, article.stage],
  );
  // eslint-disable-next-line unicorn/no-null -- 0 is terminal. null means this step no longer owns the row.
  return changed === 1 ? retryable : null;
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {string} guid Article guid.
 * @param {TextStage} stage Stage this step owns.
 * @param {string} message Failure that will not change on its own.
 * @returns {number} 1 when the row was still at `stage`, otherwise 0.
 */
export function saveTerminal(database, guid, stage, message) {
  return writeArticle(
    database,
    "UPDATE articles SET last_error = ?, retryable = 0 WHERE guid = ? AND stage = ?",
    [message, guid, stage],
  );
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {string} sql Update with bound values.
 * @param {unknown[]} values Bound values.
 * @returns {number} How many rows changed.
 */
function writeArticle(database, sql, values) {
  return database.prepare(sql).run(...values).changes;
}

/**
 * @param {unknown} row SQLite row.
 * @returns {Omit<ClassifyArticle, "links"> & { link: ClassifyLink }} Article fields and its next open link.
 */
function classifyFromRow(row) {
  if (!isRecord(row)) {
    throw new TypeError("article row is missing");
  }
  return {
    attemptCount: Number(ownValue(row, "attemptCount")),
    extractedText: nullableText(ownValue(row, "extractedText")),
    guid: String(ownValue(row, "guid")),
    link: {
      companyId: String(ownValue(row, "companyId")),
      descriptor: nullableText(ownValue(row, "descriptor")),
      queryName: String(ownValue(row, "queryName")),
    },
    publisherHomepage: nullableText(ownValue(row, "publisherHomepage")),
    publisherName: nullableText(ownValue(row, "publisherName")),
  };
}

/**
 * @param {unknown} value Column value.
 * @returns {string | null} The text, or null when the column is NULL.
 */
function nullableText(value) {
  // eslint-disable-next-line unicorn/no-null -- SQLite NULL stays null.
  return typeof value === "string" ? value : null;
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
