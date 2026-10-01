import { openDatabase } from "./database.js";

/**
 * Alerts store (ADR 0005, ADR 0007). Company ids are copied from coverage by value, with no foreign key.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS subscriptions (
  company_id TEXT NOT NULL,
  email TEXT NOT NULL,
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
