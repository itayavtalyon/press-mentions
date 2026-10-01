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
  email TEXT NOT NULL,
  company_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
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
