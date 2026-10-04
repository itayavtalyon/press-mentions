import { describe, expect, it } from "vitest";

import { recordBackfill, recordDaily } from "../../src/infra/coverage-store.js";
import { addCompany, givenCoverageStore } from "../helpers/coverage.js";
import { givenItem } from "../helpers/fakes.js";

const AT = "2026-10-05T00:00:00.000Z";
const ITEM = givenItem("g1", "2026-10-04T00:00:00.000Z");

/**
 * @param {import("better-sqlite3").Database} database Store.
 * @param {string} sql Query returning one row.
 * @returns {unknown} That row.
 */
const row = (database, sql) => database.prepare(sql).get();

describe("recordDaily", () => {
  it("stores a new article at unwrap as a daily link that is not yet eligible", () => {
    const database = givenCoverageStore();
    addCompany(database, { id: "harvey" });

    const inserted = recordDaily(database, {
      companyId: "harvey",
      items: [ITEM],
    });

    expect(inserted).toBe(1);
    expect(row(database, "SELECT stage FROM articles")).toEqual({
      stage: "unwrap",
    });
    expect(
      row(database, "SELECT origin, alert_eligible FROM company_articles"),
    ).toEqual({ origin: "daily", alert_eligible: 0 });
    expect(
      row(database, "SELECT COUNT(backfilled_at) AS marked FROM companies"),
    ).toEqual({ marked: 0 });
  });
});

describe("recordDaily when the guid is already stored", () => {
  it("leaves a backfill link for that company unchanged", () => {
    const database = givenCoverageStore();
    addCompany(database, { id: "harvey" });
    recordBackfill(database, { companyId: "harvey", items: [ITEM], at: AT });

    const inserted = recordDaily(database, {
      companyId: "harvey",
      items: [ITEM],
    });

    expect(inserted).toBe(0);
    expect(
      row(database, "SELECT origin, alert_eligible FROM company_articles"),
    ).toEqual({ origin: "backfill", alert_eligible: 0 });
  });

  it("links an article another company already stored, and leaves that article's stage", () => {
    const database = givenCoverageStore();
    addCompany(database, { id: "harvey" });
    addCompany(database, { id: "wave", displayName: "Wave" });
    recordBackfill(database, { companyId: "harvey", items: [ITEM], at: AT });
    database
      .prepare("UPDATE articles SET stage = 'fetch' WHERE guid = 'g1'")
      .run();

    recordDaily(database, { companyId: "wave", items: [ITEM] });

    expect(row(database, "SELECT stage FROM articles")).toEqual({
      stage: "fetch",
    });
    expect(
      database
        .prepare(
          "SELECT company_id, origin FROM company_articles ORDER BY company_id",
        )
        .all(),
    ).toEqual([
      { company_id: "harvey", origin: "backfill" },
      { company_id: "wave", origin: "daily" },
    ]);
  });

  it("writes nothing for a company that is not in the store", () => {
    const database = givenCoverageStore();

    expect(() =>
      recordDaily(database, { companyId: "nobody", items: [ITEM] }),
    ).toThrow("Company nobody is not in the coverage store");
    expect(row(database, "SELECT COUNT(*) AS articles FROM articles")).toEqual({
      articles: 0,
    });
  });
});
