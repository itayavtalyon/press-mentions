import { describe, expect, it } from "vitest";

import { lastQuarter } from "../../src/core/collection.js";
import { VISIBLE_VERDICTS } from "../../src/core/filters.js";
import {
  allCompanyCoverage,
  collectionBounds,
  companyCoverage,
  companyMentions,
  flaggedCount,
  flaggedRows,
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
const ZERO = { negative: 0, neutral: 0, positive: 0, unranked: 0 };
const ALL_FOUR = { negative: 2, neutral: 1, positive: 1, unranked: 1 };

/**
 * One company with a mention of every kind, at the window edges and outside it.
 * @returns {import("better-sqlite3").Database} The store.
 */
const givenNorthwind = () => {
  const database = givenCoverageStore();
  addCompany(database, {
    aliases: ["Northwind AI"],
    descriptor: "Warehouse robotics",
    displayName: "Northwind Robotics",
    id: "northwind",
  });
  for (const [guid, publishedAt, verdict] of [
    ["at-start", "2026-07-01T00:00:00.000Z", "positive"],
    ["negative-1", "2026-08-10T10:00:00.000Z", "negative"],
    ["negative-2", "2026-08-11T10:00:00.000Z", "negative"],
    ["neutral", "2026-09-01T10:00:00.000Z", "neutral"],
    ["unranked", "2026-09-02T10:00:00.000Z", "unranked"],
    ["unrelated", "2026-09-03T10:00:00.000Z", "unrelated"],
    ["uncertain", "2026-09-04T10:00:00.000Z", "uncertain"],
    ["unclassified", "2026-09-05T10:00:00.000Z", undefined],
    ["at-end", "2026-10-01T00:00:00.000Z", "positive"],
    ["newer-hidden", "2026-10-03T00:00:00.000Z", "unrelated"],
    ["before", "2026-06-30T23:59:59.999Z", "negative"],
  ]) {
    addMention(database, {
      companyId: "northwind",
      guid: String(guid),
      publishedAt: String(publishedAt),
      verdict,
    });
  }
  return database;
};

describe("allCompanyCoverage", () => {
  it("counts visible mentions in the window and finds the newest visible mention overall", () => {
    expect(allCompanyCoverage(givenNorthwind(), Q3)).toEqual([
      {
        aliases: ["Northwind AI"],
        counts: ALL_FOUR,
        descriptor: "Warehouse robotics",
        displayName: "Northwind Robotics",
        id: "northwind",
        lastMentionedAt: "2026-10-01T00:00:00.000Z",
      },
    ]);
  });

  it("narrows the counts to the chosen verdicts and leaves last mentioned alone", () => {
    expect(
      allCompanyCoverage(givenNorthwind(), { ...Q3, verdicts: ["negative"] }),
    ).toMatchObject([
      {
        counts: { ...ZERO, negative: 2 },
        lastMentionedAt: "2026-10-01T00:00:00.000Z",
      },
    ]);
  });

  it("lists a company with no mentions at zero", () => {
    const database = givenCoverageStore();
    addCompany(database, { id: "quiet" });

    expect(allCompanyCoverage(database, Q3)).toEqual([
      {
        aliases: [],
        counts: ZERO,
        descriptor: undefined,
        displayName: "quiet",
        id: "quiet",
        lastMentionedAt: undefined,
      },
    ]);
  });
});

describe("allCompanyCoverage edge rows", () => {
  it.each(['{"a":"b"}', '["a",1]'])(
    "refuses aliases that are not a list of names: %s",
    (aliases) => {
      const database = givenCoverageStore();
      addCompany(database, { id: "broken" });
      database
        .prepare("UPDATE companies SET aliases = ? WHERE id = 'broken'")
        .run(aliases);

      expect(() => allCompanyCoverage(database, Q3)).toThrow(
        /companies\.aliases is not an array of names/u,
      );
    },
  );

  it("counts an article shared by two companies once for each", () => {
    const database = givenCoverageStore();
    for (const companyId of ["a", "b"]) {
      addCompany(database, { id: companyId });
      addMention(database, {
        companyId,
        guid: "shared",
        publishedAt: "2026-08-01T00:00:00.000Z",
        verdict: "positive",
      });
    }

    expect(
      allCompanyCoverage(database, Q3).map((row) => row.counts.positive),
    ).toEqual([1, 1]);
  });
});

describe("companyCoverage", () => {
  it("returns one company, or undefined for an unknown id", () => {
    const database = givenNorthwind();

    expect(companyCoverage(database, "northwind", Q3)?.counts).toEqual(
      ALL_FOUR,
    );
    expect(companyCoverage(database, "missing", Q3)).toBeUndefined();
  });
});

describe("companyMentions", () => {
  it("lists the visible mentions in the window, newest first", () => {
    expect(
      companyMentions(givenNorthwind(), "northwind", Q3).map(
        (mention) => mention.guid,
      ),
    ).toEqual(["unranked", "neutral", "negative-2", "negative-1", "at-start"]);
  });

  it("keeps only the chosen verdicts", () => {
    expect(
      companyMentions(givenNorthwind(), "northwind", {
        ...Q3,
        verdicts: ["negative"],
      }).map((mention) => mention.verdict),
    ).toEqual(["negative", "negative"]);
  });
});

describe("companyMentions fields", () => {
  it("returns what a mention shows, with at most 600 characters of text and undefined for missing fields", () => {
    const database = givenCoverageStore();
    addCompany(database, { id: "acme" });
    addMention(database, {
      companyId: "acme",
      extractedText: "x".repeat(700),
      guid: "full",
      publishedAt: "2026-08-02T00:00:00.000Z",
      publisherName: "The Ledger",
      publisherUrl: "https://ledger.example/a",
      title: "Acme raises",
      verdict: "positive",
    });
    addMention(database, {
      companyId: "acme",
      guid: "headline",
      publishedAt: "2026-08-01T00:00:00.000Z",
      textSource: "title",
      verdict: "unranked",
    });

    expect(companyMentions(database, "acme", Q3)).toEqual([
      {
        excerpt: "x".repeat(600),
        googleUrl: "https://news.google.com/rss/articles/full",
        guid: "full",
        ownSite: false,
        publishedAt: "2026-08-02T00:00:00.000Z",
        publisherName: "The Ledger",
        publisherUrl: "https://ledger.example/a",
        textSource: "body",
        title: "Acme raises",
        verdict: "positive",
      },
      expect.objectContaining({
        excerpt: undefined,
        publisherName: undefined,
        publisherUrl: undefined,
        textSource: "title",
      }),
    ]);
  });
});

/**
 * @returns {import("better-sqlite3").Database} Three flagged rows and one confident row.
 */
const givenFlagged = () => {
  const database = givenCoverageStore();
  addCompany(database, { displayName: "Parcel Mesh", id: "parcel" });
  addCompany(database, { displayName: "Acme", id: "acme" });
  addMention(database, {
    companyId: "parcel",
    guid: "older",
    publishedAt: "2026-08-01T00:00:00.000Z",
    rawResponse: '{"Parcel Mesh":"maybe"}',
    verdict: "uncertain",
  });
  for (const companyId of ["parcel", "acme"]) {
    addMention(database, {
      companyId,
      guid: "newer",
      publishedAt: "2026-09-01T00:00:00.000Z",
      verdict: "uncertain",
    });
  }
  addMention(database, {
    companyId: "acme",
    guid: "sure",
    publishedAt: "2026-09-02T00:00:00.000Z",
    verdict: "unrelated",
  });
  return database;
};

describe("flaggedRows", () => {
  it("lists and counts every uncertain row, newest first, then by company name", () => {
    expect(flaggedCount(givenFlagged())).toBe(3);
    expect(
      flaggedRows(givenFlagged()).map((row) => [row.companyName, row.guid]),
    ).toEqual([
      ["Acme", "newer"],
      ["Parcel Mesh", "newer"],
      ["Parcel Mesh", "older"],
    ]);
  });

  it("returns the fields a review card shows", () => {
    expect(flaggedRows(givenFlagged()).at(-1)).toEqual({
      companyId: "parcel",
      companyName: "Parcel Mesh",
      googleUrl: "https://news.google.com/rss/articles/older",
      guid: "older",
      publishedAt: "2026-08-01T00:00:00.000Z",
      publisherUrl: undefined,
      rawResponse: '{"Parcel Mesh":"maybe"}',
      textSource: "body",
      title: "Title older",
    });
  });
});

describe("collectionBounds", () => {
  it("is empty for an empty store", () => {
    expect(collectionBounds(givenCoverageStore())).toEqual({
      firstBackfilledAt: undefined,
      firstPublishedAt: undefined,
    });
  });

  it("finds the first backfill and the first stored article", () => {
    const database = givenCoverageStore();
    addCompany(database, { backfilledAt: "2026-10-02T09:00:00.000Z", id: "a" });
    addCompany(database, { backfilledAt: "2026-10-01T09:00:00.000Z", id: "b" });
    addCompany(database, { id: "c" });
    addMention(database, {
      companyId: "a",
      guid: "g",
      publishedAt: "2026-06-12T08:00:00.000Z",
      verdict: undefined,
    });

    expect(collectionBounds(database)).toEqual({
      firstBackfilledAt: "2026-10-01T09:00:00.000Z",
      firstPublishedAt: "2026-06-12T08:00:00.000Z",
    });
  });
});
