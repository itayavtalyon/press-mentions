import { describe, expect, it } from "vitest";

import {
  BACKFILL_CAP,
  FEED_PAGE_LIMIT,
  collectBackfill,
} from "../../src/core/collect.js";
import { givenCompany, givenItem, givenItems } from "../helpers/fakes.js";

const NOW = new Date("2026-10-05T00:00:00.000Z");
const QUARTER_START = "2026-07-01T00:00:00.000Z";

/**
 * A feed that answers the first (whole-window) query with `firstPage` and each later (weekly) query with `perWeek`
 * items dated one hour into that week.
 * @param {import("../../src/core/collect.js").FeedItem[]} firstPage Items for the whole-window query.
 * @param {number} perWeek Items per weekly query.
 * @returns {{ feed: import("../../src/core/collect.js").Feed, windows: import("../../src/core/windows.js").Window[] }}
 *   The feed and the windows it was asked for.
 */
const givenFeed = (firstPage, perWeek = 0) => {
  /**
   * @type {import("../../src/core/windows.js").Window[]}
   */
  const windows = [];
  return {
    windows,
    feed: {
      search: async (_company, window) => {
        windows.push(window);
        if (windows.length === 1) {
          return firstPage;
        }
        const hourIn = new Date(
          window.from.getTime() + 3_600_000,
        ).toISOString();
        return givenItems(perWeek, `w${windows.length - 1}`, hourIn);
      },
    },
  };
};

describe("collectBackfill for a quiet company", () => {
  it("queries once for last quarter through now", async () => {
    const { feed, windows } = givenFeed([]);

    await collectBackfill(givenCompany(), feed, NOW);

    expect(windows).toEqual([{ from: new Date(QUARTER_START), to: NOW }]);
  });

  it("keeps only items inside the window", async () => {
    const page = [
      givenItem("before", "2026-06-30T23:59:59.000Z"),
      givenItem("inside", "2026-08-01T00:00:00.000Z"),
    ];
    const { feed } = givenFeed(page);

    const { items } = await collectBackfill(givenCompany(), feed, NOW);

    expect(items.map((item) => item.guid)).toEqual(["inside"]);
  });

  it("reports no full pages", async () => {
    const { feed } = givenFeed(
      givenItems(FEED_PAGE_LIMIT - 1, "q", "2026-08-01T00:00:00.000Z"),
    );

    await expect(
      collectBackfill(givenCompany(), feed, NOW),
    ).resolves.toMatchObject({ fullPages: 0 });
  });
});

describe("collectBackfill for a busy company", () => {
  const fullPage = givenItems(FEED_PAGE_LIMIT, "q", "2026-08-01T00:00:00.000Z");

  it("queries each week after a full first page", async () => {
    const { feed, windows } = givenFeed(fullPage, 1);

    await collectBackfill(givenCompany(), feed, NOW);

    expect(windows).toHaveLength(1 + 14);
  });

  it(`keeps at most ${BACKFILL_CAP} items`, async () => {
    const { feed } = givenFeed(fullPage, 20);

    const { items } = await collectBackfill(givenCompany(), feed, NOW);

    expect(items).toHaveLength(BACKFILL_CAP);
  });

  it("takes the first item of every week before the second of any", async () => {
    const { feed } = givenFeed(fullPage, 20);

    const { items } = await collectBackfill(givenCompany(), feed, NOW);

    expect(items.slice(0, 15).map((item) => item.guid)).toEqual([
      ...Array.from({ length: 14 }, (_, week) => `w${week + 1}-0`),
      "w1-1",
    ]);
  });

  it("counts the first page and every full week page", async () => {
    const { feed } = givenFeed(fullPage, FEED_PAGE_LIMIT);

    await expect(
      collectBackfill(givenCompany(), feed, NOW),
    ).resolves.toMatchObject({ fullPages: 1 + 14 });
  });
});
