import Database from "better-sqlite3";

/**
 * Milliseconds a writer waits for another connection's lock before SQLITE_BUSY.
 */
const BUSY_TIMEOUT_MS = 5000;

/**
 * Opens a SQLite file in WAL mode with foreign keys on, and creates its tables (ADR 0003).
 * The caller owns the connection and closes it.
 * ponytail: CREATE TABLE IF NOT EXISTS, no migrations. Delete the file to pick up a schema change.
 * @param {string} path Database file. Its directory must exist.
 * @param {string} schema DDL run on every open, so it must be idempotent.
 * @returns {import("better-sqlite3").Database} The open connection.
 * @throws {Error} The file cannot be opened or the schema fails.
 */
export function openDatabase(path, schema) {
  const database = new Database(path);
  try {
    database.pragma("journal_mode = WAL");
    database.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
    database.pragma("foreign_keys = ON");
    database.exec(schema);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
