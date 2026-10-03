/* eslint-disable unicorn/no-null -- SQLite stores a missing verdict, note, or text as NULL. */
import { LIVE_MODEL, LIVE_PROMPT_VERSION } from "../../src/core/classifier.js";
import {
  openCoverageStore,
  syncCompanies,
} from "../../src/infra/coverage-store.js";
import { runClassify } from "../../src/jobs/run-classify.js";

import { givenClock, givenLog } from "./fakes.js";
import { givenQueueStore } from "./queue.js";

const DAY = Date.parse("2026-08-01T00:00:00.000Z");

/**
 * @param {number} index Days after 2026-08-01.
 * @returns {string} ISO timestamp.
 */
export function day(index) {
  return new Date(DAY + index * 86_400_000).toISOString();
}

/**
 * @param {{ id: string, queryName: string, descriptor?: string }[]} companies Companies to insert.
 * @returns {{ coverageDatabase: string, database: import("better-sqlite3").Database, directory: string }}
 *   Open store. Close it before the job runs, unless the test updates a row mid-call.
 */
export function openStore(companies) {
  const store = givenQueueStore();
  syncCompanies(
    store.database,
    companies.map((company) => ({
      aliases: [],
      descriptor: company.descriptor,
      displayName: `${company.queryName} (seed)`,
      id: company.id,
      queryName: company.queryName,
      queryTerms: [],
    })),
  );
  return store;
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {{ guid: string, publishedAt: string, extractedText?: string | null, publisherName?: string | null, publisherHomepage?: string | null, stage?: string, attemptCount?: number, retryable?: number }} fields
 *   Article fields. Omitted text and publisher columns are NULL.
 * @returns {void}
 */
export function article(database, fields) {
  database
    .prepare(
      `INSERT INTO articles (
         guid, title, published_at, publisher_name, publisher_homepage, google_url,
         extracted_text, text_source, stage, attempt_count, retryable
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'body', ?, ?, ?)`,
    )
    .run(
      fields.guid,
      `Title ${fields.guid}`,
      fields.publishedAt,
      fields.publisherName === undefined ? null : fields.publisherName,
      fields.publisherHomepage === undefined ? null : fields.publisherHomepage,
      `https://news.google.com/rss/articles/${fields.guid}`,
      fields.extractedText === undefined ? null : fields.extractedText,
      fields.stage ?? "classify",
      fields.attemptCount ?? 0,
      fields.retryable ?? 1,
    );
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {string} companyId Company id.
 * @param {string} guid Article id.
 * @param {{ verdict?: string, modelId?: string, promptVersion?: string, rawResponse?: string, reviewFlag?: number }} [columns]
 *   Verdict columns. Omitted columns stay NULL.
 * @returns {void}
 */
export function link(database, companyId, guid, columns = {}) {
  database
    .prepare(
      `INSERT INTO company_articles (
         company_id, guid, origin, verdict, model_id, prompt_version, raw_response, review_flag
       ) VALUES (?, ?, 'backfill', ?, ?, ?, ?, ?)`,
    )
    .run(
      companyId,
      guid,
      columns.verdict ?? null,
      columns.modelId ?? null,
      columns.promptVersion ?? null,
      columns.rawResponse ?? null,
      columns.reviewFlag ?? 0,
    );
}

/**
 * @param {string} companyId Company id.
 * @param {string} verdict Stored verdict.
 * @param {string} rawResponse Model reply.
 * @param {number} [reviewFlag] Review flag. Defaults to 0.
 * @returns {Record<string, string | number>} Expected link row.
 */
export function stored(companyId, verdict, rawResponse, reviewFlag = 0) {
  return {
    companyId,
    modelId: LIVE_MODEL,
    promptVersion: LIVE_PROMPT_VERSION,
    rawResponse,
    reviewFlag,
    verdict,
  };
}

/**
 * @param {string} file Coverage store path.
 * @param {string} guid Article id.
 * @returns {Record<string, unknown>[]} Company links, ordered by company id.
 */
export function readLinks(file, guid) {
  const database = openCoverageStore(file);
  try {
    return /** @type {Record<string, unknown>[]} */ (
      database
        .prepare(
          `SELECT company_id AS companyId, verdict, model_id AS modelId,
                  prompt_version AS promptVersion, raw_response AS rawResponse,
                  review_flag AS reviewFlag
             FROM company_articles WHERE guid = ? ORDER BY company_id`,
        )
        .all(guid)
    );
  } finally {
    database.close();
  }
}

/**
 * @param {string} coverageDatabase Coverage store path.
 * @param {(request: import("../../src/core/classifier.js").ClassifierRequest) => Promise<string>} chat
 *   Scripted model.
 * @param {import("../../src/infra/logger.js").Log} [log] Logger.
 * @returns {Promise<{ sleeps: number[], summary: { classified: number, moved: number, remaining: number, retried: number, skipped: number, terminal: number, stoppedBy?: string } }>}
 *   Recorded waits and the run summary.
 */
export async function run(coverageDatabase, chat, log = givenLog().log) {
  const { clock, sleeps } = givenClock();
  const summary = await runClassify(
    { coverageDatabase },
    { chat, clock, log, random: () => 0 },
  );
  return { sleeps, summary };
}

/**
 * One open Acme article at classify.
 * @param {{ extractedText?: string | null, publisherName?: string | null, publisherHomepage?: string | null, stage?: string, attemptCount?: number, retryable?: number }} [articleFields]
 *   Overrides for the article.
 * @param {{ verdict?: string, modelId?: string, promptVersion?: string, rawResponse?: string, reviewFlag?: number }} [columns]
 *   Stored verdict. Omit it for an open link.
 * @returns {string} Coverage store path.
 */
export function givenAcme(articleFields = {}, columns = {}) {
  const { coverageDatabase, database } = openStore([
    { descriptor: "payments company", id: "acme", queryName: "Acme" },
  ]);
  article(database, {
    extractedText: "Body",
    guid: "g1",
    publishedAt: day(0),
    publisherHomepage: "https://news.example",
    publisherName: "Example News",
    ...articleFields,
  });
  link(database, "acme", "g1", columns);
  database.close();
  return coverageDatabase;
}

/**
 * @param {number} count How many open articles, guids `g0` and up.
 * @returns {string} Coverage store path.
 */
export function givenMany(count) {
  const { coverageDatabase, database } = openStore([
    { descriptor: "payments company", id: "acme", queryName: "Acme" },
  ]);
  for (let index = 0; index < count; index += 1) {
    const guid = `g${index}`;
    article(database, {
      extractedText: `BODY-${guid}-END`,
      guid,
      publishedAt: day(index),
      publisherHomepage: "https://news.example",
      publisherName: "Example News",
    });
    link(database, "acme", guid);
  }
  database.close();
  return coverageDatabase;
}
/* eslint-enable unicorn/no-null -- End of the SQLite NULL fixtures. */
