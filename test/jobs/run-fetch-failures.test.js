import { describe, expect, it } from "vitest";

import { HttpStatusError, ThrottledError } from "../../src/infra/http.js";
import { exitCode, runFetch } from "../../src/jobs/run-fetch.js";
import { givenLog } from "../helpers/fakes.js";
import { fileExists, givenFile } from "../helpers/files.js";
import {
  addQueuedArticle,
  givenQueueStore,
  readArticle,
} from "../helpers/queue.js";

const DAY = "2026-08-01T00:00:00.000Z";

/**
 * @param {string} guid Article id.
 * @param {number} index Position, used as the published instant.
 * @param {string} [host] Publisher host.
 * @returns {import("../helpers/queue.js").QueuedArticle} A fetch-stage article.
 */
function queued(guid, index, host = "example.com") {
  return {
    guid,
    publishedAt: new Date(Date.parse(DAY) + index * 86_400_000).toISOString(),
    publisherUrl: `https://${host}/${guid}`,
    stage: "fetch",
  };
}

describe("runFetch when a publisher throttles", () => {
  it("leaves the row retryable on the fetch stage", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    addQueuedArticle(database, queued("g1", 0));
    database.close();

    const summary = await runFetch(
      { coverageDatabase },
      {
        articles: {
          fetchArticle: async () => {
            throw new ThrottledError("example.com", "HTTP 429");
          },
        },
        log: givenLog().log,
      },
    );

    const row = readArticle(coverageDatabase, "g1");
    expect(row).toMatchObject({
      attemptCount: 1,
      lastError: expect.stringContaining("example.com"),
      retryable: 1,
      stage: "fetch",
    });
    expect(summary.remaining).toBe(1);
    expect(exitCode(summary)).toBe(1);
  });
});

describe("runFetch third exhaustion", () => {
  it("makes the third exhausted run terminal and leaves the stage", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    addQueuedArticle(database, { ...queued("g1", 0), attemptCount: 2 });
    database.close();

    const summary = await runFetch(
      { coverageDatabase },
      {
        articles: {
          fetchArticle: async () => {
            throw new ThrottledError("example.com", "HTTP 503");
          },
        },
        log: givenLog().log,
      },
    );

    expect(readArticle(coverageDatabase, "g1")).toMatchObject({
      attemptCount: 3,
      retryable: 0,
      stage: "fetch",
    });
    expect(summary.terminal).toBe(1);
    expect(summary.remaining).toBe(0);
    expect(exitCode(summary)).toBe(0);
  });
});

describe("runFetch host stop", () => {
  it("stops that host after three exhaustions and keeps fetching other hosts", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    for (const [index, guid] of ["a", "b", "c", "d"].entries()) {
      addQueuedArticle(database, queued(guid, index));
    }
    addQueuedArticle(database, queued("other", 4, "other.test"));
    database.close();
    /**
     * @type {string[]}
     */
    const calls = [];

    const summary = await runFetch(
      { coverageDatabase },
      {
        articles: {
          fetchArticle: async (url) => {
            calls.push(url);
            if (url.includes("other.test")) {
              return "<p>ok</p>";
            }
            throw new ThrottledError("example.com", "HTTP 429");
          },
        },
        log: givenLog().log,
      },
    );

    expect(calls).toEqual([
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/c",
      "https://other.test/other",
    ]);
    expect(readArticle(coverageDatabase, "d")).toMatchObject({
      attemptCount: 0,
      retryable: 1,
      stage: "fetch",
    });
    expect(summary.stoppedHosts).toEqual(["example.com"]);
    expect(summary.skipped).toBe(1);
    expect(exitCode(summary)).toBe(1);
  });
});

describe("runFetch host reset", () => {
  it("resets a host after a page is stored", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    for (const [index, guid] of ["a", "b", "c", "d", "e", "f", "g"].entries()) {
      addQueuedArticle(database, queued(guid, index));
    }
    addQueuedArticle(database, queued("other", 7, "other.test"));
    database.close();
    /**
     * @type {string[]}
     */
    const calls = [];

    await runFetch(
      { coverageDatabase },
      {
        articles: {
          fetchArticle: async (url) => {
            calls.push(url);
            if (url.endsWith("/c") || url.includes("other.test")) {
              return "<p>ok</p>";
            }
            throw new ThrottledError("example.com", "HTTP 429");
          },
        },
        log: givenLog().log,
      },
    );

    expect(calls).toEqual([
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/c",
      "https://example.com/d",
      "https://example.com/e",
      "https://example.com/f",
      "https://other.test/other",
    ]);
    expect(readArticle(coverageDatabase, "g").stage).toBe("fetch");
  });
});

describe("runFetch status reset", () => {
  it("resets a host after a non-retryable status", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    for (const [index, guid] of ["a", "b", "c", "d", "e", "f", "g"].entries()) {
      addQueuedArticle(database, queued(guid, index));
    }
    database.close();
    /**
     * @type {string[]}
     */
    const calls = [];

    await runFetch(
      { coverageDatabase },
      {
        articles: {
          fetchArticle: async (url) => {
            calls.push(url);
            if (url.endsWith("/c")) {
              throw new HttpStatusError(url, 401);
            }
            throw new ThrottledError("example.com", "HTTP 429");
          },
        },
        log: givenLog().log,
      },
    );

    expect(calls).toContain("https://example.com/e");
    expect(calls).not.toContain("https://example.com/g");
  });
});

describe("runFetch when the row moves", () => {
  it("logs the guid and leaves the row where it went", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    addQueuedArticle(database, queued("saved", 0));
    addQueuedArticle(database, queued("status", 1));
    addQueuedArticle(database, queued("throttled", 2));
    const { log, events } = givenLog();

    await runFetch(
      { coverageDatabase },
      {
        articles: {
          fetchArticle: async (url) => {
            const guid = url.slice(url.lastIndexOf("/") + 1);
            database
              .prepare("UPDATE articles SET stage = 'classify' WHERE guid = ?")
              .run(guid);
            if (guid === "status") {
              throw new HttpStatusError(url, 401);
            }
            if (guid === "throttled") {
              throw new ThrottledError("example.com", "HTTP 429");
            }
            return "<p>late</p>";
          },
        },
        log,
      },
    );

    expect(events).toEqual([
      { event: "fetch.moved", fields: { guid: "saved", stage: "fetch" } },
      { event: "fetch.moved", fields: { guid: "status", stage: "fetch" } },
      { event: "fetch.moved", fields: { guid: "throttled", stage: "fetch" } },
    ]);
    expect(readArticle(coverageDatabase, "saved").stage).toBe("classify");
    database.close();
  });
});

describe("runFetch unexpected errors", () => {
  it("rejects an unexpected error and releases the lock", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    addQueuedArticle(database, queued("g1", 0));
    database.close();

    await expect(
      runFetch(
        { coverageDatabase },
        {
          articles: {
            fetchArticle: async () => {
              throw new Error("disk");
            },
          },
          log: givenLog().log,
        },
      ),
    ).rejects.toThrow("disk");
    expect(readArticle(coverageDatabase, "g1").stage).toBe("fetch");
    expect(fileExists(`${coverageDatabase}.fetch.lock`)).toBe(false);
  });

  it("takes a lock whose pid is not running", async () => {
    const { coverageDatabase, database, directory } = givenQueueStore();
    addQueuedArticle(database, queued("g1", 0));
    database.close();
    givenFile(directory, "coverage.sqlite.fetch.lock", "2147483647");

    const summary = await runFetch(
      { coverageDatabase },
      {
        articles: { fetchArticle: async () => "<p>x</p>" },
        log: givenLog().log,
      },
    );

    expect(summary.fetched).toBe(1);
  });
});
