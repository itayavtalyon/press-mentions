import { ownValue } from "../core/common.js";
import { isOwnSite } from "../core/dashboard.js";

import { openDatabase } from "./database.js";

/**
 * Coverage store (ADR 0005). The stage queue reads and writes live in `stage-queue.js`.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL UNIQUE,
  query_name TEXT NOT NULL,
  aliases TEXT NOT NULL CHECK (json_valid(aliases)),
  descriptor TEXT,
  query_terms TEXT NOT NULL CHECK (json_valid(query_terms)),
  backfilled_at TEXT,
  website TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS articles (
  guid TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  -- toISOString shape only, so comparing text compares instants (dashboard windows).
  published_at TEXT NOT NULL CHECK (
    published_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
  ),
  publisher_name TEXT,
  publisher_homepage TEXT,
  publisher_url TEXT,
  google_url TEXT NOT NULL,
  body_html TEXT,
  extracted_text TEXT,
  text_source TEXT CHECK (text_source IN ('body', 'title')),
  stage TEXT NOT NULL CHECK (stage IN ('unwrap', 'fetch', 'extract', 'classify')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  retryable INTEGER NOT NULL DEFAULT 1 CHECK (retryable IN (0, 1))
) STRICT;

CREATE TABLE IF NOT EXISTS company_articles (
  company_id TEXT NOT NULL REFERENCES companies (id),
  guid TEXT NOT NULL REFERENCES articles (guid),
  origin TEXT NOT NULL CHECK (origin IN ('backfill', 'daily')),
  alert_eligible INTEGER NOT NULL DEFAULT 0 CHECK (alert_eligible IN (0, 1)),
  verdict TEXT CHECK (verdict IN ('positive', 'negative', 'neutral', 'unranked', 'unrelated', 'uncertain')),
  model_id TEXT, prompt_version TEXT, raw_response TEXT,
  review_flag INTEGER NOT NULL DEFAULT 0 CHECK (review_flag IN (0, 1)),
  PRIMARY KEY (company_id, guid)
) STRICT;

CREATE INDEX IF NOT EXISTS company_articles_by_guid ON company_articles (guid);
`;

/**
 * Opens the coverage store. The caller closes it.
 * @param {string} path Database file.
 * @returns {import("better-sqlite3").Database} The open connection.
 */
export function openCoverageStore(path) {
  const database = openDatabase(path, SCHEMA);
  // ponytail: the one column added after the first real run. A second one earns a schema version.
  const hasWebsite = database
    .prepare(
      "SELECT 1 FROM pragma_table_info('companies') WHERE name = 'website'",
    )
    .get();
  if (hasWebsite === undefined) {
    database.exec("ALTER TABLE companies ADD COLUMN website TEXT");
  }
  database.function(
    "own_site",
    { deterministic: true },
    (companyId, website, homepage) =>
      Number(
        isOwnSite(String(companyId), optional(website), optional(homepage)),
      ),
  );
  return database;
}

/**
 * @param {unknown} value A SQL argument.
 * @returns {string | undefined} The text, or undefined for NULL.
 */
function optional(value) {
  return typeof value === "string" ? value : undefined;
}

/**
 * Inserts or updates every seed company in one transaction.
 * ponytail: `backfilled_at` survives a query change, because the overlay is final before the real backfill.
 * Clearing it makes the next run search again and add links. It does not remove links already stored.
 * ponytail: a line removed from the seed keeps its row. Delete it when the seed actually shrinks.
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {import("../core/overlay.js").Company[]} companies Seed companies with the overlay applied.
 * @returns {void}
 */
export function syncCompanies(database, companies) {
  const upsert = database.prepare(`
    INSERT INTO companies (id, display_name, query_name, aliases, descriptor, query_terms, website)
    VALUES (@id, @displayName, @queryName, @aliases, @descriptor, @queryTerms, @website)
    ON CONFLICT (id) DO UPDATE SET
      display_name = excluded.display_name,
      query_name = excluded.query_name,
      aliases = excluded.aliases,
      descriptor = excluded.descriptor,
      query_terms = excluded.query_terms,
      website = excluded.website
  `);
  database.transaction(() => {
    for (const company of companies) {
      upsert.run({
        ...company,
        aliases: JSON.stringify(company.aliases),
        queryTerms: JSON.stringify(company.queryTerms),
      });
    }
  })();
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @returns {Set<string>} Ids of companies whose backfill feed stage has committed (ADR 0006).
 */
export function backfilledCompanyIds(database) {
  const ids = database
    .prepare("SELECT id FROM companies WHERE backfilled_at IS NOT NULL")
    .pluck()
    .all();
  return new Set(ids.map(String));
}

/**
 * Stores one company's backfill candidates and marks its feed stage done, in one transaction.
 * An article already stored for another company gains a link and keeps its text stages.
 * Backfill links are never alert-eligible (ADR 0007).
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {{ companyId: string, items: import("../core/collect.js").FeedItem[], at: string }} batch
 *   Company, its candidates, and the run start as an ISO timestamp.
 * @returns {number} How many company links were new.
 * @throws {Error} The company is not in the store. Nothing is written.
 */
export function recordBackfill(database, { companyId, items, at }) {
  const markDone = database.prepare(
    "UPDATE companies SET backfilled_at = ? WHERE id = ?",
  );
  return database.transaction(() => {
    if (markDone.run(at, companyId).changes !== 1) {
      throw new Error(`Company ${companyId} is not in the coverage store`);
    }
    return storeFeedLinks(database, companyId, items, "backfill");
  })();
}

/**
 * Stores one company's forward-feed candidates. An article already stored keeps its text stages.
 * A link that company already has, including a backfill link, is left unchanged (ADR 0007).
 * This does not set `backfilled_at` and does not set `alert_eligible`.
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {{ companyId: string, items: import("../core/collect.js").FeedItem[] }} batch
 *   Company and its candidates.
 * @returns {number} How many company links were new.
 * @throws {Error} The company is not in the store. Nothing is written.
 */
export function recordDaily(database, { companyId, items }) {
  const exists = database.prepare("SELECT 1 FROM companies WHERE id = ?");
  return database.transaction(() => {
    if (exists.get(companyId) === undefined) {
      throw new Error(`Company ${companyId} is not in the coverage store`);
    }
    return storeFeedLinks(database, companyId, items, "daily");
  })();
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {string} companyId Company slug.
 * @param {import("../core/collect.js").FeedItem[]} items Candidates to store.
 * @param {"backfill" | "daily"} origin Link origin. A conflict does not change it.
 * @returns {number} How many company links were new.
 */
function storeFeedLinks(database, companyId, items, origin) {
  const insertArticle = database.prepare(`
    INSERT INTO articles (guid, title, published_at, publisher_name, publisher_homepage, google_url, stage)
    VALUES (@guid, @title, @publishedAt, @publisherName, @publisherHomepage, @link, 'unwrap')
    ON CONFLICT (guid) DO NOTHING
  `);
  const insertLink = database.prepare(`
    INSERT INTO company_articles (company_id, guid, origin) VALUES (?, ?, ?)
    ON CONFLICT (company_id, guid) DO NOTHING
  `);
  let inserted = 0;
  for (const item of items) {
    insertArticle.run(item);
    inserted += insertLink.run(companyId, item.guid, origin).changes;
  }
  return inserted;
}

/**
 * @typedef {object} AlertCandidate A classified mention the digest may enqueue. It does not know about `notified`.
 * @property {string} companyId Company slug.
 * @property {string} displayName Company line in the digest.
 * @property {string} guid Article id.
 * @property {string} title Headline.
 * @property {string} publishedAt `toISOString` text.
 * @property {string | undefined} publisherUrl Unwrapped URL, undefined when it is null.
 * @property {string} googleUrl Google News URL.
 * @property {string} verdict `positive`, `negative`, `neutral`, or `unranked`.
 */

/**
 * Sets `alert_eligible` on daily mentions whose verdict can alert.
 * Backfill stays unset. Unrelated, uncertain, and unclassified stay unset.
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @returns {number} Rows marked on this run.
 */
export function markAlertEligible(database) {
  const { changes } = database
    .prepare(
      `UPDATE company_articles
       SET alert_eligible = 1
       WHERE origin = 'daily'
         AND alert_eligible = 0
         AND verdict IN ('negative', 'positive', 'neutral', 'unranked')`,
    )
    .run();
  return changes;
}

/**
 * Company ids, in id order. The digest upserts `ALERT_EMAIL` for each one.
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @returns {string[]} Every company id.
 */
export function companyIds(database) {
  return database
    .prepare("SELECT id FROM companies ORDER BY id")
    .pluck()
    .all()
    .map(String);
}

/**
 * Mentions whose verdict can alert, with `alert_eligible` set, and `published_at` in `[from, until)`.
 * Text comparison is time comparison because `published_at` is `toISOString`.
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {string} from Inclusive window start, `toISOString`.
 * @param {string} until Exclusive window end, `toISOString`.
 * @returns {AlertCandidate[]} Matching mentions. Order is not significant.
 */
export function alertCandidates(database, from, until) {
  // ponytail: alert verdicts repeat VISIBLE_VERDICTS; follow-up: share that list only if alert eligibility and the dashboard stay one rule.
  return database
    .prepare(
      `SELECT c.id AS companyId, c.display_name AS displayName, a.guid, a.title,
         a.published_at AS publishedAt, a.publisher_url AS publisherUrl,
         a.google_url AS googleUrl, ca.verdict
       FROM company_articles AS ca
       JOIN articles AS a ON a.guid = ca.guid
       JOIN companies AS c ON c.id = ca.company_id
       WHERE ca.alert_eligible = 1
         AND ca.verdict IN ('negative', 'positive', 'neutral', 'unranked')
         AND a.published_at >= ?
         AND a.published_at < ?`,
    )
    .all(from, until)
    .map((row) => candidateFromRow(new Object(row)));
}

/**
 * @param {object} row Alert candidate query row.
 * @returns {AlertCandidate} The narrowed row.
 */
function candidateFromRow(row) {
  return {
    companyId: String(ownValue(row, "companyId")),
    displayName: String(ownValue(row, "displayName")),
    googleUrl: String(ownValue(row, "googleUrl")),
    guid: String(ownValue(row, "guid")),
    publishedAt: String(ownValue(row, "publishedAt")),
    publisherUrl: textOrUndefined(ownValue(row, "publisherUrl")),
    title: String(ownValue(row, "title")),
    verdict: String(ownValue(row, "verdict")),
  };
}

/**
 * @param {unknown} value Column value.
 * @returns {string | undefined} The text, or undefined for NULL.
 */
function textOrUndefined(value) {
  return typeof value === "string" ? value : undefined;
}
