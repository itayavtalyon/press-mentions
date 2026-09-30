import { describe, expect, it } from "vitest";

import { daysSince } from "../../src/core/mention-status.js";

describe("daysSince", () => {
  it.each([
    {
      name: "counts whole days from date until now",
      date: "2026-01-01T00:00:00.000Z",
      now: "2026-01-11T00:00:00.000Z",
      expected: 10,
    },
    {
      name: "rounds a partial day toward negative infinity",
      date: "2026-01-01T00:00:00.000Z",
      now: "2026-01-02T23:59:59.999Z",
      expected: 1,
    },
    {
      name: "returns zero when less than a day has elapsed",
      date: "2026-01-01T00:00:00.000Z",
      now: "2026-01-01T23:59:59.999Z",
      expected: 0,
    },
    {
      name: "returns zero when date and now are the same instant",
      date: "2026-06-15T12:00:00.000Z",
      now: "2026-06-15T12:00:00.000Z",
      expected: 0,
    },
    {
      name: "returns a negative count when date is after now",
      date: "2026-01-05T00:00:00.000Z",
      now: "2026-01-01T00:00:00.000Z",
      expected: -4,
    },
    {
      name: "rounds a partial negative span toward negative infinity",
      date: "2026-01-02T12:00:00.000Z",
      now: "2026-01-01T00:00:00.000Z",
      expected: -2,
    },
  ])("$name", ({ date, now, expected }) => {
    expect(daysSince(new Date(date), new Date(now))).toBe(expected);
  });

  it("throws when date is invalid", () => {
    expect(() => daysSince(new Date("nope"), new Date())).toThrow(TypeError);
  });

  it("throws when now is invalid", () => {
    expect(() => daysSince(new Date(), new Date("nope"))).toThrow(TypeError);
  });
});
