import { describe, expect, it } from "vitest";

import { runExtract } from "../../src/jobs/run-extract.js";
import { givenLog } from "../helpers/fakes.js";
import {
  addQueuedArticle,
  givenQueueStore,
  readArticle,
} from "../helpers/queue.js";

const DAY = "2026-08-01T00:00:00.000Z";
const NEXT = "2026-08-02T00:00:00.000Z";

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {string} guid Article id.
 * @param {"unwrap" | "fetch" | "extract" | "classify"} stage Queue stage.
 * @param {number} [retryable] Defaults to 1.
 * @returns {void}
 */
function givenStageRow(database, guid, stage, retryable = 1) {
  addQueuedArticle(database, {
    bodyHtml: `<p>${guid}</p>`,
    guid,
    publishedAt: DAY,
    publisherUrl: `https://example.com/${guid}`,
    retryable,
    stage,
  });
}

describe("runExtract order", () => {
  it("reads the extract stage oldest first", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    addQueuedArticle(database, {
      bodyHtml: "<p>Later</p>",
      guid: "later",
      publishedAt: NEXT,
      publisherUrl: "https://example.com/later",
      stage: "extract",
    });
    addQueuedArticle(database, {
      bodyHtml: "<p>Earlier</p>",
      guid: "earlier",
      publishedAt: DAY,
      publisherUrl: "https://example.com/earlier",
      stage: "extract",
    });
    database.close();
    /**
     * @type {string[]}
     */
    const seen = [];

    await runExtract(
      { coverageDatabase },
      {
        extract: (html) => {
          seen.push(html);
          return "Go";
        },
        log: givenLog().log,
      },
    );

    expect(seen).toEqual(["<p>Earlier</p>", "<p>Later</p>"]);
  });
});

describe("runExtract queue", () => {
  it("does not read unwrap, fetch, classify, or a terminal extract row", async () => {
    const { coverageDatabase, database } = givenQueueStore();
    givenStageRow(database, "unwrap", "unwrap");
    givenStageRow(database, "fetch", "fetch");
    givenStageRow(database, "classify", "classify");
    givenStageRow(database, "terminal", "extract", 0);
    givenStageRow(database, "extract", "extract");
    database.close();
    /**
     * @type {string[]}
     */
    const seen = [];

    await runExtract(
      { coverageDatabase },
      {
        extract: (html) => {
          seen.push(html);
          return "Go";
        },
        log: givenLog().log,
      },
    );

    expect(seen).toEqual(["<p>extract</p>"]);
    expect(readArticle(coverageDatabase, "unwrap").stage).toBe("unwrap");
    expect(readArticle(coverageDatabase, "fetch").stage).toBe("fetch");
    expect(readArticle(coverageDatabase, "classify").stage).toBe("classify");
    expect(readArticle(coverageDatabase, "terminal")).toMatchObject({
      retryable: 0,
      stage: "extract",
    });
  });
});

describe("runExtract moved row", () => {
  it("logs a row that already moved, leaves it, and continues", async () => {
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
    const { log, events } = givenLog();

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
      stage: "classify",
    });
    expect(readArticle(coverageDatabase, "g2")).toMatchObject({
      attemptCount: 0,
      // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
      bodyHtml: null,
      extractedText: "Next",
      stage: "classify",
      textSource: "body",
    });
    expect(summary).toMatchObject({ extracted: 1, moved: 1, remaining: 0 });
    database.close();
  });
});
