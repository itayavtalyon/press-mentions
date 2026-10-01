import { describe, expect, it } from "vitest";

import {
  backfillWindow,
  contains,
  splitWeeks,
} from "../../src/core/windows.js";

describe("backfillWindow", () => {
  it("starts at the previous quarter and ends now", () => {
    const now = new Date("2026-10-05T12:00:00.000Z");

    expect(backfillWindow(now)).toEqual({
      from: new Date("2026-07-01T00:00:00.000Z"),
      to: now,
    });
  });

  it("starts at the previous quarter when now is exactly a quarter start", () => {
    const { from } = backfillWindow(new Date("2026-10-01T00:00:00.000Z"));

    expect(from).toEqual(new Date("2026-07-01T00:00:00.000Z"));
  });

  it("rolls back into the previous year in the first quarter", () => {
    const { from } = backfillWindow(new Date("2027-02-14T00:00:00.000Z"));

    expect(from).toEqual(new Date("2026-10-01T00:00:00.000Z"));
  });
});

describe("splitWeeks", () => {
  it("cuts seven-day weeks and ends the last one at the window end", () => {
    const weeks = splitWeeks({
      from: new Date("2026-07-01T00:00:00Z"),
      to: new Date("2026-07-10T00:00:00Z"),
    });

    expect(weeks).toEqual([
      {
        from: new Date("2026-07-01T00:00:00Z"),
        to: new Date("2026-07-08T00:00:00Z"),
      },
      {
        from: new Date("2026-07-08T00:00:00Z"),
        to: new Date("2026-07-10T00:00:00Z"),
      },
    ]);
  });

  it("covers a backfill quarter with fourteen weeks", () => {
    const weeks = splitWeeks(backfillWindow(new Date("2026-10-05T00:00:00Z")));

    expect(weeks).toHaveLength(14);
  });

  it("returns no weeks for an empty window", () => {
    const instant = new Date("2026-07-01T00:00:00Z");

    expect(splitWeeks({ from: instant, to: instant })).toEqual([]);
  });
});

describe("contains", () => {
  const window = {
    from: new Date("2026-07-01T00:00:00Z"),
    to: new Date("2026-07-08T00:00:00Z"),
  };

  it.each([
    {
      instant: "2026-07-01T00:00:00.000Z",
      expected: true,
      name: "includes the start",
    },
    {
      instant: "2026-07-07T23:59:59.999Z",
      expected: true,
      name: "includes the last millisecond",
    },
    {
      instant: "2026-07-08T00:00:00.000Z",
      expected: false,
      name: "excludes the end",
    },
    {
      instant: "2026-06-30T23:59:59.999Z",
      expected: false,
      name: "excludes before the start",
    },
  ])("$name", ({ instant, expected }) => {
    expect(contains(window, instant)).toBe(expected);
  });
});
