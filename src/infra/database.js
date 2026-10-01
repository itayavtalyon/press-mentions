import Database from "better-sqlite3";

/**
 * @typedef {object} SqlStatement
 * @property {(parameters?: object) => unknown[]} all Reads every row.
 * @property {(parameters?: object) => unknown} get Reads one row.
 * @property {(parameters?: object) => void} run Writes one statement.
 */

/**
 * One SQLite file. Opens the connection and runs SQL. It does not know table names.
 */
export class SqliteDatabase {
  /**
   * @type {import("better-sqlite3").Database}
   */
  #database;

  /**
   * @param {string} databasePath SQLite file path, or `:memory:`.
   */
  constructor(databasePath) {
    this.#database = new Database(databasePath);
    this.#database.pragma("journal_mode = WAL");
    this.#database.pragma("busy_timeout = 5000");
    this.#database.pragma("foreign_keys = ON");
  }

  /**
   * @returns {import("better-sqlite3").Database} Driver connection for a store that runs its own SQL.
   */
  connection() {
    return this.#database;
  }

  /**
   * Close the file.
   */
  close() {
    this.#database.close();
  }

  /**
   * @param {string} sql Statements with no bound parameters.
   */
  exec(sql) {
    this.#database.exec(sql);
  }

  /**
   * @param {string} sql One statement.
   * @returns {SqlStatement} Bound statement.
   */
  prepare(sql) {
    const statement = this.#database.prepare(sql);

    return {
      all: (parameters) =>
        parameters === undefined ? statement.all() : statement.all(parameters),
      get: (parameters) =>
        parameters === undefined ? statement.get() : statement.get(parameters),
      run: (parameters) => {
        if (parameters === undefined) {
          statement.run();
          return;
        }

        statement.run(parameters);
      },
    };
  }

  /**
   * @param {() => void} work Statements that commit together, or roll back together.
   */
  transaction(work) {
    this.#database.transaction(work)();
  }
}

/**
 * Open a SQLite file and create its tables. The caller closes the connection.
 * @param {string} databasePath SQLite file. Its directory must exist.
 * @param {string} schema DDL run on every open, so it must be idempotent.
 * @returns {import("better-sqlite3").Database} The open connection.
 * @throws {Error} The file cannot be opened or the schema fails.
 */
export function openDatabase(databasePath, schema) {
  const database = new SqliteDatabase(databasePath);

  try {
    database.exec(schema);
    return database.connection();
  } catch (error) {
    database.close();
    throw error;
  }
}
