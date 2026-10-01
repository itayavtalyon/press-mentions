import path from "node:path";

import { describe, expect, it } from "vitest";

import { runBackfill } from "../../src/jobs/run-backfill.js";
import {
  NOW,
  givenConfig,
  givenDependencies,
  givenFeed,
  givenQuietDependencies,
  throttled,
} from "../helpers/backfill.js";
import { givenLog } from "../helpers/fakes.js";
import { fileExists, givenFile } from "../helpers/files.js";

describe("runBackfill when a company fails", () => {
  it("continues with the next company", async () => {
    const { feed, asked } = givenFeed({ harvey: new Error("parse") });

    const summary = await runBackfill(givenConfig(), givenDependencies(feed));

    expect({ asked, failed: summary.failed }).toEqual({
      asked: ["harvey", "ludeo", "wave"],
      failed: 1,
    });
  });

  it("logs the company and the error", async () => {
    const { log, events } = givenLog();

    await runBackfill(givenConfig("Harvey"), {
      feed: givenFeed({ harvey: new Error("parse") }).feed,
      log,
      now: NOW,
    });

    expect(events).toEqual([
      {
        event: "feed.failed",
        fields: { company: "harvey", error: "Error: parse" },
      },
    ]);
  });

  it("leaves the company pending for the next run", async () => {
    const config = givenConfig();
    const failing = givenFeed({ harvey: new Error("parse") });
    await runBackfill(config, givenDependencies(failing.feed));
    const { feed, asked } = givenFeed({});

    await runBackfill(config, givenDependencies(feed));

    expect(asked).toEqual(["harvey"]);
  });
});

describe("runBackfill when Google keeps throttling", () => {
  const seed = "Harvey\nLudeo\nWave\nExtra";

  it("stops the feed stage after three exhausted backoffs in a row", async () => {
    const { feed, asked } = givenFeed({
      harvey: throttled(),
      ludeo: throttled(),
      wave: throttled(),
    });

    const summary = await runBackfill(
      givenConfig(seed),
      givenDependencies(feed),
    );

    expect({ asked, stoppedBy: summary.stoppedBy }).toEqual({
      asked: ["harvey", "ludeo", "wave"],
      stoppedBy: "news.google.com",
    });
  });

  it("logs how many companies the stop left pending", async () => {
    const { feed } = givenFeed({
      harvey: throttled(),
      ludeo: throttled(),
      wave: throttled(),
    });
    const { log, events } = givenLog();

    await runBackfill(givenConfig(seed), { feed, log, now: NOW });

    expect(events.at(-1)).toEqual({
      event: "feed.stopped",
      fields: { host: "news.google.com", pending: 1 },
    });
  });
});

describe("runBackfill throttle count", () => {
  it("resets the count after a success", async () => {
    const { feed } = givenFeed({
      a: throttled(),
      b: throttled(),
      d: throttled(),
      e: throttled(),
    });

    const summary = await runBackfill(
      givenConfig("A\nB\nC\nD\nE"),
      givenDependencies(feed),
    );

    expect({ stoppedBy: summary.stoppedBy, failed: summary.failed }).toEqual({
      stoppedBy: undefined,
      failed: 4,
    });
  });

  it("resets the count after a different failure", async () => {
    const { feed } = givenFeed({
      a: throttled(),
      b: throttled(),
      c: new Error("parse"),
      d: throttled(),
    });

    const summary = await runBackfill(
      givenConfig("A\nB\nC\nD"),
      givenDependencies(feed),
    );

    expect(summary.stoppedBy).toBeUndefined();
  });
});

describe("runBackfill refusals", () => {
  it("refuses to run while another job holds the lock", async () => {
    const config = givenConfig();
    givenFile(
      path.dirname(config.coverageDatabase),
      "coverage.sqlite.lock",
      "4242",
    );

    await expect(runBackfill(config, givenQuietDependencies())).rejects.toThrow(
      "Process 4242 holds",
    );
  });

  it("does not create the store when the seed is invalid", async () => {
    const config = givenConfig("Wave)");

    await expect(runBackfill(config, givenQuietDependencies())).rejects.toThrow(
      'Seed line "Wave)"',
    );
    expect(fileExists(config.coverageDatabase)).toBe(false);
  });
});
