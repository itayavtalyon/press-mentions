import { describe, expect, it } from "vitest";

import { lastQuarter } from "../../src/core/collection.js";
import { VISIBLE_VERDICTS } from "../../src/core/filters.js";
import {
  companyCoverage,
  companyMentions,
} from "../../src/infra/coverage-read.js";
import {
  addCompany,
  addMention,
  givenCoverageStore,
} from "../helpers/coverage.js";

/**
 * @type {import("../../src/core/filters.js").CoverageQuery}
 */
const Q3 = {
  range: lastQuarter(new Date("2026-10-05T00:00:00.000Z")),
  verdicts: VISIBLE_VERDICTS,
};

/**
 * Harvey with one press mention and a newer post on its own site.
 * @param {string} [website] Overlay host.
 * @returns {import("better-sqlite3").Database} The store.
 */
const givenHarvey = (website) => {
  const database = givenCoverageStore();
  addCompany(database, { id: "harvey", ...(website && { website }) });
  addMention(database, {
    companyId: "harvey",
    guid: "press",
    publishedAt: "2026-08-01T00:00:00.000Z",
    publisherHomepage: "https://www.reuters.com",
    verdict: "positive",
  });
  addMention(database, {
    companyId: "harvey",
    guid: "own",
    publishedAt: "2026-09-01T00:00:00.000Z",
    publisherHomepage: "https://www.harvey.ai",
    verdict: "positive",
  });
  return database;
};

describe("own-site mentions", () => {
  it("are listed and flagged, but not counted or last mentioned", () => {
    const database = givenHarvey();

    expect(companyCoverage(database, "harvey", Q3)).toMatchObject({
      counts: { negative: 0, neutral: 0, positive: 1, unranked: 0 },
      lastMentionedAt: "2026-08-01T00:00:00.000Z",
    });
    expect(
      companyMentions(database, "harvey", Q3).map(({ guid, ownSite }) => [
        guid,
        ownSite,
      ]),
    ).toEqual([
      ["own", true],
      ["press", false],
    ]);
  });

  it("follow the overlay website instead of the slug rule", () => {
    const database = givenHarvey("reuters.com");

    expect(
      companyMentions(database, "harvey", Q3).map(({ guid, ownSite }) => [
        guid,
        ownSite,
      ]),
    ).toEqual([
      ["own", false],
      ["press", true],
    ]);
  });
});
