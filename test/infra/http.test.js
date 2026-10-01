import { describe, expect, it } from "vitest";

import {
  HttpStatusError,
  ThrottledError,
  createHttpClient,
} from "../../src/infra/http.js";
import { givenClock } from "../helpers/fakes.js";

const URL_A = "https://news.google.com/rss/search?q=a";

/**
 * A limiter that records takes and pauses without waiting.
 * @returns {{ limiter: import("../../src/infra/rate-limiter.js").RateLimiter, takes: string[], pauses: number[] }}
 *   The limiter and what it recorded.
 */
const givenLimiter = () => {
  /**
   * @type {string[]}
   */
  const takes = [];
  /**
   * @type {number[]}
   */
  const pauses = [];
  return {
    takes,
    pauses,
    limiter: {
      take: async (host) => {
        takes.push(host);
      },
      pause: (_host, ms) => {
        pauses.push(ms);
      },
    },
  };
};

/**
 * A fetch that answers each call with the next scripted outcome, and repeats the last one.
 * @param {...(Response | Error)} outcomes Responses to return or errors to throw.
 * @returns {typeof fetch} The fake fetch.
 */
const givenFetch = (...outcomes) => {
  let call = 0;
  return async () => {
    const outcome = outcomes[Math.min(call, outcomes.length - 1)];
    call += 1;
    if (outcome instanceof Error) {
      throw outcome;
    }
    return /** @type {Response} */ (outcome);
  };
};

/**
 * @param {typeof fetch} fetchImpl Fake fetch.
 * @returns {{ client: import("../../src/infra/http.js").HttpClient, takes: string[], pauses: number[] }}
 *   A client with zero jitter (half the exponential delay), a clock at 1,000,000 ms, and the limiter's records.
 */
const givenClient = (fetchImpl) => {
  const { limiter, takes, pauses } = givenLimiter();
  const { clock } = givenClock(1_000_000);
  return {
    client: createHttpClient({
      fetch: fetchImpl,
      limiter,
      clock,
      random: () => 0,
    }),
    takes,
    pauses,
  };
};

const ok = () => new Response("<rss/>", { status: 200 });

describe("HttpClient.getText on success", () => {
  it("returns the body", async () => {
    const { client } = givenClient(givenFetch(ok()));

    await expect(client.getText(URL_A)).resolves.toBe("<rss/>");
  });

  it("takes a rate-limit slot for the host first", async () => {
    const { client, takes } = givenClient(givenFetch(ok()));

    await client.getText(URL_A);

    expect(takes).toEqual(["news.google.com"]);
  });
});

describe("HttpClient.getText backoff", () => {
  it("waits for Retry-After seconds on 429, then retries", async () => {
    const { client, pauses } = givenClient(
      givenFetch(
        new Response(undefined, {
          status: 429,
          headers: { "retry-after": "120" },
        }),
        ok(),
      ),
    );

    await expect(client.getText(URL_A)).resolves.toBe("<rss/>");
    expect(pauses).toEqual([120_000]);
  });

  it("waits until a Retry-After date", async () => {
    const at = new Date(1_000_000 + 30_000).toUTCString();
    const { client, pauses } = givenClient(
      givenFetch(
        new Response(undefined, {
          status: 503,
          headers: { "retry-after": at },
        }),
        ok(),
      ),
    );

    await client.getText(URL_A);

    expect(pauses).toEqual([30_000]);
  });

  it("backs off exponentially without Retry-After, with jitter between half and all of the delay", async () => {
    const { client, pauses } = givenClient(
      givenFetch(new Response(undefined, { status: 500 })),
    );

    await expect(client.getText(URL_A)).rejects.toThrow(ThrottledError);
    expect(pauses).toEqual([1000, 2000, 4000, 8000, 16_000]);
  });

  it("ignores an unreadable Retry-After and backs off", async () => {
    const { client, pauses } = givenClient(
      givenFetch(
        new Response(undefined, {
          status: 429,
          headers: { "retry-after": "soon" },
        }),
        ok(),
      ),
    );

    await client.getText(URL_A);

    expect(pauses).toEqual([1000]);
  });
});

describe("HttpClient.getText giving up and retrying", () => {
  it("gives up after five attempts, naming the host and the last reason", async () => {
    const { client, takes } = givenClient(
      givenFetch(new Response(undefined, { status: 429 })),
    );

    await expect(client.getText(URL_A)).rejects.toThrow(
      "news.google.com still throttling after backoff: HTTP 429",
    );
    expect(takes).toHaveLength(5);
  });

  it("gives up at once when Retry-After asks for more than five minutes", async () => {
    const { client, takes } = givenClient(
      givenFetch(
        new Response(undefined, {
          status: 429,
          headers: { "retry-after": "301" },
        }),
      ),
    );

    await expect(client.getText(URL_A)).rejects.toThrow(ThrottledError);
    expect(takes).toHaveLength(1);
  });

  it("retries a network error", async () => {
    const { client } = givenClient(
      givenFetch(new TypeError("fetch failed"), ok()),
    );

    await expect(client.getText(URL_A)).resolves.toBe("<rss/>");
  });

  it("retries a blocked page", async () => {
    const { client } = givenClient(givenFetch(new Response("<html/>"), ok()));
    let calls = 0;

    const body = await client.getText(URL_A, {
      isBlocked: () => (calls += 1) === 1,
    });

    expect(body).toBe("<rss/>");
  });

  it("names a network error as the last reason", async () => {
    const { client } = givenClient(givenFetch(new TypeError("fetch failed")));

    await expect(client.getText(URL_A)).rejects.toThrow(
      "network: TypeError: fetch failed",
    );
  });
});

describe("HttpClient.getText on a terminal status", () => {
  it("throws HttpStatusError with the status", async () => {
    const { client } = givenClient(
      givenFetch(new Response(undefined, { status: 404 })),
    );

    await expect(client.getText(URL_A)).rejects.toMatchObject({
      name: "HttpStatusError",
      status: 404,
    });
  });

  it("does not retry", async () => {
    const { client, takes } = givenClient(
      givenFetch(new Response(undefined, { status: 403 })),
    );

    await expect(client.getText(URL_A)).rejects.toThrow(HttpStatusError);
    expect(takes).toHaveLength(1);
  });
});

describe("ThrottledError", () => {
  it("carries the host", async () => {
    const { client } = givenClient(
      givenFetch(new Response(undefined, { status: 429 })),
    );

    await expect(client.getText(URL_A)).rejects.toMatchObject({
      host: "news.google.com",
    });
  });
});
