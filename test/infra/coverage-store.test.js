import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import {
  backfilledCompanyIds,
  openCoverageStore,
  recordBackfill,
  syncCompanies,
} from "../../src/infra/coverage-store.js";
import { givenItem } from "../helpers/fakes.js";
import { givenTemporaryDirectory } from "../helpers/files.js";

/**
 * @type {import("../../src/core/overlay.js").Company}
 */
const HARVEY = {
  id: "harvey",
  displayName: "Harvey",
  queryName: "Harvey",
  aliases: [],
  descriptor: undefined,
  queryTerms: [],
};

const givenStore = () => {
  const database = openCoverageStore(
    path.join(givenTemporaryDirectory(), "coverage.sqlite"),
  );
  onTestFinished(() => {
    database.close();
  });
  return database;
};

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @returns {unknown[]} Every company row.
 */
const companyRows = (database) =>
  database.prepare("SELECT * FROM companies ORDER BY id").all();

describe("syncCompanies", () => {
  it("stores each company with aliases and query terms as JSON", () => {
    const database = givenStore();

    syncCompanies(database, [
      {
        ...HARVEY,
        aliases: ["Harvey AI"],
        descriptor: "Legal AI startup",
        queryTerms: ["legal"],
      },
    ]);

    expect(companyRows(database)).toEqual([
      {
        id: "harvey",
        display_name: "Harvey",
        query_name: "Harvey",
        aliases: '["Harvey AI"]',
        descriptor: "Legal AI startup",
        query_terms: '["legal"]',
        // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
        backfilled_at: null,
      },
    ]);
  });

  it("updates an existing company in place on a second sync", () => {
    const database = givenStore();
    syncCompanies(database, [HARVEY]);

    syncCompanies(database, [{ ...HARVEY, descriptor: "Legal AI startup" }]);

    expect(companyRows(database)).toEqual([
      {
        id: "harvey",
        display_name: "Harvey",
        query_name: "Harvey",
        aliases: "[]",
        descriptor: "Legal AI startup",
        query_terms: "[]",
        // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
        backfilled_at: null,
      },
    ]);
  });

  it("writes nothing when one company in the batch is invalid", () => {
    const database = givenStore();
    const clash = { ...HARVEY, id: "harvey-2" };

    expect(() => syncCompanies(database, [HARVEY, clash])).toThrow(
      "UNIQUE constraint failed: companies.display_name",
    );
    expect(companyRows(database)).toEqual([]);
  });
});

const AT = "2026-10-05T00:00:00.000Z";
const ITEM = givenItem("g1", "2026-08-01T00:00:00.000Z");

/**
 * @param {import("better-sqlite3").Database} database Store.
 * @param {string} sql Query returning one row.
 * @returns {unknown} That row.
 */
const row = (database, sql) => database.prepare(sql).get();

describe("recordBackfill storage", () => {
  it("stores the article waiting for the unwrap stage", () => {
    const database = givenStore();
    syncCompanies(database, [HARVEY]);

    recordBackfill(database, { companyId: "harvey", items: [ITEM], at: AT });

    expect(row(database, "SELECT * FROM articles")).toEqual({
      guid: "g1",
      title: "Title g1",
      published_at: "2026-08-01T00:00:00.000Z",
      publisher_name: "Example News",
      publisher_homepage: "https://news.example.com",
      // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
      publisher_url: null,
      google_url: "https://news.google.com/rss/articles/g1",
      // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
      extracted_text: null,
      // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
      text_source: null,
      stage: "unwrap",
      attempt_count: 0,
      // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
      last_error: null,
      retryable: 1,
    });
  });
});

describe("recordBackfill links", () => {
  it("links the article to the company as a backfill row that never alerts", () => {
    const database = givenStore();
    syncCompanies(database, [HARVEY]);

    recordBackfill(database, { companyId: "harvey", items: [ITEM], at: AT });

    expect(
      row(
        database,
        "SELECT company_id, guid, origin, alert_eligible FROM company_articles",
      ),
    ).toEqual({
      company_id: "harvey",
      guid: "g1",
      origin: "backfill",
      alert_eligible: 0,
    });
  });

  it("returns how many links were new", () => {
    const database = givenStore();
    syncCompanies(database, [HARVEY]);
    recordBackfill(database, { companyId: "harvey", items: [ITEM], at: AT });

    const inserted = recordBackfill(database, {
      companyId: "harvey",
      items: [ITEM, givenItem("g2", "2026-08-02T00:00:00.000Z")],
      at: AT,
    });

    expect(inserted).toBe(1);
  });

  it("stores a shared article once and links it to both companies", () => {
    const database = givenStore();
    syncCompanies(database, [
      HARVEY,
      { ...HARVEY, id: "wave", displayName: "Wave", queryName: "Wave" },
    ]);

    recordBackfill(database, { companyId: "harvey", items: [ITEM], at: AT });
    recordBackfill(database, { companyId: "wave", items: [ITEM], at: AT });

    expect(
      row(
        database,
        "SELECT COUNT(*) AS articles, (SELECT COUNT(*) FROM company_articles) AS links FROM articles",
      ),
    ).toEqual({
      articles: 1,
      links: 2,
    });
  });
});

describe("recordBackfill progress", () => {
  it("marks the company's feed stage done", () => {
    const database = givenStore();
    syncCompanies(database, [HARVEY]);

    recordBackfill(database, { companyId: "harvey", items: [], at: AT });

    expect(backfilledCompanyIds(database)).toEqual(new Set(["harvey"]));
  });

  it("reports no company done before its backfill commits", () => {
    const database = givenStore();
    syncCompanies(database, [HARVEY]);

    expect(backfilledCompanyIds(database)).toEqual(new Set());
  });

  it("writes nothing for a company that is not in the store", () => {
    const database = givenStore();

    expect(() =>
      recordBackfill(database, { companyId: "nobody", items: [ITEM], at: AT }),
    ).toThrow("Company nobody is not in the coverage store");
    expect(row(database, "SELECT COUNT(*) AS articles FROM articles")).toEqual({
      articles: 0,
    });
  });
});
