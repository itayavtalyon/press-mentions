import { isRecord, ownValue } from "../../core/common.js";

import { caseFromRow, validateCase } from "./rows.js";

/**
 * @typedef {import("./rows.js").EvalCase} EvalCase
 * @typedef {import("../../infra/database.js").SqliteDatabase} SqliteDatabase
 */

/**
 * @typedef {object} ScoreRow
 * @property {string} modelId Installed model name.
 * @property {string} promptId Prompt version id.
 * @property {number} promptVersion Numeric prompt version.
 * @property {number} score Points earned.
 * @property {number} relatedness Correct relevance decisions.
 * @property {number} secondsPerCase Mean seconds for one case.
 */

/**
 * Evaluation tables. This model owns the queries and writes. The connection comes from infra.
 */
export class EvaluationStore {
  /**
   * @type {SqliteDatabase}
   */
  #database;

  /**
   * @param {SqliteDatabase} database Open SQLite connection.
   */
  constructor(database) {
    this.#database = database;
    createTables(database);
  }

  /**
   * @returns {number} Stored cases.
   */
  caseCount() {
    return countCases(this.#database);
  }

  /**
   * Close the connection.
   */
  close() {
    this.#database.close();
  }

  /**
   * @param {EvalCase[]} cases Cases to append, in the order given.
   */
  insertCases(cases) {
    insertCases(this.#database, cases);
  }

  /**
   * @param {ScoreRow[]} rows Score rows from one run.
   * @param {string} scoredAt ISO timestamp shared by the run.
   */
  insertScores(rows, scoredAt) {
    insertScores(this.#database, rows, scoredAt);
  }

  /**
   * @returns {EvalCase[]} Cases in stored order.
   */
  listCases() {
    return listCases(this.#database);
  }
}

/**
 * @param {SqliteDatabase} database Open database.
 */
function createTables(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      position INTEGER NOT NULL UNIQUE,
      parameters_json TEXT NOT NULL,
      expected_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scores (
      model_id TEXT NOT NULL,
      prompt_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      relatedness_correct INTEGER NOT NULL,
      seconds_per_case REAL NOT NULL,
      scored_at TEXT NOT NULL,
      PRIMARY KEY (model_id, prompt_id, scored_at)
    );
  `);
}

/**
 * @param {SqliteDatabase} database Open database.
 * @returns {number} Stored cases.
 */
function countCases(database) {
  const row = database.prepare("SELECT COUNT(*) AS count FROM cases").get();
  const count = isRecord(row) ? ownValue(row, "count") : undefined;

  if (typeof count !== "number") {
    throw new TypeError("case count is missing");
  }

  return count;
}

/**
 * @param {SqliteDatabase} database Open database.
 * @returns {number} Next position, starting at 0.
 */
function nextPosition(database) {
  const row = database
    .prepare("SELECT COALESCE(MAX(position), -1) AS position FROM cases")
    .get();
  const position = isRecord(row) ? ownValue(row, "position") : undefined;

  if (typeof position !== "number") {
    throw new TypeError("case position is missing");
  }

  return position + 1;
}

/**
 * @param {SqliteDatabase} database Open database.
 * @param {EvalCase[]} cases Cases to append.
 */
function insertCases(database, cases) {
  const start = nextPosition(database);
  const statement = database.prepare(`
    INSERT INTO cases (id, position, parameters_json, expected_json)
    VALUES (@id, @position, @parametersJson, @expectedJson)
  `);

  database.transaction(() => {
    for (const [offset, evalCase] of cases.entries()) {
      validateCase(evalCase);
      statement.run({
        expectedJson: JSON.stringify(evalCase.expected),
        id: evalCase.id,
        parametersJson: JSON.stringify(evalCase.parameters),
        position: start + offset,
      });
    }
  });
}

/**
 * @param {SqliteDatabase} database Open database.
 * @returns {EvalCase[]} Cases in stored order.
 */
function listCases(database) {
  return database
    .prepare(
      "SELECT id, parameters_json, expected_json FROM cases ORDER BY position",
    )
    .all()
    .map((row) => caseFromRow(row));
}

/**
 * @param {ScoreRow} row Score row.
 * @throws {Error} The row cannot be stored.
 */
function validateScore(row) {
  if (!Number.isSafeInteger(row.score) || row.score < 0) {
    throw new Error("score is not a whole number");
  }

  if (!Number.isSafeInteger(row.relatedness) || row.relatedness < 0) {
    throw new Error("relatedness is not a whole number");
  }

  if (!Number.isFinite(row.secondsPerCase) || row.secondsPerCase < 0) {
    throw new Error("seconds per case is not a duration");
  }
}

/**
 * @param {SqliteDatabase} database Open database.
 * @param {ScoreRow[]} rows Score rows from one run.
 * @param {string} scoredAt ISO timestamp shared by the run.
 */
function insertScores(database, rows, scoredAt) {
  const statement = database.prepare(`
    INSERT INTO scores (
      model_id, prompt_id, score, relatedness_correct, seconds_per_case, scored_at
    ) VALUES (
      @modelId, @promptId, @score, @relatedness, @secondsPerCase, @scoredAt
    )
  `);

  database.transaction(() => {
    for (const row of rows) {
      validateScore(row);
      statement.run({ ...row, scoredAt });
    }
  });
}
