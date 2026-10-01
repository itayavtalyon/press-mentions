import { describe, expect, it } from "vitest";

import {
  collectionStart,
  companyList,
  lastMentionedDays,
  parseAddress,
  tally,
} from "../../src/core/dashboard.js";
import { parseFilters } from "../../src/core/filters.js";

const NOW = new Date("2026-10-05T12:00:00.000Z");
const ALL = parseFilters(new URLSearchParams(""), NOW);
const NEGATIVE = parseFilters(new URLSearchParams("verdict=negative"), NOW);

/**
 * @param {ReturnType<typeof parseFilters>} result A query that parsed.
 * @returns {import("../../src/core/filters.js").Filters} Its filters.
 */
const filtersOf = (result) => {
  if (!("filters" in result)) {
    throw new Error("expected filters");
  }
  return result.filters;
};

/**
 * @param {string} day `YYYY-MM-DD`.
 * @returns {Date} Midnight UTC that day.
 */
const utc = (day) => new Date(`${day}T00:00:00.000Z`);

/**
 * @param {string} id Slug.
 * @param {string} [lastMentionedAt] Global last mention.
 * @param {Partial<import("../../src/core/dashboard.js").VerdictCounts>} [counts] Window counts.
 * @returns {import("../../src/core/dashboard.js").CompanyCoverage} One row.
 */
const coverage = (id, lastMentionedAt, counts = {}) => ({
  aliases: [],
  counts: { negative: 0, neutral: 0, positive: 0, unranked: 0, ...counts },
  descriptor: undefined,
  displayName: id,
  id,
  lastMentionedAt,
});

describe("companyList", () => {
  it("sorts by newest last mention, then none, then name ignoring case", () => {
    const rows = [
      coverage("zephyr"),
      coverage("banana", "2026-09-01T00:00:00.000Z"),
      coverage("Apple", "2026-09-01T00:00:00.000Z"),
      coverage("aster"),
      coverage("kestrel", "2026-10-04T00:00:00.000Z"),
    ];

    expect(companyList(rows, filtersOf(ALL)).map((row) => row.id)).toEqual([
      "kestrel",
      "Apple",
      "banana",
      "aster",
      "zephyr",
    ]);
  });

  it("puts the newer mention first whichever order the rows arrive in", () => {
    const older = coverage("older", "2026-09-01T00:00:00.000Z");
    const newer = coverage("newer", "2026-09-02T00:00:00.000Z");

    for (const rows of [
      [older, newer],
      [newer, older],
    ]) {
      expect(companyList(rows, filtersOf(ALL)).map((row) => row.id)).toEqual([
        "newer",
        "older",
      ]);
    }
  });

  it("keeps companies with no mentions in the window when every verdict is shown", () => {
    expect(companyList([coverage("quiet")], filtersOf(ALL))).toHaveLength(1);
  });

  it("drops companies with no mentions of the chosen verdict", () => {
    const rows = [
      coverage("hit", "2026-09-01T00:00:00.000Z", { negative: 2 }),
      coverage("miss", "2026-09-02T00:00:00.000Z"),
    ];

    expect(companyList(rows, filtersOf(NEGATIVE)).map((row) => row.id)).toEqual(
      ["hit"],
    );
  });
});

describe("tally", () => {
  it("counts unranked as a mention that is not rated", () => {
    expect(
      tally({ negative: 3, neutral: 2, positive: 6, unranked: 7 }),
    ).toEqual({
      mentions: 18,
      negative: 3,
      neutral: 2,
      positive: 6,
      rated: 11,
    });
  });
});

describe("lastMentionedDays", () => {
  it.each([
    { at: "2026-10-04T12:00:00.000Z", expected: 1, name: "whole days" },
    {
      at: "2026-10-04T12:00:00.001Z",
      expected: 0,
      name: "zero below 24 hours",
    },
    {
      at: "2026-10-06T00:00:00.000Z",
      expected: 0,
      name: "zero for a future date",
    },
  ])("counts $name", ({ at, expected }) => {
    expect(lastMentionedDays(at, NOW)).toBe(expected);
  });
});

describe("collectionStart", () => {
  it.each([
    {
      bounds: {
        firstBackfilledAt: "2026-10-02T09:00:00.000Z",
        firstPublishedAt: "2026-06-12T08:00:00.000Z",
      },
      expected: utc("2026-07-01"),
      name: "the backfill window start of the first backfill",
    },
    {
      bounds: {
        firstBackfilledAt: undefined,
        firstPublishedAt: "2026-10-02T09:30:00.000Z",
      },
      expected: utc("2026-10-02"),
      name: "the first stored day when only the feed ran",
    },
    {
      bounds: { firstBackfilledAt: undefined, firstPublishedAt: undefined },
      expected: undefined,
      name: "nothing when nothing is stored",
    },
  ])("is $name", ({ bounds, expected }) => {
    expect(collectionStart(bounds)).toEqual(expected);
  });
});

describe("parseAddress", () => {
  it("trims the address and keeps its case", () => {
    expect(parseAddress("\tItay@Example.com \n")).toEqual({
      email: "Itay@Example.com",
    });
  });

  it.each(["", " \t\n"])("reports %j as empty", (raw) => {
    expect(parseAddress(raw)).toEqual({ problem: "empty" });
  });

  it.each([
    "itay@example",
    "itay@.example",
    "itay@example.",
    "itay@@example.com",
    "itay@exa@mple.com",
    "it ay@example.com",
    "itay@exam\tple.com",
    "@example.com",
    "itay",
  ])("rejects %j", (raw) => {
    expect(parseAddress(raw)).toEqual({ problem: "invalid" });
  });

  it("accepts 254 characters and rejects 255", () => {
    const at254 = `${"a".repeat(242)}@example.com`;

    expect(parseAddress(at254)).toEqual({ email: at254 });
    expect(parseAddress(`a${at254}`)).toEqual({ problem: "long" });
  });
});
