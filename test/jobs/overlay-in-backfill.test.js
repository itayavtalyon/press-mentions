import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config.js";
import { buildQuery } from "../../src/core/query.js";
import { runBackfill } from "../../src/jobs/run-backfill.js";
import { NOW, column, givenConfig } from "../helpers/backfill.js";
import { givenLog } from "../helpers/fakes.js";

/**
 * Runs the backfill over the committed seed and overlay, as configured for the app, with a feed that records the
 * Google query it would send for each company.
 * @returns {Promise<{ queries: Map<string, string>, coverageDatabase: string }>} Query by company id, and the store.
 */
const givenCommittedBackfill = async () => {
  const app = loadConfig({ COVERAGE_DB: "unused.sqlite" }, process.cwd());
  const config = {
    ...givenConfig(),
    seedPath: app.seedPath,
    overlayPath: app.overlayPath,
  };
  /**
   * @type {Map<string, string>}
   */
  const queries = new Map();
  const feed = {
    /**
     * @param {import("../../src/core/overlay.js").Company} company Company searched.
     * @param {import("../../src/core/windows.js").Window} window Search window.
     * @returns {Promise<import("../../src/core/collect.js").FeedItem[]>} No items.
     */
    search: async (company, window) => {
      queries.set(company.id, buildQuery(company, window));
      return [];
    },
  };
  await runBackfill(config, { feed, log: givenLog().log, now: NOW });
  return { queries, coverageDatabase: config.coverageDatabase };
};

describe("the committed overlay in the backfill", () => {
  it("narrows an ordinary-word name with its query terms", async () => {
    const { queries } = await givenCommittedBackfill();

    expect(queries.get("harvey")).toBe(
      '"Harvey" ("legal AI" OR "lawyers" OR "law firms") after:2026-06-30 before:2026-10-06',
    );
  });

  it("drops a seed alias the overlay replaced", async () => {
    const { queries } = await givenCommittedBackfill();

    expect(queries.get("ludeo")).toBe(
      '"Ludeo" after:2026-06-30 before:2026-10-06',
    );
  });

  it("keeps a seed alias the overlay does not touch", async () => {
    const { queries } = await givenCommittedBackfill();

    expect(queries.get("cycuity")).toBe(
      '("Cycuity" OR "Tortuga Logic") after:2026-06-30 before:2026-10-06',
    );
  });

  it("leaves a company without query terms on its name alone", async () => {
    const { queries } = await givenCommittedBackfill();

    expect(queries.get("stripe")).toBe(
      '"Stripe" after:2026-06-30 before:2026-10-06',
    );
  });

  it("stores the descriptor for the classifier", async () => {
    const { coverageDatabase } = await givenCommittedBackfill();

    expect(
      column(
        coverageDatabase,
        "SELECT descriptor FROM companies WHERE id = 'wave'",
      ),
    ).toEqual([
      "Wave Financial (waveapps.com): apps for small-business accounting, payments, and payroll",
    ]);
  });
});
