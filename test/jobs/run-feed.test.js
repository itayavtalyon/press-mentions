import path from "node:path";

import { describe, expect, it } from "vitest";

import { FEED_PAGE_LIMIT } from "../../src/core/collect.js";
import { runBackfill } from "../../src/jobs/run-backfill.js";
import { exitCode, runFeed } from "../../src/jobs/run-feed.js";
import {
  NOW,
  column,
  givenConfig,
  givenDependencies,
  givenFeed,
  givenQuietDependencies,
} from "../helpers/backfill.js";
import { givenItem, givenItems, givenLog } from "../helpers/fakes.js";
import { fileExists } from "../helpers/files.js";

const INSIDE = "2026-10-04T00:00:00.000Z";
const START = "2026-10-02T00:00:00.000Z";
const BEFORE = "2026-10-01T23:59:59.999Z";

describe("runFeed collection", () => {
  it("stores in-window items as daily and asks for the trailing three days", async () => {
    const config = givenConfig("Harvey");
    const { feed, calls } = givenRecordingFeed({
      harvey: [
        givenItem("inside", INSIDE),
        givenItem("start", START),
        givenItem("before", BEFORE),
        givenItem("end", NOW.toISOString()),
      ],
    });

    const summary = await runFeed(config, givenDependencies(feed));

    expect(calls).toEqual([
      {
        id: "harvey",
        from: "2026-10-02T00:00:00.000Z",
        to: NOW.toISOString(),
      },
    ]);
    expect(
      column(
        config.coverageDatabase,
        "SELECT guid || ':' || origin || ':' || alert_eligible FROM company_articles ORDER BY guid",
      ),
    ).toEqual(["inside:daily:0", "start:daily:0"]);
    expect(
      column(config.coverageDatabase, "SELECT DISTINCT stage FROM articles"),
    ).toEqual(["unwrap"]);
    expect(summary).toEqual({
      companies: 1,
      collected: 1,
      inserted: 2,
      failed: 0,
      stoppedBy: undefined,
    });
  });

  it("does not mark a company backfilled and does not open alerts", async () => {
    const config = givenConfig("Harvey");

    await runFeed(config, givenQuietDependencies());

    expect(
      column(
        config.coverageDatabase,
        "SELECT COUNT(backfilled_at) FROM companies",
      ),
    ).toEqual([0]);
    const directory = path.dirname(config.coverageDatabase);
    expect(fileExists(path.join(directory, "alerts.sqlite"))).toBe(false);
  });
});

describe("runFeed after backfill", () => {
  it("leaves a guid backfill already stored, and still stores a new one", async () => {
    const config = givenConfig("Harvey");
    const shared = givenItem("shared", INSIDE);
    const backfill = givenFeed({ harvey: [shared] });
    await runBackfill(config, givenDependencies(backfill.feed));
    const daily = givenFeed({
      harvey: [shared, givenItem("fresh", INSIDE)],
    });

    await runFeed(config, givenDependencies(daily.feed));

    expect(
      column(
        config.coverageDatabase,
        "SELECT guid || ':' || origin || ':' || alert_eligible FROM company_articles ORDER BY guid",
      ),
    ).toEqual(["fresh:daily:0", "shared:backfill:0"]);
    expect(
      column(
        config.coverageDatabase,
        "SELECT COUNT(backfilled_at) FROM companies",
      ),
    ).toEqual([1]);
  });

  it("searches every company again and inserts only a new guid", async () => {
    const config = givenConfig("Harvey");
    const first = givenFeed({ harvey: [givenItem("g1", INSIDE)] });
    await runFeed(config, givenDependencies(first.feed));
    const { feed, asked } = givenFeed({
      harvey: [givenItem("g1", INSIDE), givenItem("g2", INSIDE)],
    });

    const summary = await runFeed(config, givenDependencies(feed));

    expect(asked).toEqual(["harvey"]);
    expect(summary.inserted).toBe(1);
  });
});

describe("runFeed full page", () => {
  it("logs a full page", async () => {
    const { log, events } = givenLog();

    await runFeed(givenConfig("Harvey"), {
      feed: givenFeed({
        harvey: givenItems(FEED_PAGE_LIMIT, "p", INSIDE),
      }).feed,
      log,
      now: NOW,
    });

    expect(events).toEqual([
      {
        event: "feed.collected",
        fields: {
          company: "harvey",
          items: FEED_PAGE_LIMIT,
          inserted: FEED_PAGE_LIMIT,
          fullPages: 1,
        },
      },
    ]);
  });
});

describe("runFeed lock", () => {
  it("does not start while backfill holds the feed lock", async () => {
    const config = givenConfig("Harvey");
    const started = Promise.withResolvers();
    const running = Promise.withResolvers();
    const backfill = runBackfill(
      config,
      givenDependencies({
        search: async () => {
          started.resolve("open");
          await running.promise;
          return [];
        },
      }),
    );
    await started.promise;
    const daily = givenFeed({});

    await expect(
      runFeed(config, givenDependencies(daily.feed)),
    ).rejects.toThrow(/holds /u);
    expect(daily.asked).toEqual([]);

    running.resolve("done");
    await backfill;
    expect(fileExists(`${config.coverageDatabase}.feed.lock`)).toBe(false);
  });
});

describe("exitCode", () => {
  const clean = {
    companies: 1,
    collected: 1,
    inserted: 0,
    failed: 0,
    stoppedBy: undefined,
  };

  it.each([
    { name: "0 for a clean run", summary: clean, expected: 0 },
    {
      name: "1 when a company failed",
      summary: { ...clean, failed: 1 },
      expected: 1,
    },
    {
      name: "1 when a stage stopped",
      summary: { ...clean, stoppedBy: "news.google.com" },
      expected: 1,
    },
  ])("is $name", ({ summary, expected }) => {
    expect(exitCode(summary)).toBe(expected);
  });
});

/**
 * @param {Record<string, import("../../src/core/collect.js").FeedItem[] | Error>} answers By company id.
 * @returns {{ feed: import("../../src/core/collect.js").Feed, calls: { id: string, from: string, to: string }[] }}
 *   A feed that records the window it was given.
 */
function givenRecordingFeed(answers) {
  /**
   * @type {{ id: string, from: string, to: string }[]}
   */
  const calls = [];
  const byCompany = new Map(Object.entries(answers));
  return {
    calls,
    feed: {
      search: async (company, window) => {
        calls.push({
          id: company.id,
          from: window.from.toISOString(),
          to: window.to.toISOString(),
        });
        const answer = byCompany.get(company.id) ?? [];
        if (answer instanceof Error) {
          throw answer;
        }
        return answer;
      },
    },
  };
}
