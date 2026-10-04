import { describe, expect, it } from "vitest";

import { runFeed } from "../../src/jobs/run-feed.js";
import {
  NOW,
  givenConfig,
  givenDependencies,
  givenFeed,
  throttled,
} from "../helpers/backfill.js";
import { givenLog } from "../helpers/fakes.js";

describe("runFeed when a company fails", () => {
  it("continues with the next company", async () => {
    const { feed, asked } = givenFeed({ harvey: new Error("parse") });

    const summary = await runFeed(givenConfig(), givenDependencies(feed));

    expect({ asked, failed: summary.failed }).toEqual({
      asked: ["harvey", "ludeo", "wave"],
      failed: 1,
    });
  });

  it("searches that company again on the next run", async () => {
    const config = givenConfig("Harvey");
    const failing = givenFeed({ harvey: new Error("parse") });
    await runFeed(config, givenDependencies(failing.feed));
    const { feed, asked } = givenFeed({});

    await runFeed(config, givenDependencies(feed));

    expect(asked).toEqual(["harvey"]);
  });
});

describe("runFeed when Google keeps throttling", () => {
  const seed = "Harvey\nLudeo\nWave\nExtra";

  it("stops the feed stage after three exhausted backoffs in a row", async () => {
    const { feed, asked } = givenFeed({
      harvey: throttled(),
      ludeo: throttled(),
      wave: throttled(),
    });

    const summary = await runFeed(givenConfig(seed), givenDependencies(feed));

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

    await runFeed(givenConfig(seed), { feed, log, now: NOW });

    expect(events.at(-1)).toEqual({
      event: "feed.stopped",
      fields: { host: "news.google.com", pending: 1 },
    });
  });

  it("resets the count after a success", async () => {
    const { feed } = givenFeed({
      a: throttled(),
      b: throttled(),
      d: throttled(),
      e: throttled(),
    });

    const summary = await runFeed(
      givenConfig("A\nB\nC\nD\nE"),
      givenDependencies(feed),
    );

    expect({ stoppedBy: summary.stoppedBy, failed: summary.failed }).toEqual({
      stoppedBy: undefined,
      failed: 4,
    });
  });
});
