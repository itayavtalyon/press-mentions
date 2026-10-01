import { openDatabase } from "./sqlite.js";

/**
 * Evaluation store (ADR 0004, ADR 0005).
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS scores (
  model_id TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0),
  scored_at TEXT NOT NULL
) STRICT;
`;

/**
 * Opens the evaluation store. The caller closes it.
 * @param {string} path Database file.
 * @returns {import("better-sqlite3").Database} The open connection.
 */
export function openEvaluationStore(path) {
  return openDatabase(path, SCHEMA);
}
