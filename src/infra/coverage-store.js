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
  backfilled_at TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS articles (
  guid TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  published_at TEXT NOT NULL,
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
  return openDatabase(path, SCHEMA);
}

/**
 * Inserts or updates every seed company in one transaction.
 * ponytail: `backfilled_at` survives a query change, because the overlay is final before the real backfill.
 * To re-collect one company, `UPDATE companies SET backfilled_at = NULL WHERE id = ?`.
 * ponytail: a line removed from the seed keeps its row. Delete it when the seed actually shrinks.
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {import("../core/overlay.js").Company[]} companies Seed companies with the overlay applied.
 * @returns {void}
 */
export function syncCompanies(database, companies) {
  const upsert = database.prepare(`
    INSERT INTO companies (id, display_name, query_name, aliases, descriptor, query_terms)
    VALUES (@id, @displayName, @queryName, @aliases, @descriptor, @queryTerms)
    ON CONFLICT (id) DO UPDATE SET
      display_name = excluded.display_name,
      query_name = excluded.query_name,
      aliases = excluded.aliases,
      descriptor = excluded.descriptor,
      query_terms = excluded.query_terms
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
  const insertArticle = database.prepare(`
    INSERT INTO articles (guid, title, published_at, publisher_name, publisher_homepage, google_url, stage)
    VALUES (@guid, @title, @publishedAt, @publisherName, @publisherHomepage, @link, 'unwrap')
    ON CONFLICT (guid) DO NOTHING
  `);
  const insertLink = database.prepare(`
    INSERT INTO company_articles (company_id, guid, origin) VALUES (?, ?, 'backfill')
    ON CONFLICT (company_id, guid) DO NOTHING
  `);
  const markDone = database.prepare(
    "UPDATE companies SET backfilled_at = ? WHERE id = ?",
  );
  return database.transaction(() => {
    if (markDone.run(at, companyId).changes !== 1) {
      throw new Error(`Company ${companyId} is not in the coverage store`);
    }
    let inserted = 0;
    for (const item of items) {
      insertArticle.run(item);
      inserted += insertLink.run(companyId, item.guid).changes;
    }
    return inserted;
  })();
}
