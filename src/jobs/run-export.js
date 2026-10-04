/* eslint-disable security/detect-non-literal-fs-filename -- Every path is under the configured export directory. */
/* eslint-disable unicorn/no-null -- The export's JSON uses null for "none" (ADR 0005). */
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { lastQuarter } from "../core/collection.js";
import { VISIBLE_VERDICTS } from "../core/filters.js";
import { daysSince } from "../core/mention-status.js";
import { openAlertsStore } from "../infra/alerts-store.js";
import { allCompanyCoverage, companyMentions } from "../infra/coverage-read.js";
import { openCoverageStore } from "../infra/coverage-store.js";
import { SqliteDatabase } from "../infra/database.js";
import { withCommandLock } from "../infra/lock.js";

/**
 * GitHub refuses a file over 100 MB.
 */
const MAX_COPY_BYTES = 100 * 1024 * 1024;
const REDACTED_EMAIL = "redacted@example.com";

/**
 * @typedef {object} ExportConfig
 * @property {string} coverageDatabase Coverage SQLite path. The lock sits next to it.
 * @property {string} alertsDatabase Alerts SQLite path.
 * @property {string} evaluationDatabase Evaluation SQLite path.
 * @property {string} outDirectory Folder the export writes into.
 * @property {number} [maxCopyBytes] Largest SQLite copy allowed. Defaults to GitHub's 100 MB file limit.
 * @typedef {object} ExportSummary
 * @property {number} companies Company files written.
 * @property {number} mentions Mentions across those files.
 * @property {number} alerts Outbox rows written to `alerts.json`.
 */

/**
 * Writes the graded export (ADR 0005): JSON per company for the previous complete UTC quarter,
 * a status summary, the alert outbox, and compacted SQLite copies with emails redacted.
 * It reads the stores and never changes them.
 * @param {ExportConfig} config Paths.
 * @param {{ clock: import("../infra/clock.js").Clock }} ports Time.
 * @returns {Promise<ExportSummary>} What was written.
 * @throws {Error} Another export holds the lock, or a SQLite copy is over 100 MB.
 */
export async function runExport(config, { clock }) {
  return withCommandLock(config.coverageDatabase, "export", () => {
    const now = new Date(clock.now());
    const limit = config.maxCopyBytes ?? MAX_COPY_BYTES;
    const sqliteDirectory = path.join(config.outDirectory, "sqlite");
    const companiesDirectory = path.join(config.outDirectory, "companies");
    rmSync(companiesDirectory, { force: true, recursive: true });
    rmSync(sqliteDirectory, { force: true, recursive: true });
    mkdirSync(companiesDirectory, { recursive: true });
    mkdirSync(sqliteDirectory, { recursive: true });

    const coverage = writeCoverage(config.coverageDatabase, now, {
      companiesDirectory,
      outDirectory: config.outDirectory,
    });
    const alerts = writeAlerts(config.alertsDatabase, config.outDirectory);

    copyStore(
      config.coverageDatabase,
      path.join(sqliteDirectory, "coverage.sqlite"),
      limit,
      dropRawHtml,
    );
    copyStore(
      config.evaluationDatabase,
      path.join(sqliteDirectory, "evaluation.sqlite"),
      limit,
    );
    copyStore(
      config.alertsDatabase,
      path.join(sqliteDirectory, "alerts.sqlite"),
      limit,
      redactEmails,
    );

    return { ...coverage, alerts };
  });
}

/**
 * @param {string} databasePath Coverage store.
 * @param {Date} now Export instant.
 * @param {{ companiesDirectory: string, outDirectory: string }} paths Output folders.
 * @returns {{ companies: number, mentions: number }} Counts written.
 */
function writeCoverage(databasePath, now, paths) {
  const database = openCoverageStore(databasePath);
  try {
    const range = lastQuarter(now);
    const query = { range, verdicts: VISIBLE_VERDICTS };
    const asOf = now.toISOString();
    let mentions = 0;

    const companies = allCompanyCoverage(database, query).map((company) => {
      const rows = companyMentions(database, company.id, query);
      mentions += rows.length;
      const lastMentionedAt = company.lastMentionedAt ?? null;
      writeJson(path.join(paths.companiesDirectory, `${company.id}.json`), {
        name: company.displayName,
        last_mentioned_at: lastMentionedAt,
        as_of: asOf,
        mentions: rows.map((row) => ({
          title: row.title,
          link: row.publisherUrl ?? row.googleUrl,
          publisher: row.publisherName ?? null,
          published_at: row.publishedAt,
          verdict: row.verdict,
          text_source: row.textSource ?? null,
        })),
      });
      return {
        id: company.id,
        name: company.displayName,
        last_mentioned_at: lastMentionedAt,
        days_since_last_mention:
          lastMentionedAt === null
            ? null
            : daysSince(new Date(lastMentionedAt), now),
        quarter_counts: company.counts,
      };
    });

    writeJson(path.join(paths.outDirectory, "summary.json"), {
      as_of: asOf,
      quarter: { from: range.from.toISOString(), to: range.to.toISOString() },
      companies,
    });
    return { companies: companies.length, mentions };
  } finally {
    database.close();
  }
}

/**
 * Writes the outbox without addresses, so a reviewer sees each alert body.
 * @param {string} databasePath Alerts store.
 * @param {string} outDirectory Export folder.
 * @returns {number} Rows written.
 */
function writeAlerts(databasePath, outDirectory) {
  const database = openAlertsStore(databasePath);
  try {
    const rows = database
      .prepare(
        "SELECT company_id, created_at, status, sent_at, body FROM outbox ORDER BY created_at, id",
      )
      .all();
    writeJson(path.join(outDirectory, "alerts.json"), rows);
    return rows.length;
  } finally {
    database.close();
  }
}

/**
 * A consistent, compacted snapshot. `VACUUM INTO` reads in one transaction, so a WAL store mid-write is not torn.
 * `scrub` runs on the copy in one transaction, then the copy is vacuumed again so removed text is not left
 * in free pages, and switched out of WAL so it is a single file.
 * @param {string} source Live store.
 * @param {string} target Copy path. It must not exist.
 * @param {number} maxBytes Largest copy allowed, checked after the scrub.
 * @param {(database: SqliteDatabase) => void} [scrub] Statements that remove what must not be published.
 * @throws {Error} The copy is over `maxBytes`. The copy is deleted.
 */
function copyStore(source, target, maxBytes, scrub = () => {}) {
  const live = new SqliteDatabase(source);
  try {
    live.connection().prepare("VACUUM INTO ?").run(target);
  } finally {
    live.close();
  }
  const copy = new SqliteDatabase(target);
  try {
    copy.transaction(() => {
      scrub(copy);
    });
    copy.exec("VACUUM");
    copy.exec("PRAGMA journal_mode = DELETE");
  } finally {
    copy.close();
  }
  if (statSync(target).size <= maxBytes) {
    return;
  }
  rmSync(target);
  throw new Error(`${target} is over ${maxBytes} bytes`);
}

/**
 * Raw HTML is a pipeline buffer that extract discards. A row still waiting for extract can hold a
 * publisher's page scripts, including that publisher's API tokens, so the copy never keeps it.
 * @param {SqliteDatabase} database The exported coverage copy, never the live store.
 */
function dropRawHtml(database) {
  database.prepare("UPDATE articles SET body_html = NULL").run();
}

/**
 * @param {SqliteDatabase} database The exported alerts copy, never the live store.
 */
function redactEmails(database) {
  for (const table of ["subscriptions", "notified", "outbox"]) {
    database
      .prepare(`UPDATE OR IGNORE ${table} SET email = @email`)
      .run({ email: REDACTED_EMAIL });
    database.prepare(`DELETE FROM ${table} WHERE email <> @email`).run({
      email: REDACTED_EMAIL,
    });
  }
}

/**
 * @param {string} file Target path.
 * @param {unknown} value JSON value.
 */
function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, undefined, 2)}\n`);
}
/* eslint-enable unicorn/no-null -- End of the export JSON. */
/* eslint-enable security/detect-non-literal-fs-filename -- End of export writes. */
