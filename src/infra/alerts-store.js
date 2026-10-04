import { ownValue } from "../core/common.js";

import { openDatabase } from "./database.js";

/**
 * Alerts store (ADR 0005, ADR 0007). Company ids are copied from coverage by value, with no foreign key.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS subscriptions (
  company_id TEXT NOT NULL,
  -- Stored as typed. NOCASE makes the pair unique ignoring ASCII case.
  email TEXT NOT NULL COLLATE NOCASE,
  PRIMARY KEY (company_id, email)
) STRICT;

CREATE TABLE IF NOT EXISTS notified (
  email TEXT NOT NULL,
  company_id TEXT NOT NULL,
  guid TEXT NOT NULL,
  PRIMARY KEY (email, company_id, guid)
) STRICT;

CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  company_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL CHECK (
    created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
  ),
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent')),
  mention_ids TEXT NOT NULL,
  sent_at TEXT CHECK (
    sent_at IS NULL OR
    sent_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
  ),
  UNIQUE (email, company_id, mention_ids),
  CHECK (
    (status = 'pending' AND sent_at IS NULL) OR
    (status = 'sent' AND sent_at IS NOT NULL)
  )
) STRICT;
`;

/**
 * Opens the alerts store. The caller closes it.
 * @param {string} path Database file.
 * @returns {import("better-sqlite3").Database} The open connection.
 */
export function openAlertsStore(path) {
  return openDatabase(path, SCHEMA);
}

/**
 * Subscribes one address to one company (ADR 0008). The address is already trimmed and checked.
 * @param {import("better-sqlite3").Database} database Alerts store.
 * @param {string} companyId Company slug.
 * @param {string} email Address as typed.
 * @returns {"created" | "exists"} Whether the pair was new, ignoring case.
 */
export function subscribe(database, companyId, email) {
  const { changes } = database
    .prepare(
      "INSERT INTO subscriptions (company_id, email) VALUES (?, ?) ON CONFLICT DO NOTHING",
    )
    .run(companyId, email);
  return changes === 1 ? "created" : "exists";
}

/**
 * @typedef {object} SubscriptionRow
 * @property {string} companyId Company slug.
 * @property {string} email Address as stored.
 * @typedef {object} NotifiedRow
 * @property {string} email Address as stored.
 * @property {string} companyId Company slug.
 * @property {string} guid Article id.
 * @typedef {object} StoredDigest One digest to enqueue. `mentionIds` is the canonical guid set.
 * @property {string} email Address as stored on the subscription.
 * @property {string} companyId Company slug.
 * @property {string} body Rendered message.
 * @property {string} createdAt `toISOString` text.
 * @property {string} mentionIds Canonical `JSON.stringify` of the guids.
 * @property {readonly string[]} guids Mention ids in that digest.
 * @typedef {object} PendingOutbox
 * @property {number} id Outbox id.
 * @property {string} body Stored message.
 */

/**
 * @param {import("better-sqlite3").Database} database Alerts store.
 * @returns {SubscriptionRow[]} Every subscription. The digest reads the stored email.
 */
export function listSubscriptions(database) {
  return database
    .prepare("SELECT company_id AS companyId, email FROM subscriptions")
    .all()
    .map((row) => subscriptionFromRow(new Object(row)));
}

/**
 * @param {import("better-sqlite3").Database} database Alerts store.
 * @returns {NotifiedRow[]} Every notified mention.
 */
export function notifiedRows(database) {
  return database
    .prepare("SELECT email, company_id AS companyId, guid FROM notified")
    .all()
    .map((row) => notifiedFromRow(new Object(row)));
}

/**
 * Stores each digest in its own transaction: the pending outbox row, then its notified rows.
 * A conflicting mention set keeps the stored body. Missing notified rows are still written.
 * A throw rolls back that digest only. Digests already stored stay. The error names the last failure.
 * @param {import("better-sqlite3").Database} database Alerts store.
 * @param {readonly StoredDigest[]} digests Digests in email, then company id, order.
 * @returns {void}
 * @throws {Error} One or more digests failed. Their rows are absent. The others are committed.
 */
export function storeDigests(database, digests) {
  const insertOutbox = database.prepare(`
    INSERT INTO outbox (email, company_id, body, created_at, status, mention_ids)
    VALUES (@email, @companyId, @body, @createdAt, 'pending', @mentionIds)
    ON CONFLICT (email, company_id, mention_ids) DO NOTHING
  `);
  const insertNotified = database.prepare(`
    INSERT INTO notified (email, company_id, guid) VALUES (?, ?, ?)
    ON CONFLICT DO NOTHING
  `);
  let failed = 0;
  let failure = "";
  for (const digest of digests) {
    try {
      database.transaction(() => {
        insertOutbox.run(digest);
        writeNotified(insertNotified, digest);
      })();
    } catch (error) {
      failed += 1;
      failure = String(error);
    }
  }
  if (failed > 0) {
    throw new Error(
      `${digests.length - failed} stored, ${failed} failed. ${failure}`,
    );
  }
}

/**
 * @param {import("better-sqlite3").Database} database Alerts store.
 * @param {string} cutoff `toISOString` text. Sent rows at or before this instant are removed.
 * @returns {void}
 */
export function deleteSentBefore(database, cutoff) {
  database
    .prepare("DELETE FROM outbox WHERE status = 'sent' AND sent_at <= ?")
    .run(cutoff);
}

/**
 * Pending rows, oldest `created_at` first, then id.
 * @param {import("better-sqlite3").Database} database Alerts store.
 * @returns {PendingOutbox[]} Rows still waiting to be claimed.
 */
export function pendingOutbox(database) {
  return database
    .prepare(
      "SELECT id, body FROM outbox WHERE status = 'pending' ORDER BY created_at, id",
    )
    .all()
    .map((row) => pendingFromRow(new Object(row)));
}

/**
 * Marks one pending row sent. Zero changes means it was no longer pending.
 * @param {import("better-sqlite3").Database} database Alerts store.
 * @param {number} id Outbox id.
 * @param {string} sentAt `toISOString` text from the injected clock.
 * @returns {number} Rows changed.
 */
export function claimOutbox(database, id, sentAt) {
  return database
    .prepare(
      "UPDATE outbox SET status = 'sent', sent_at = ? WHERE id = ? AND status = 'pending'",
    )
    .run(sentAt, id).changes;
}

/**
 * @param {import("better-sqlite3").Statement} insertNotified Notified insert.
 * @param {StoredDigest} digest One digest whose outbox row was already attempted.
 * @returns {void}
 */
function writeNotified(insertNotified, digest) {
  for (const guid of digest.guids) {
    insertNotified.run(digest.email, digest.companyId, guid);
  }
}

/**
 * @param {object} row Subscription query row.
 * @returns {SubscriptionRow} The narrowed row.
 */
function subscriptionFromRow(row) {
  return {
    companyId: String(ownValue(row, "companyId")),
    email: String(ownValue(row, "email")),
  };
}

/**
 * @param {object} row Notified query row.
 * @returns {NotifiedRow} The narrowed row.
 */
function notifiedFromRow(row) {
  return {
    companyId: String(ownValue(row, "companyId")),
    email: String(ownValue(row, "email")),
    guid: String(ownValue(row, "guid")),
  };
}

/**
 * @param {object} row Pending query row.
 * @returns {PendingOutbox} The narrowed row.
 */
function pendingFromRow(row) {
  return {
    body: String(ownValue(row, "body")),
    id: Number(ownValue(row, "id")),
  };
}
