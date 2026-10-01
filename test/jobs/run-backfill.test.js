import { describe, expect, it } from "vitest";

import { exitCode, runBackfill } from "../../src/jobs/run-backfill.js";
import {
  NOW,
  column,
  givenConfig,
  givenDependencies,
  givenFeed,
  givenQuietDependencies,
} from "../helpers/backfill.js";
import { givenItem, givenLog } from "../helpers/fakes.js";
import { fileExists } from "../helpers/files.js";

describe("runBackfill collection", () => {
  it("stores each company's candidates as backfill links", async () => {
    const config = givenConfig();
    const { feed } = givenFeed({
      harvey: [givenItem("g1", "2026-08-01T00:00:00.000Z")],
    });

    await runBackfill(config, givenDependencies(feed));

    expect(
      column(
        config.coverageDatabase,
        "SELECT company_id || ':' || guid || ':' || origin FROM company_articles",
      ),
    ).toEqual(["harvey:g1:backfill"]);
  });

  it("summarizes a clean run", async () => {
    const { feed } = givenFeed({
      harvey: [givenItem("g1", "2026-08-01T00:00:00.000Z")],
    });

    const summary = await runBackfill(givenConfig(), givenDependencies(feed));

    expect(summary).toEqual({
      companies: 3,
      skipped: 0,
      collected: 3,
      inserted: 1,
      failed: 0,
      stoppedBy: undefined,
    });
  });

  it("logs each collected company", async () => {
    const { log, events } = givenLog();

    await runBackfill(givenConfig("Harvey"), {
      feed: givenFeed({}).feed,
      log,
      now: NOW,
    });

    expect(events).toEqual([
      {
        event: "feed.collected",
        fields: { company: "harvey", items: 0, inserted: 0, fullPages: 0 },
      },
    ]);
  });
});

describe("runBackfill resume", () => {
  it("skips companies collected by an earlier run", async () => {
    const config = givenConfig();
    await runBackfill(config, givenQuietDependencies());
    const { feed, asked } = givenFeed({});

    const summary = await runBackfill(config, givenDependencies(feed));

    expect({ asked, skipped: summary.skipped }).toEqual({
      asked: [],
      skipped: 3,
    });
  });

  it("does not start a second backfill while the first is still collecting", async () => {
    const config = givenConfig("Harvey");
    const started = Promise.withResolvers();
    const running = Promise.withResolvers();
    const first = runBackfill(
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
    const second = givenFeed({});

    await expect(
      runBackfill(config, givenDependencies(second.feed)),
    ).rejects.toThrow(/holds /u);
    expect(second.asked).toEqual([]);

    running.resolve("done");
    await first;
    expect(fileExists(`${config.coverageDatabase}.lock`)).toBe(false);
  });

  it("releases the job lock when it finishes", async () => {
    const config = givenConfig();

    await runBackfill(config, givenQuietDependencies());

    expect(fileExists(`${config.coverageDatabase}.lock`)).toBe(false);
  });
});

describe("exitCode", () => {
  const clean = {
    companies: 1,
    skipped: 0,
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
