import path from "node:path";

import { describe, expect, it } from "vitest";

import { exitCode, runExtract } from "../../src/jobs/run-extract.js";
import { givenLog } from "../helpers/fakes.js";
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

describe("runExtract", () => {
  it("stores trimmed body text and clears the page", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    addQueuedArticle(database, {
      attemptCount: 2,
      bodyHtml: "<p>  Hello  </p>",
      guid: "g1",
      publishedAt: DAY,
      publisherUrl: "https://example.com/one",
      stage: "extract",
      title: "One",
    });
    database.close();

    const summary = await runExtract(
      { coverageDatabase },
      { extract: () => "  Hello  ", log: givenLog().log },
    );

    expect(readArticle(coverageDatabase, "g1")).toEqual({
      attemptCount: 0,
      // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
      bodyHtml: null,
      extractedText: "Hello",
      guid: "g1",
      // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
      lastError: null,
      publisherUrl: "https://example.com/one",
      retryable: 1,
      stage: "classify",
      textSource: "body",
    });
    expect(summary).toEqual({
      extracted: 1,
      moved: 0,
      remaining: 0,
      titled: 0,
    });
    expect(exitCode(summary)).toBe(0);
  });
});

describe("runExtract title path", () => {
  it.each(["", " \n\t "])(
    "takes the title path when the text is %j and does not retry it",
    async (text) => {
      const { coverageDatabase, database } = givenQueueStore();
      addQueuedArticle(database, {
        attemptCount: 2,
        bodyHtml: "<script>load()</script>",
        guid: "g1",
        publishedAt: DAY,
        publisherUrl: "https://example.com/shell",
        stage: "extract",
        title: "Shell",
      });
      database.close();

      const summary = await runExtract(
        { coverageDatabase },
        { extract: () => text, log: givenLog().log },
      );

      expect(readArticle(coverageDatabase, "g1")).toEqual({
        attemptCount: 0,
        // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
        bodyHtml: null,
        extractedText: "Shell",
        guid: "g1",
        // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
        lastError: null,
        publisherUrl: "https://example.com/shell",
        retryable: 1,
        stage: "classify",
        textSource: "title",
      });
      expect(summary).toEqual({
        extracted: 0,
        moved: 0,
        remaining: 0,
        titled: 1,
      });
      expect(exitCode(summary)).toBe(0);
    },
  );
});

describe("runExtract lock", () => {
  it("exits before opening the store when this command's lock is held", async () => {
    const directory = givenTemporaryDirectory();
    const coverageDatabase = path.join(directory, "coverage.sqlite");
    givenFile(directory, "coverage.sqlite.extract.lock", String(process.pid));
    /**
     * @type {string[]}
     */
    const seen = [];

    await expect(
      runExtract(
        { coverageDatabase },
        {
          extract: (html) => {
            seen.push(html);
            return html;
          },
          log: givenLog().log,
        },
      ),
    ).rejects.toThrow(`Process ${process.pid} holds`);
    expect(seen).toEqual([]);
    expect(fileExists(coverageDatabase)).toBe(false);
  });
});

describe("runExtract beside fetch", () => {
  it("runs while fetch holds its own lock", async () => {
    const { coverageDatabase, database, directory } = givenQueueStore();
    addQueuedArticle(database, {
      bodyHtml: "<p>Go</p>",
      guid: "g1",
      publishedAt: DAY,
      publisherUrl: "https://example.com/one",
      stage: "extract",
    });
    database.close();
    givenFile(directory, "coverage.sqlite.fetch.lock", String(process.pid));

    const summary = await runExtract(
      { coverageDatabase },
      { extract: () => "Go", log: givenLog().log },
    );

    expect(summary.extracted).toBe(1);
    expect(fileExists(`${coverageDatabase}.fetch.lock`)).toBe(true);
    expect(fileExists(`${coverageDatabase}.extract.lock`)).toBe(false);
  });
});

describe("exitCode", () => {
  it("is 1 when a retryable row is still at extract", () => {
    expect(exitCode({ extracted: 0, moved: 0, remaining: 1, titled: 0 })).toBe(
      1,
    );
  });
});
