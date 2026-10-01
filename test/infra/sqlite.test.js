import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import { openAlertsStore } from "../../src/infra/alerts-store.js";
import { openCoverageStore } from "../../src/infra/coverage-store.js";
import { openDatabase } from "../../src/infra/database.js";
import { openEvaluationStore } from "../../src/infra/evaluation-store.js";
import { givenTemporaryDirectory } from "../helpers/files.js";

/**
 * @param {string} name File name.
 * @returns {string} A path inside a fresh temporary directory.
 */
const givenPath = (name) => path.join(givenTemporaryDirectory(), name);

/**
 * @param {import("better-sqlite3").Database} database Connection the test owns.
 * @returns {import("better-sqlite3").Database} The same connection, closed after the test.
 */
const closedAfterTest = (database) => {
  onTestFinished(() => {
    database.close();
  });
  return database;
};

/**
 * @param {import("better-sqlite3").Database} database Open connection.
 * @returns {string[]} Table names, sorted.
 */
const tableNames = (database) =>
  database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    )
    .pluck()
    .all()
    .map(String);

describe("openDatabase", () => {
  it("opens the file in WAL mode", () => {
    const database = closedAfterTest(openDatabase(givenPath("a.sqlite"), ""));

    expect(database.pragma("journal_mode", { simple: true })).toBe("wal");
  });

  it("sets a busy timeout so a second writer waits instead of failing", () => {
    const database = closedAfterTest(openDatabase(givenPath("a.sqlite"), ""));

    expect(database.pragma("busy_timeout", { simple: true })).toBe(5000);
  });

  it("turns foreign keys on", () => {
    const database = closedAfterTest(openDatabase(givenPath("a.sqlite"), ""));

    expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("can open the same file twice because the schema is idempotent", () => {
    const file = givenPath("a.sqlite");
    openDatabase(file, "CREATE TABLE IF NOT EXISTS t (x TEXT) STRICT;").close();

    const database = closedAfterTest(
      openDatabase(file, "CREATE TABLE IF NOT EXISTS t (x TEXT) STRICT;"),
    );

    expect(tableNames(database)).toEqual(["t"]);
  });

  it("throws the schema error", () => {
    const file = givenPath("a.sqlite");

    expect(() => openDatabase(file, "CREATE TABLE broken (")).toThrow(
      "incomplete input",
    );
  });

  it("throws when the directory does not exist", () => {
    const file = path.join(givenTemporaryDirectory(), "missing", "a.sqlite");

    expect(() => openDatabase(file, "")).toThrow("directory does not exist");
  });
});

describe("store schemas", () => {
  it("coverage has companies, articles, and company links", () => {
    const database = closedAfterTest(
      openCoverageStore(givenPath("coverage.sqlite")),
    );

    expect(tableNames(database)).toEqual([
      "articles",
      "companies",
      "company_articles",
    ]);
  });

  it("alerts has subscriptions, notified, and the outbox", () => {
    const database = closedAfterTest(
      openAlertsStore(givenPath("alerts.sqlite")),
    );

    expect(tableNames(database)).toEqual([
      "notified",
      "outbox",
      "subscriptions",
    ]);
  });

  it("evaluation has scores", () => {
    const database = closedAfterTest(
      openEvaluationStore(givenPath("evaluation.sqlite")),
    );

    expect(tableNames(database)).toEqual(["scores"]);
  });
});

describe("coverage constraints", () => {
  it("coverage rejects a verdict outside the six known values", () => {
    const database = closedAfterTest(
      openCoverageStore(givenPath("coverage.sqlite")),
    );
    database.exec(`
      INSERT INTO companies (id, display_name, query_name, aliases, query_terms) VALUES ('wave', 'Wave', 'Wave', '[]', '[]');
      INSERT INTO articles (guid, title, published_at, google_url, stage) VALUES ('g1', 'T', '2026-09-01T00:00:00Z', 'https://g/1', 'unwrap');
    `);

    expect(() =>
      database.exec(
        "INSERT INTO company_articles (company_id, guid, origin, verdict) VALUES ('wave', 'g1', 'daily', 'mixed')",
      ),
    ).toThrow("CHECK constraint failed");
  });

  it("coverage rejects a company link to an unknown company", () => {
    const database = closedAfterTest(
      openCoverageStore(givenPath("coverage.sqlite")),
    );
    database.exec(
      "INSERT INTO articles (guid, title, published_at, google_url, stage) VALUES ('g1', 'T', '2026-09-01T00:00:00Z', 'https://g/1', 'unwrap')",
    );

    expect(() =>
      database.exec(
        "INSERT INTO company_articles (company_id, guid, origin) VALUES ('nobody', 'g1', 'daily')",
      ),
    ).toThrow("FOREIGN KEY constraint failed");
  });
});
