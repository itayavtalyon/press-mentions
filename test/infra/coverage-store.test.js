import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import {
  openCoverageStore,
  syncCompanies,
} from "../../src/infra/coverage-store.js";
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
