import path from "node:path";

import { isRecord } from "../../src/core/common.js";
import { openAlertsStore } from "../../src/infra/alerts-store.js";
import { runMail } from "../../src/jobs/run-mail.js";

import { givenClock } from "./fakes.js";
import { givenTemporaryDirectory } from "./files.js";

const HOUR_MS = 3_600_000;

/**
 * Frozen instant for mailer tests.
 */
export const NOW = Date.parse("2026-10-04T12:00:00.000Z");

export const RETAIN_MS = 96 * HOUR_MS;

/**
 * @param {number} ms Milliseconds since the epoch.
 * @returns {string} `toISOString` text.
 */
export function iso(ms) {
  return new Date(ms).toISOString();
}

/**
 * @param {number} hours Hours before {@link NOW}.
 * @returns {string} An ISO timestamp.
 */
export function hoursBefore(hours) {
  return iso(NOW - hours * HOUR_MS);
}

/**
 * @returns {{ alertsDatabase: string, directory: string }} A temp alerts path.
 */
export function givenMailPaths() {
  const directory = givenTemporaryDirectory();
  return {
    alertsDatabase: path.join(directory, "alerts.sqlite"),
    directory,
  };
}

/**
 * @param {import("better-sqlite3").Database} database Alerts store.
 * @param {{
 *   body: string,
 *   companyId?: string,
 *   createdAt: string,
 *   email?: string,
 *   mentionIds: string,
 *   sentAt?: string,
 *   status?: string,
 * }} row Outbox values.
 * @returns {void}
 */
export function insertOutbox(database, row) {
  const values = {
    body: row.body,
    companyId: row.companyId ?? "acme",
    createdAt: row.createdAt,
    email: row.email ?? "alerts@example.com",
    mentionIds: row.mentionIds,
    status: row.status ?? "pending",
  };
  if (row.sentAt === undefined) {
    database
      .prepare(
        `INSERT INTO outbox (email, company_id, body, created_at, status, mention_ids)
         VALUES (@email, @companyId, @body, @createdAt, @status, @mentionIds)`,
      )
      .run(values);
    return;
  }
  database
    .prepare(
      `INSERT INTO outbox (email, company_id, body, created_at, status, mention_ids, sent_at)
       VALUES (@email, @companyId, @body, @createdAt, @status, @mentionIds, @sentAt)`,
    )
    .run({ ...values, sentAt: row.sentAt });
}

/**
 * @param {import("better-sqlite3").Database} database Alerts store.
 * @param {string} body Stored body.
 * @param {string} mentionIds Canonical guid set.
 * @param {number} ageMs How long ago `sent_at` and `created_at` are.
 * @returns {void}
 */
export function insertSent(database, body, mentionIds, ageMs) {
  insertOutbox(database, {
    body,
    createdAt: iso(NOW - ageMs),
    mentionIds,
    sentAt: iso(NOW - ageMs),
    status: "sent",
  });
}

/**
 * @param {string} alertsDatabase Alerts file.
 * @param {import("../../src/infra/logger.js").Log} log Logger.
 * @returns {Promise<{ sent: number }>} What the command claimed.
 */
export function deliver(alertsDatabase, log) {
  return runMail({ alertsDatabase }, { clock: givenClock(NOW).clock, log });
}

/**
 * @param {string} alertsDatabase Alerts file.
 * @returns {Record<string, unknown>[]} Outbox rows in id order.
 */
export function outbox(alertsDatabase) {
  const database = openAlertsStore(alertsDatabase);
  try {
    return database
      .prepare(
        "SELECT id, body, status, sent_at, mention_ids FROM outbox ORDER BY id",
      )
      .all()
      .map((row) => {
        if (!isRecord(row)) {
          throw new Error("SQLite row was not an object");
        }
        return row;
      });
  } finally {
    database.close();
  }
}
