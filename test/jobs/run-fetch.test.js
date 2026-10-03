import path from "node:path";

import { describe, expect, it } from "vitest";

import { openCoverageStore } from "../../src/infra/coverage-store.js";
import { HttpStatusError } from "../../src/infra/http.js";
import { exitCode, runFetch } from "../../src/jobs/run-fetch.js";
import { givenLog } from "../helpers/fakes.js";
import {
  fileExists,
  givenFile,
  givenTemporaryDirectory,
} from "../helpers/files.js";
import { addQueuedArticle, givenQueueStore } from "../helpers/queue.js";

const DAY = "2026-08-01T00:00:00.000Z";
const NEXT = "2026-08-02T00:00:00.000Z";

/**
 * @param {string} file Coverage store path.
 * @returns {Record<string, unknown>[]} Article rows, oldest guid first.
 */
function articleRows(file) {
  const database = openCoverageStore(file);
  try {
    return /** @type {Record<string, unknown>[]} */ (
      database
        .prepare(
          `SELECT guid, stage, text_source AS textSource, extracted_text AS extractedText,
                body_html AS bodyHtml, attempt_count AS attemptCount, retryable, last_error AS lastError
           FROM articles ORDER BY guid`,
        )
        .all()
    );
  } finally {
    database.close();
  }
}

/**
 * @param {(url: string) => Promise<string>} fetchArticle Fetcher port.
 * @returns {import("../../src/jobs/run-fetch.js").FetchDependencies} Dependencies with a silent log.
 */
function givenDependencies(fetchArticle) {
  return { articles: { fetchArticle }, log: givenLog().log };
}

describe("runFetch", () => {
  it("stores the page and advances that row to extract", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    addQueuedArticle(database, {
      guid: "g1",
      publishedAt: DAY,
      publisherUrl: "https://example.com/one",
      stage: "fetch",
      title: "One",
    });
    database.close();
    /**
     * @type {string[]}
     */
    const calls = [];

    const summary = await runFetch(
      { coverageDatabase },
      givenDependencies(async (url) => {
        calls.push(url);
        return "<p>Hello</p>";
      }),
    );

    expect(calls).toEqual(["https://example.com/one"]);
    expect(articleRows(coverageDatabase)).toEqual([
      {
        attemptCount: 0,
        bodyHtml: "<p>Hello</p>",
        // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
        extractedText: null,
        guid: "g1",
        // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
        lastError: null,
        retryable: 1,
        stage: "extract",
        // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
        textSource: null,
      },
    ]);
    expect(summary.fetched).toBe(1);
    expect(exitCode(summary)).toBe(0);
  });
});

describe("runFetch empty page", () => {
  it("stores an empty 200 and leaves the title decision to extract", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    addQueuedArticle(database, {
      guid: "g1",
      publishedAt: DAY,
      publisherUrl: "https://example.com/empty",
      stage: "fetch",
    });
    database.close();

    await runFetch(
      { coverageDatabase },
      givenDependencies(async () => ""),
    );

    expect(articleRows(coverageDatabase)[0]).toMatchObject({
      bodyHtml: "",
      stage: "extract",
    });
  });
});

describe("runFetch order", () => {
  it("reads the fetch stage oldest first and skips other rows", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    addQueuedArticle(database, {
      guid: "later",
      publishedAt: NEXT,
      publisherUrl: "https://example.com/later",
      stage: "fetch",
    });
    addQueuedArticle(database, {
      guid: "earlier",
      publishedAt: DAY,
      publisherUrl: "https://example.com/earlier",
      stage: "fetch",
    });
    addQueuedArticle(database, {
      guid: "unwrap",
      publishedAt: DAY,
      publisherUrl: "https://example.com/unwrap",
      stage: "unwrap",
    });
    addQueuedArticle(database, {
      guid: "terminal",
      publishedAt: DAY,
      publisherUrl: "https://example.com/terminal",
      retryable: 0,
      stage: "fetch",
    });
    database.close();
    /**
     * @type {string[]}
     */
    const calls = [];

    await runFetch(
      { coverageDatabase },
      givenDependencies(async (url) => {
        calls.push(url);
        return "<p>x</p>";
      }),
    );

    expect(calls).toEqual([
      "https://example.com/earlier",
      "https://example.com/later",
    ]);
  });
});

describe("runFetch title path", () => {
  it.each([401, 402, 404])(
    "takes the title path on HTTP %s without a second request",
    async (status) => {
      const { coverageDatabase, database } = givenQueueStore();
      addQueuedArticle(database, {
        guid: "g1",
        publishedAt: DAY,
        publisherUrl: "https://example.com/closed",
        stage: "fetch",
        title: "Closed",
      });
      database.close();
      let calls = 0;

      const summary = await runFetch(
        { coverageDatabase },
        givenDependencies(async (url) => {
          calls += 1;
          throw new HttpStatusError(url, status);
        }),
      );

      expect(calls).toBe(1);
      expect(articleRows(coverageDatabase)[0]).toMatchObject({
        attemptCount: 0,
        // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
        bodyHtml: null,
        extractedText: "Closed",
        // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
        lastError: null,
        retryable: 1,
        stage: "classify",
        textSource: "title",
      });
      expect(summary.titled).toBe(1);
      expect(exitCode(summary)).toBe(0);
    },
  );
});

describe("runFetch refused URL", () => {
  it("takes the title path for a refused URL and does not request it", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    addQueuedArticle(database, {
      guid: "g1",
      publishedAt: DAY,
      publisherUrl: "not a url",
      stage: "fetch",
      title: "Broken",
    });
    database.close();
    /**
     * @type {string[]}
     */
    const calls = [];

    await runFetch(
      { coverageDatabase },
      givenDependencies(async (url) => {
        calls.push(url);
        const { createArticleFetcher } =
          await import("../../src/infra/article-fetcher.js");
        return createArticleFetcher({
          getText: async (requested) => {
            calls.push(requested);
            return "";
          },
        }).fetchArticle(url);
      }),
    );

    expect(calls).toEqual(["not a url"]);
    expect(articleRows(coverageDatabase)[0]).toMatchObject({
      extractedText: "Broken",
      stage: "classify",
      textSource: "title",
    });
  });
});

describe("runFetch lock", () => {
  it("exits before opening the store when this command's lock is held", async () => {
    const directory = givenTemporaryDirectory();
    const coverageDatabase = path.join(directory, "coverage.sqlite");
    givenFile(directory, "coverage.sqlite.fetch.lock", String(process.pid));
    /**
     * @type {string[]}
     */
    const calls = [];

    await expect(
      runFetch(
        { coverageDatabase },
        givenDependencies(async (url) => {
          calls.push(url);
          return "";
        }),
      ),
    ).rejects.toThrow(`Process ${process.pid} holds`);
    expect(calls).toEqual([]);
    expect(fileExists(coverageDatabase)).toBe(false);
  });

  it("runs while a different command holds its own lock", async () => {
    const { coverageDatabase, database, directory } = givenQueueStore();
    addQueuedArticle(database, {
      guid: "g1",
      publishedAt: DAY,
      publisherUrl: "https://example.com/one",
      stage: "fetch",
    });
    database.close();
    givenFile(directory, "coverage.sqlite.feed.lock", String(process.pid));

    const summary = await runFetch(
      { coverageDatabase },
      givenDependencies(async () => "<p>x</p>"),
    );

    expect(summary.fetched).toBe(1);
    expect(fileExists(`${coverageDatabase}.feed.lock`)).toBe(true);
    expect(fileExists(`${coverageDatabase}.fetch.lock`)).toBe(false);
  });
});
