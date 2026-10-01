import { describe, expect, it } from "vitest";

import { createRateLimiter } from "../../src/infra/rate-limiter.js";
import { givenClock } from "../helpers/fakes.js";

const givenLimiter = () => {
  const { clock, sleeps } = givenClock(10_000);
  return {
    limiter: createRateLimiter({
      clock,
      intervalMs: (host) => (host === "slow" ? 2000 : 1000),
    }),
    sleeps,
  };
};

describe("RateLimiter.take", () => {
  it("does not wait for a host's first request", async () => {
    const { limiter, sleeps } = givenLimiter();

    await limiter.take("news.google.com");

    expect(sleeps).toEqual([]);
  });

  it("waits one interval before a second request to the same host", async () => {
    const { limiter, sleeps } = givenLimiter();
    await limiter.take("news.google.com");

    await limiter.take("news.google.com");

    expect(sleeps).toEqual([1000]);
  });

  it("does not hand out a second token early to concurrent callers", async () => {
    const { limiter, sleeps } = givenLimiter();

    await Promise.all([
      limiter.take("slow"),
      limiter.take("slow"),
      limiter.take("slow"),
    ]);

    expect(sleeps).toEqual([2000, 4000]);
  });

  it("keeps hosts independent", async () => {
    const { limiter, sleeps } = givenLimiter();
    await limiter.take("news.google.com");

    await limiter.take("slow");

    expect(sleeps).toEqual([]);
  });
});

describe("RateLimiter.pause", () => {
  it("delays the host's next request by the pause", async () => {
    const { limiter, sleeps } = givenLimiter();
    limiter.pause("news.google.com", 120_000);

    await limiter.take("news.google.com");

    expect(sleeps).toEqual([120_000]);
  });

  it("never shortens a later reserved slot", async () => {
    const { limiter, sleeps } = givenLimiter();
    await limiter.take("slow");
    limiter.pause("slow", 500);

    await limiter.take("slow");

    expect(sleeps).toEqual([2000]);
  });
});
