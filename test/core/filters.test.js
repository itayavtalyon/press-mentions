import { describe, expect, it } from "vitest";

import { parseFilters, VISIBLE_VERDICTS } from "../../src/core/filters.js";

const NOW = new Date("2026-10-05T12:00:00.000Z");

/**
 * @param {string} search Query string without `?`.
 * @returns {ReturnType<typeof parseFilters>} Parsed filters at NOW.
 */
const parse = (search) => parseFilters(new URLSearchParams(search), NOW);

/**
 * @param {string} search Query string that must parse.
 * @returns {import("../../src/core/filters.js").Filters} The filters.
 */
const filtersOf = (search) => {
  const result = parse(search);
  if (!("filters" in result)) {
    throw new Error(`expected filters for "${search}"`);
  }
  return result.filters;
};

/**
 * @param {string} search Query string that must fail.
 * @returns {import("../../src/core/filters.js").Problem[]} The problems.
 */
const problemsOf = (search) => {
  const result = parse(search);
  if (!("problems" in result)) {
    throw new Error(`expected problems for "${search}"`);
  }
  return result.problems;
};

/**
 * @param {string} day `YYYY-MM-DD`.
 * @returns {Date} Midnight UTC that day.
 */
const utc = (day) => new Date(`${day}T00:00:00.000Z`);

describe("parseFilters windows", () => {
  it("defaults to last quarter, every visible verdict, and a 90-day prefill through today", () => {
    expect(parse("")).toEqual({
      filters: {
        range: { from: utc("2026-07-01"), to: utc("2026-10-01") },
        verdict: "all",
        verdicts: VISIBLE_VERDICTS,
        window: "last",
      },
      form: {
        from: "2026-07-08",
        to: "2026-10-05",
        verdict: "all",
        window: "last",
      },
    });
  });

  it("lists visible verdicts in digest order", () => {
    expect(VISIBLE_VERDICTS).toEqual([
      "negative",
      "positive",
      "neutral",
      "unranked",
    ]);
  });

  it("reads an empty window as last quarter", () => {
    expect(filtersOf("window=").window).toBe("last");
  });

  it("runs this quarter from its start through now", () => {
    expect(filtersOf("window=this").range).toEqual({
      from: utc("2026-10-01"),
      to: NOW,
    });
  });

  it("ignores custom dates unless custom is selected", () => {
    expect(parse("window=last&from=nonsense&to=2026-01-01")).toMatchObject({
      filters: { window: "last" },
      form: { from: "2026-07-08", to: "2026-10-05" },
    });
  });

  it("rejects an unknown window and an unknown verdict together", () => {
    expect(problemsOf("window=week&verdict=bogus")).toEqual([
      { field: "window", kind: "unknown" },
      { field: "verdict", kind: "unknown" },
    ]);
  });
});

describe("parseFilters custom range", () => {
  it.each([
    {
      from: "2026-08-01",
      to: "2026-08-31",
      end: "2026-09-01",
      name: "includes the whole to day",
    },
    {
      from: "2026-08-01",
      to: "2026-08-01",
      end: "2026-08-02",
      name: "accepts one day",
    },
  ])("$name", ({ from, to, end }) => {
    expect(filtersOf(`window=custom&from=${from}&to=${to}`).range).toEqual({
      from: utc(from),
      to: utc(end),
    });
  });

  it.each(["2026-02-30", "2026-13-01", "2026-08-01T00:00:00Z", "", "26-08-01"])(
    "rejects from=%j",
    (value) => {
      expect(problemsOf(`window=custom&from=${value}&to=2026-08-31`)).toEqual([
        { field: "from", kind: "invalid" },
      ]);
    },
  );

  it("reports both dates when both are unreadable", () => {
    expect(problemsOf("window=custom&from=x&to=y")).toEqual([
      { field: "from", kind: "invalid" },
      { field: "to", kind: "invalid" },
    ]);
  });

  it.each([
    { field: "from", search: "window=custom&to=2026-08-31" },
    { field: "to", search: "window=custom&from=2026-08-01" },
  ])("reports a missing $field date", ({ field, search }) => {
    expect(problemsOf(search)).toEqual([{ field, kind: "invalid" }]);
  });

  it("puts the order problem on from and echoes the typed values", () => {
    expect(parse("window=custom&from=2026-09-30&to=2026-07-01")).toEqual({
      form: {
        from: "2026-09-30",
        to: "2026-07-01",
        verdict: "all",
        window: "custom",
      },
      problems: [{ field: "from", kind: "order" }],
    });
  });
});

describe("parseFilters custom range end", () => {
  it("rejects a to day whose next day leaves four-digit years", () => {
    expect(problemsOf("window=custom&from=2026-08-01&to=9999-12-31")).toEqual([
      { field: "to", kind: "invalid" },
    ]);
  });
});

describe("parseFilters verdict", () => {
  it.each(["", "all"])("reads verdict=%j as every visible verdict", (raw) => {
    expect(filtersOf(`verdict=${raw}`)).toMatchObject({
      verdict: "all",
      verdicts: VISIBLE_VERDICTS,
    });
  });

  it.each(VISIBLE_VERDICTS)("narrows to %s", (verdict) => {
    expect(filtersOf(`verdict=${verdict}`)).toMatchObject({
      verdict,
      verdicts: [verdict],
    });
  });

  it.each(["unrelated", "uncertain", "Negative", "bogus"])(
    "rejects verdict=%s",
    (verdict) => {
      expect(problemsOf(`verdict=${verdict}`)).toEqual([
        { field: "verdict", kind: "unknown" },
      ]);
    },
  );
});
