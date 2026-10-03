import { describe, expect, it } from "vitest";

import { HttpStatusError, ThrottledError } from "../../src/infra/http.js";
import { BatchError, UnresolvedError } from "../../src/infra/resolver.js";
import { exitCode, runUnwrap } from "../../src/jobs/run-unwrap.js";
import { givenLog, resolving, signing } from "../helpers/fakes.js";
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
 * @returns {import("../helpers/queue.js").QueuedArticle} An unwrap-stage article.
 */
function queued(guid, index) {
  return {
    guid,
    publishedAt: new Date(Date.parse(DAY) + index * 86_400_000).toISOString(),
    stage: "unwrap",
  };
}

describe("runUnwrap when Google throttles", () => {
  it("leaves the row retryable on the unwrap stage", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    addQueuedArticle(database, queued("g1", 0));
    database.close();

    const summary = await runUnwrap(
      { coverageDatabase },
      {
        articles: resolving(async () => {
          throw new ThrottledError("news.google.com", "HTTP 429");
        }),
        log: givenLog().log,
      },
    );

    expect(readArticle(coverageDatabase, "g1")).toMatchObject({
      attemptCount: 1,
      retryable: 1,
      stage: "unwrap",
    });
    expect(summary.retried).toBe(1);
    expect(summary.remaining).toBe(1);
    expect(exitCode(summary)).toBe(1);
  });
});

describe("runUnwrap third exhaustion", () => {
  it("makes the third exhausted run terminal and leaves the stage", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    addQueuedArticle(database, { ...queued("g1", 0), attemptCount: 2 });
    database.close();

    const summary = await runUnwrap(
      { coverageDatabase },
      {
        articles: resolving(async () => {
          throw new ThrottledError("news.google.com", "HTTP 429");
        }),
        log: givenLog().log,
      },
    );

    expect(readArticle(coverageDatabase, "g1")).toMatchObject({
      attemptCount: 3,
      retryable: 0,
      stage: "unwrap",
    });
    expect(summary.terminal).toBe(1);
    expect(summary.remaining).toBe(0);
    expect(exitCode(summary)).toBe(0);
  });
});

describe("runUnwrap stop", () => {
  it("stops the command after three exhaustions and does not request the rest", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    for (const [index, guid] of ["ok", "a", "b", "c", "d"].entries()) {
      addQueuedArticle(database, queued(guid, index));
    }
    database.close();
    let calls = 0;

    const summary = await runUnwrap(
      { coverageDatabase },
      {
        articles: resolving(async () => {
          calls += 1;
          if (calls === 1) {
            return "https://publisher.example/ok";
          }
          throw new ThrottledError("news.google.com", "HTTP 429");
        }),
        log: givenLog().log,
      },
    );

    expect(calls).toBe(4);
    expect(readArticle(coverageDatabase, "ok").stage).toBe("fetch");
    expect(readArticle(coverageDatabase, "d")).toMatchObject({
      attemptCount: 0,
      stage: "unwrap",
    });
    expect(summary.skipped).toBe(1);
    expect(summary.stoppedBy).toBe("news.google.com");
    expect(exitCode(summary)).toBe(1);
  });
});

describe("runUnwrap reset", () => {
  it("resets the streak after a publisher URL is stored", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    for (const [index, guid] of ["a", "b", "c", "d"].entries()) {
      addQueuedArticle(database, queued(guid, index));
    }
    database.close();
    let calls = 0;

    await runUnwrap(
      { coverageDatabase },
      {
        articles: resolving(async () => {
          calls += 1;
          if (calls === 3) {
            return "https://publisher.example/c";
          }
          throw new ThrottledError("news.google.com", "HTTP 429");
        }),
        log: givenLog().log,
      },
    );

    expect(calls).toBe(4);
    expect(readArticle(coverageDatabase, "d").stage).toBe("unwrap");
  });
});
describe("runUnwrap moved row", () => {
  it("logs the guid and leaves the row where it went", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    addQueuedArticle(database, queued("g1", 0));
    const { events, log } = givenLog();

    await runUnwrap(
      { coverageDatabase },
      {
        articles: resolving(async () => {
          database
            .prepare("UPDATE articles SET stage = 'classify' WHERE guid = 'g1'")
            .run();
          return "https://publisher.example/late";
        }),
        log,
      },
    );

    expect(events).toEqual([
      { event: "unwrap.moved", fields: { guid: "g1", stage: "unwrap" } },
    ]);
    expect(readArticle(coverageDatabase, "g1").stage).toBe("classify");
    database.close();
  });

  it("logs a throttle whose row already moved", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    addQueuedArticle(database, queued("g1", 0));
    const { events, log } = givenLog();

    await runUnwrap(
      { coverageDatabase },
      {
        articles: resolving(async () => {
          database
            .prepare("UPDATE articles SET stage = 'classify' WHERE guid = 'g1'")
            .run();
          throw new ThrottledError("news.google.com", "HTTP 429");
        }),
        log,
      },
    );

    expect(events).toEqual([
      { event: "unwrap.moved", fields: { guid: "g1", stage: "unwrap" } },
    ]);
    database.close();
  });
});
describe("runUnwrap title path moved", () => {
  it("logs a title-path failure whose row already moved", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    addQueuedArticle(database, queued("g1", 0));
    const { events, log } = givenLog();

    await runUnwrap(
      { coverageDatabase },
      {
        articles: resolving(async (url) => {
          database
            .prepare("UPDATE articles SET stage = 'classify' WHERE guid = 'g1'")
            .run();
          throw new UnresolvedError(url, "no signature");
        }),
        log,
      },
    );

    expect(events).toEqual([
      { event: "unwrap.moved", fields: { guid: "g1", stage: "unwrap" } },
    ]);
    database.close();
  });
});
describe("runUnwrap batch post", () => {
  it.each([
    ["an unparsed batch", () => new BatchError()],
    ["HTTP 400", () => new HttpStatusError("https://news.google.com/x", 400)],
    [
      "an exhausted POST",
      () => new ThrottledError("news.google.com", "HTTP 429"),
    ],
  ])("retries the signed set after %s", async (_label, createError) => {
    const { coverageDatabase, database } = givenQueueStore();
    for (const [index, guid] of ["a", "b", "c", "d"].entries()) {
      addQueuedArticle(database, queued(guid, index));
    }
    database.close();
    let posts = 0;

    const summary = await runUnwrap(
      { coverageDatabase },
      {
        articles: signing(async () => {
          posts += 1;
          throw createError();
        }),
        log: givenLog().log,
      },
    );

    expect(posts).toBe(1);
    expect(summary).toMatchObject({ retried: 4, skipped: 0, titled: 0 });
    expect(summary.stoppedBy).toBeUndefined();
    expect(readArticle(coverageDatabase, "d").attemptCount).toBe(1);
  });
});
describe("runUnwrap unexpected errors", () => {
  it.each([
    [
      "GET",
      "socket",
      resolving(async () => {
        throw new Error("socket");
      }),
    ],
    [
      "POST",
      "batch",
      signing(async () => {
        throw new Error("batch");
      }),
    ],
  ])(
    "rejects an unexpected %s and releases the lock",
    async (_kind, message, articles) => {
      const { coverageDatabase, database } = givenQueueStore();
      addQueuedArticle(database, queued("g1", 0));
      database.close();

      await expect(
        runUnwrap({ coverageDatabase }, { articles, log: givenLog().log }),
      ).rejects.toThrow(message);
      expect(fileExists(`${coverageDatabase}.unwrap.lock`)).toBe(false);
      expect(readArticle(coverageDatabase, "g1").stage).toBe("unwrap");
    },
  );

  it("takes a lock whose pid is not running", async () => {
    const { coverageDatabase, database, directory } = givenQueueStore();
    addQueuedArticle(database, queued("g1", 0));
    database.close();
    givenFile(directory, "coverage.sqlite.unwrap.lock", "2147483647");

    const summary = await runUnwrap(
      { coverageDatabase },
      {
        articles: resolving(async () => "https://publisher.example/one"),
        log: givenLog().log,
      },
    );

    expect(summary.resolved).toBe(1);
  });
});
