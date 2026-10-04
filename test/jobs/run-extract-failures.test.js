import { describe, expect, it } from "vitest";

import { exitCode, runExtract } from "../../src/jobs/run-extract.js";
import { givenLog } from "../helpers/fakes.js";
import { fileExists } from "../helpers/files.js";
import {
  addQueuedArticle,
  givenQueueStore,
  readArticle,
} from "../helpers/queue.js";

const DAY = "2026-08-01T00:00:00.000Z";
const NEXT = "2026-08-02T00:00:00.000Z";

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {number} attemptCount Failures already recorded on the first row.
 * @returns {void}
 */
function givenPair(database, attemptCount) {
  addQueuedArticle(database, {
    attemptCount,
    bodyHtml: "<p>Bad</p>",
    guid: "g1",
    publishedAt: DAY,
    publisherUrl: "https://example.com/bad",
    stage: "extract",
  });
  addQueuedArticle(database, {
    bodyHtml: "<p>Next</p>",
    guid: "g2",
    publishedAt: NEXT,
    publisherUrl: "https://example.com/next",
    stage: "extract",
  });
}

/**
 * @param {string} html Stored page.
 * @returns {string} Body text for the next row.
 */
function extractOrThrow(html) {
  if (html === "<p>Bad</p>") {
    throw new Error("parser");
  }
  return "Next";
}

describe("runExtract throw", () => {
  it("marks the failed row and extracts the next one", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    givenPair(database, 0);
    database.close();
    const { events, log } = givenLog();

    const summary = await runExtract(
      { coverageDatabase },
      { extract: extractOrThrow, log },
    );

    expect(readArticle(coverageDatabase, "g1")).toMatchObject({
      attemptCount: 1,
      bodyHtml: "<p>Bad</p>",
      lastError: "Error: parser",
      retryable: 1,
      stage: "extract",
    });
    expect(readArticle(coverageDatabase, "g2")).toMatchObject({
      extractedText: "Next",
      stage: "classify",
      textSource: "body",
    });
    expect(events).toEqual([
      {
        event: "extract.retry",
        fields: {
          error: "Error: parser",
          guid: "g1",
          retryable: 1,
          stage: "extract",
        },
      },
    ]);
    expect(summary).toMatchObject({ extracted: 1, remaining: 1 });
    expect(exitCode(summary)).toBe(1);
    expect(fileExists(`${coverageDatabase}.extract.lock`)).toBe(false);
  });
});

describe("runExtract third failure", () => {
  it("makes the third failure terminal and still extracts the next row", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    givenPair(database, 2);
    database.close();

    const summary = await runExtract(
      { coverageDatabase },
      { extract: extractOrThrow, log: givenLog().log },
    );

    expect(readArticle(coverageDatabase, "g1")).toMatchObject({
      attemptCount: 3,
      lastError: "Error: parser",
      retryable: 0,
      stage: "extract",
    });
    expect(readArticle(coverageDatabase, "g2").stage).toBe("classify");
    expect(summary.remaining).toBe(0);
    expect(exitCode(summary)).toBe(0);
  });
});

describe("runExtract failure moved", () => {
  it("logs a row that moved before the failure was recorded and continues", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    addQueuedArticle(database, {
      bodyHtml: "<p>Late</p>",
      guid: "g1",
      publishedAt: DAY,
      publisherUrl: "https://example.com/one",
      stage: "extract",
    });
    addQueuedArticle(database, {
      bodyHtml: "<p>Next</p>",
      guid: "g2",
      publishedAt: NEXT,
      publisherUrl: "https://example.com/two",
      stage: "extract",
    });
    const { events, log } = givenLog();

    const summary = await runExtract(
      { coverageDatabase },
      {
        extract: (html) => {
          if (html === "<p>Late</p>") {
            database
              .prepare(
                "UPDATE articles SET stage = 'classify' WHERE guid = 'g1'",
              )
              .run();
            throw new Error("parser");
          }
          return "Next";
        },
        log,
      },
    );

    expect(events).toEqual([
      { event: "extract.moved", fields: { guid: "g1", stage: "extract" } },
    ]);
    expect(readArticle(coverageDatabase, "g1")).toMatchObject({
      bodyHtml: "<p>Late</p>",
      // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
      lastError: null,
      stage: "classify",
    });
    expect(readArticle(coverageDatabase, "g2")).toMatchObject({
      extractedText: "Next",
      stage: "classify",
    });
    expect(summary).toMatchObject({ extracted: 1, moved: 1, remaining: 0 });
    database.close();
  });
});
