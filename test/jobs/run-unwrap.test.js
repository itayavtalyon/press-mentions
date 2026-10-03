import path from "node:path";

import { describe, expect, it } from "vitest";

import { HttpStatusError } from "../../src/infra/http.js";
import { UnresolvedError } from "../../src/infra/resolver.js";
import { exitCode, runUnwrap } from "../../src/jobs/run-unwrap.js";
import { givenLog, resolving, signing } from "../helpers/fakes.js";
import {
  fileExists,
  givenFile,
  givenTemporaryDirectory,
} from "../helpers/files.js";
import {
  addQueuedArticle,
  givenQueueStore,
  readArticle,
} from "../helpers/queue.js";

const DAY = "2026-08-01T00:00:00.000Z";
const NEXT = "2026-08-02T00:00:00.000Z";

/**
 * @param {(url: string) => Promise<string>} resolve Resolver port.
 * @returns {import("../../src/jobs/run-unwrap.js").UnwrapDependencies} Dependencies with a silent log.
 */
function givenDependencies(resolve) {
  return { articles: resolving(resolve), log: givenLog().log };
}

describe("runUnwrap", () => {
  it("stores the publisher URL and advances that row to fetch", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    addQueuedArticle(database, {
      guid: "g1",
      publishedAt: DAY,
      stage: "unwrap",
      title: "One",
    });
    database.close();

    const summary = await runUnwrap(
      { coverageDatabase },
      givenDependencies(async () => "https://publisher.example/one"),
    );

    expect(readArticle(coverageDatabase, "g1")).toMatchObject({
      attemptCount: 0,
      // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
      lastError: null,
      publisherUrl: "https://publisher.example/one",
      stage: "fetch",
    });
    expect(summary.resolved).toBe(1);
    expect(exitCode(summary)).toBe(0);
  });
});

describe("runUnwrap order", () => {
  it("reads the unwrap stage oldest first and skips other rows", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    addQueuedArticle(database, {
      guid: "later",
      publishedAt: NEXT,
      stage: "unwrap",
    });
    addQueuedArticle(database, {
      guid: "fetch",
      publishedAt: DAY,
      stage: "fetch",
    });
    addQueuedArticle(database, {
      guid: "earlier",
      publishedAt: DAY,
      stage: "unwrap",
    });
    addQueuedArticle(database, {
      guid: "stopped",
      publishedAt: DAY,
      retryable: 0,
      stage: "unwrap",
    });
    database.close();
    /**
     * @type {string[]}
     */
    const urls = [];

    await runUnwrap(
      { coverageDatabase },
      givenDependencies(async (url) => {
        urls.push(url);
        return `https://publisher.example/${url}`;
      }),
    );

    expect(urls).toEqual([
      "https://news.google.com/rss/articles/earlier",
      "https://news.google.com/rss/articles/later",
    ]);
    expect(readArticle(coverageDatabase, "fetch").stage).toBe("fetch");
  });
});

describe("runUnwrap title path", () => {
  it("takes the title path when the article does not resolve", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    addQueuedArticle(database, {
      guid: "g1",
      publishedAt: DAY,
      stage: "unwrap",
      title: "Broken",
    });
    database.close();

    const summary = await runUnwrap(
      { coverageDatabase },
      givenDependencies(async (url) => {
        throw new UnresolvedError(url, "no signature");
      }),
    );

    expect(readArticle(coverageDatabase, "g1")).toMatchObject({
      // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
      lastError: null,
      // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
      publisherUrl: null,
      stage: "classify",
      textSource: "title",
      extractedText: "Broken",
    });
    expect(summary.titled).toBe(1);
    expect(exitCode(summary)).toBe(0);
  });

  it("takes the title path on a non-retryable HTTP status", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    addQueuedArticle(database, {
      guid: "g1",
      publishedAt: DAY,
      stage: "unwrap",
    });
    database.close();
    let calls = 0;

    const summary = await runUnwrap(
      { coverageDatabase },
      givenDependencies(async (url) => {
        calls += 1;
        throw new HttpStatusError(url, 401);
      }),
    );

    expect(calls).toBe(1);
    expect(readArticle(coverageDatabase, "g1").stage).toBe("classify");
    expect(summary.titled).toBe(1);
  });
});

describe("runUnwrap lock", () => {
  it("exits before opening the store when this command's lock is held", async () => {
    const directory = givenTemporaryDirectory();
    const coverageDatabase = path.join(directory, "coverage.sqlite");
    givenFile(directory, "coverage.sqlite.unwrap.lock", String(process.pid));
    /**
     * @type {string[]}
     */
    const urls = [];

    await expect(
      runUnwrap(
        { coverageDatabase },
        givenDependencies(async (url) => {
          urls.push(url);
          return "";
        }),
      ),
    ).rejects.toThrow(`Process ${process.pid} holds`);
    expect(urls).toEqual([]);
    expect(fileExists(coverageDatabase)).toBe(false);
  });

  it("runs while fetch holds its own lock", async () => {
    const { coverageDatabase, database, directory } = givenQueueStore();
    addQueuedArticle(database, {
      guid: "g1",
      publishedAt: DAY,
      stage: "unwrap",
    });
    database.close();
    givenFile(directory, "coverage.sqlite.fetch.lock", String(process.pid));

    const summary = await runUnwrap(
      { coverageDatabase },
      givenDependencies(async () => "https://publisher.example/one"),
    );

    expect(summary.resolved).toBe(1);
    expect(fileExists(`${coverageDatabase}.fetch.lock`)).toBe(true);
    expect(fileExists(`${coverageDatabase}.unwrap.lock`)).toBe(false);
  });
});

describe("runUnwrap batch", () => {
  it("posts every signed article once and titles a page with no signature", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    addQueuedArticle(database, {
      guid: "kept",
      publishedAt: DAY,
      stage: "unwrap",
    });
    addQueuedArticle(database, {
      guid: "bare",
      publishedAt: NEXT,
      stage: "unwrap",
      title: "Bare",
    });
    database.close();
    /**
     * @type {string[][]}
     */
    const posted = [];

    const summary = await runUnwrap(
      { coverageDatabase },
      {
        articles: {
          sign: async (googleUrl) => {
            if (googleUrl.endsWith("/bare")) {
              throw new UnresolvedError(googleUrl, "no signature");
            }
            return {
              articleId: "kept",
              googleUrl,
              signature: "sig",
              timestamp: "1",
            };
          },
          post: async (signed) => {
            posted.push(signed.map((article) => article.googleUrl));
            const [first] = signed;
            return new Map(
              first === undefined
                ? []
                : [[first.googleUrl, "https://publisher.example/kept"]],
            );
          },
        },
        log: givenLog().log,
      },
    );

    expect(posted).toEqual([["https://news.google.com/rss/articles/kept"]]);
    expect(readArticle(coverageDatabase, "kept").stage).toBe("fetch");
    expect(readArticle(coverageDatabase, "bare")).toMatchObject({
      extractedText: "Bare",
      stage: "classify",
      textSource: "title",
    });
    expect(summary).toMatchObject({ resolved: 1, titled: 1 });
  });
});

describe("runUnwrap missing publisher", () => {
  it("titles a signed article when its frame has no publisher URL", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    addQueuedArticle(database, {
      guid: "lost",
      publishedAt: DAY,
      stage: "unwrap",
      title: "Lost",
    });
    database.close();

    const summary = await runUnwrap(
      { coverageDatabase },
      {
        articles: signing(async () => new Map()),
        log: givenLog().log,
      },
    );

    expect(readArticle(coverageDatabase, "lost")).toMatchObject({
      extractedText: "Lost",
      stage: "classify",
      textSource: "title",
    });
    expect(summary.titled).toBe(1);
  });
});
