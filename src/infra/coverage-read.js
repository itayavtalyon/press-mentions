import { ownValue } from "../core/common.js";
import { VISIBLE_VERDICTS } from "../core/filters.js";

/**
 * Dashboard reads on the coverage store (ADR 0005, ADR 0008). Filtering and grouping happen in SQL.
 * `published_at` is always `toISOString` text (schema CHECK), so text comparison is time comparison.
 */

/**
 * @typedef {import("../core/filters.js").CoverageQuery} CoverageQuery
 * @typedef {import("../core/dashboard.js").CompanyCoverage} CompanyCoverage
 * @typedef {import("../core/dashboard.js").CollectionBounds} CollectionBounds
 * @typedef {object} MentionRow One visible mention on a company page.
 * @property {string} guid Article id.
 * @property {string} title Headline.
 * @property {string} publishedAt ISO timestamp.
 * @property {string | undefined} publisherName Publisher.
 * @property {string | undefined} publisherUrl Unwrapped URL, undefined when unwrap failed.
 * @property {string} googleUrl Google News URL.
 * @property {string | undefined} textSource `body` or `title`.
 * @property {string} verdict Visible verdict.
 * @property {string | undefined} excerpt Start of the extracted text, or undefined without text.
 * @typedef {object} FlaggedRow One `uncertain` row on `/review`.
 * @property {string} companyId Company slug.
 * @property {string} companyName Display name.
 * @property {string} guid Article id.
 * @property {string} title Headline.
 * @property {string} publishedAt ISO timestamp.
 * @property {string | undefined} publisherUrl Unwrapped URL.
 * @property {string} googleUrl Google News URL.
 * @property {string | undefined} textSource `body` or `title`.
 * @property {string | undefined} rawResponse Model reply as received.
 */

/*
 * ponytail: the page collapses whitespace, then cuts at 300. 600 raw characters covers that
 * unless the text is mostly whitespace.
 */
const EXCERPT_SOURCE_CHARACTERS = 600;

const VISIBLE_LINK = `SELECT ca.company_id, ca.verdict, a.published_at
  FROM company_articles AS ca JOIN articles AS a ON a.guid = ca.guid
  WHERE ca.verdict IN (SELECT value FROM json_each(@visible))`;

const COVERAGE = `SELECT c.id, c.display_name AS displayName, c.aliases, c.descriptor,
    (SELECT MAX(v.published_at) FROM (${VISIBLE_LINK}) AS v WHERE v.company_id = c.id) AS lastMentionedAt,
    COUNT(*) FILTER (WHERE w.verdict = 'negative') AS negative,
    COUNT(*) FILTER (WHERE w.verdict = 'positive') AS positive,
    COUNT(*) FILTER (WHERE w.verdict = 'neutral') AS neutral,
    COUNT(*) FILTER (WHERE w.verdict = 'unranked') AS unranked
  FROM companies AS c
  LEFT JOIN (${VISIBLE_LINK}
      AND a.published_at >= @from AND a.published_at < @to
      AND ca.verdict IN (SELECT value FROM json_each(@verdicts))) AS w
    ON w.company_id = c.id
  WHERE @id IS NULL OR c.id = @id
  GROUP BY c.id
  ORDER BY c.id`;

const MENTIONS = `SELECT a.guid, a.title, a.published_at AS publishedAt, a.publisher_name AS publisherName,
    a.publisher_url AS publisherUrl, a.google_url AS googleUrl, a.text_source AS textSource, ca.verdict,
    substr(a.extracted_text, 1, @excerptCharacters) AS excerpt
  FROM company_articles AS ca JOIN articles AS a ON a.guid = ca.guid
  WHERE ca.company_id = @id
    AND a.published_at >= @from AND a.published_at < @to
    AND ca.verdict IN (SELECT value FROM json_each(@verdicts))
  ORDER BY a.published_at DESC, a.guid`;

const FLAGGED = `SELECT ca.company_id AS companyId, c.display_name AS companyName, a.guid, a.title,
    a.published_at AS publishedAt, a.publisher_url AS publisherUrl, a.google_url AS googleUrl,
    a.text_source AS textSource, ca.raw_response AS rawResponse
  FROM company_articles AS ca
    JOIN articles AS a ON a.guid = ca.guid
    JOIN companies AS c ON c.id = ca.company_id
  WHERE ca.verdict = 'uncertain'
  ORDER BY a.published_at DESC, c.display_name, a.guid`;

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {CoverageQuery} query Window and verdicts.
 * @returns {CompanyCoverage[]} Every company with its counts, in id order. The caller sorts.
 */
export function allCompanyCoverage(database, query) {
  return database
    .prepare(COVERAGE)
    .all(coverageParameters(query))
    .map((row) => coverageFromRow(row));
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {string} id Company slug.
 * @param {CoverageQuery} query Window and verdicts.
 * @returns {CompanyCoverage | undefined} That company, or undefined for an unknown id.
 */
export function companyCoverage(database, id, query) {
  const row = database.prepare(COVERAGE).get(coverageParameters(query, id));
  return row === undefined ? undefined : coverageFromRow(row);
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {string} id Company slug.
 * @param {CoverageQuery} query Window and verdicts.
 * @returns {MentionRow[]} Matching visible mentions, newest first.
 */
export function companyMentions(database, id, query) {
  return database
    .prepare(MENTIONS)
    .all({
      excerptCharacters: EXCERPT_SOURCE_CHARACTERS,
      from: query.range.from.toISOString(),
      id,
      to: query.range.to.toISOString(),
      verdicts: JSON.stringify(query.verdicts),
    })
    .map((row) => mentionFromRow(new Object(row)));
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @returns {FlaggedRow[]} Every `uncertain` row, newest first, then by company name.
 */
export function flaggedRows(database) {
  return database
    .prepare(FLAGGED)
    .all()
    .map((row) => flaggedFromRow(new Object(row)));
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @returns {number} How many rows `/review` lists.
 */
export function flaggedCount(database) {
  return Number(
    database
      .prepare(
        "SELECT COUNT(*) FROM company_articles WHERE verdict = 'uncertain'",
      )
      .pluck()
      .get(),
  );
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @returns {CollectionBounds} The first backfill and the first stored article, or undefined.
 */
export function collectionBounds(database) {
  const row = new Object(
    database
      .prepare(
        `SELECT (SELECT MIN(backfilled_at) FROM companies) AS firstBackfilledAt,
           (SELECT MIN(published_at) FROM articles) AS firstPublishedAt`,
      )
      .get(),
  );
  return {
    firstBackfilledAt: optionalText(row, "firstBackfilledAt"),
    firstPublishedAt: optionalText(row, "firstPublishedAt"),
  };
}

/**
 * @param {CoverageQuery} query Window and verdicts.
 * @param {string} [id] One company. Omitted means all.
 * @returns {Record<string, string | undefined>} Named parameters for COVERAGE.
 */
function coverageParameters(query, id) {
  return {
    from: query.range.from.toISOString(),
    id,
    to: query.range.to.toISOString(),
    verdicts: JSON.stringify(query.verdicts),
    visible: JSON.stringify(VISIBLE_VERDICTS),
  };
}

/**
 * @param {unknown} value One COVERAGE row.
 * @returns {CompanyCoverage} The narrowed row.
 */
function coverageFromRow(value) {
  const row = new Object(value);
  return {
    aliases: aliasesFromText(String(ownValue(row, "aliases"))),
    counts: {
      negative: Number(ownValue(row, "negative")),
      neutral: Number(ownValue(row, "neutral")),
      positive: Number(ownValue(row, "positive")),
      unranked: Number(ownValue(row, "unranked")),
    },
    descriptor: optionalText(row, "descriptor"),
    displayName: String(ownValue(row, "displayName")),
    id: String(ownValue(row, "id")),
    lastMentionedAt: optionalText(row, "lastMentionedAt"),
  };
}

/**
 * @param {object} row One MENTIONS row.
 * @returns {MentionRow} The narrowed row.
 */
function mentionFromRow(row) {
  return {
    excerpt: optionalText(row, "excerpt"),
    googleUrl: String(ownValue(row, "googleUrl")),
    guid: String(ownValue(row, "guid")),
    publishedAt: String(ownValue(row, "publishedAt")),
    publisherName: optionalText(row, "publisherName"),
    publisherUrl: optionalText(row, "publisherUrl"),
    textSource: optionalText(row, "textSource"),
    title: String(ownValue(row, "title")),
    verdict: String(ownValue(row, "verdict")),
  };
}

/**
 * @param {object} row One FLAGGED row.
 * @returns {FlaggedRow} The narrowed row.
 */
function flaggedFromRow(row) {
  return {
    companyId: String(ownValue(row, "companyId")),
    companyName: String(ownValue(row, "companyName")),
    googleUrl: String(ownValue(row, "googleUrl")),
    guid: String(ownValue(row, "guid")),
    publishedAt: String(ownValue(row, "publishedAt")),
    publisherUrl: optionalText(row, "publisherUrl"),
    rawResponse: optionalText(row, "rawResponse"),
    textSource: optionalText(row, "textSource"),
    title: String(ownValue(row, "title")),
  };
}

/**
 * @param {string} text The `aliases` column, a JSON array of names (written by `syncCompanies`).
 * @returns {string[]} The names.
 * @throws {Error} The column is not a JSON array of strings.
 */
function aliasesFromText(text) {
  /**
   * @type {unknown}
   */
  const parsed = JSON.parse(text);
  if (
    !Array.isArray(parsed) ||
    parsed.some((alias) => typeof alias !== "string")
  ) {
    throw new Error(`companies.aliases is not an array of names: ${text}`);
  }
  return parsed;
}

/**
 * @param {object} row Database row.
 * @param {string} key Column alias.
 * @returns {string | undefined} The text, or undefined for NULL.
 */
function optionalText(row, key) {
  const value = ownValue(row, key);
  return typeof value === "string" ? value : undefined;
}
