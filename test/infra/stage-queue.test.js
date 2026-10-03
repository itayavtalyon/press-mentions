import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import {
  openCoverageStore,
  syncCompanies,
} from "../../src/infra/coverage-store.js";
import {
  articlesAtStage,
  articlesRemaining,
  articlesToClassify,
  leaveForRetry,
  saveBodyHtml,
  saveExtractedText,
  savePublisherUrl,
  saveTerminal,
  saveTitlePath,
} from "../../src/infra/stage-queue.js";
import { givenTemporaryDirectory } from "../helpers/files.js";

const HARVEY = {
  aliases: [],
  descriptor: undefined,
  displayName: "Harvey",
  id: "harvey",
  queryName: "Harvey",
  queryTerms: [],
};

/**
 * @returns {import("better-sqlite3").Database} Store with Harvey and two queued articles.
 */
function givenQueued() {
  const database = openCoverageStore(
    path.join(givenTemporaryDirectory(), "coverage.sqlite"),
  );
  onTestFinished(() => {
    database.close();
  });
  syncCompanies(database, [HARVEY]);
  database
    .prepare(
      `INSERT INTO articles (guid, title, published_at, google_url, stage)
       VALUES ('g2', 'Later', '2026-08-02T00:00:00.000Z', 'https://g/2', 'unwrap'),
              ('g1', 'Earlier', '2026-08-01T00:00:00.000Z', 'https://g/1', 'unwrap')`,
    )
    .run();

  return database;
}

describe("stage queue reads", () => {
  it("reads only retryable rows at that stage, oldest first", () => {
    const database = givenQueued();
    database
      .prepare("UPDATE articles SET retryable = 0 WHERE guid = 'g2'")
      .run();

    expect(articlesAtStage(database, "unwrap")).toEqual([
      {
        attemptCount: 0,
        bodyHtml: "",
        googleUrl: "https://g/1",
        guid: "g1",
        publisherUrl: "",
        title: "Earlier",
      },
    ]);
    expect(articlesRemaining(database, "unwrap")).toBe(1);
    expect(articlesAtStage(database, "fetch")).toEqual([]);
  });
});

describe("stage queue writes", () => {
  it("advances unwrap to fetch, then fetch to extract", () => {
    const database = givenQueued();

    savePublisherUrl(database, "g1", "https://news.example/a");
    saveBodyHtml(database, "g1", "<p>Body</p>");

    expect(articlesAtStage(database, "extract")).toEqual([
      {
        attemptCount: 0,
        bodyHtml: "<p>Body</p>",
        googleUrl: "https://g/1",
        guid: "g1",
        publisherUrl: "https://news.example/a",
        title: "Earlier",
      },
    ]);
    expect(articlesRemaining(database, "unwrap")).toBe(1);
  });

  it("takes the title path and stores body text on the classify stage", () => {
    const database = givenQueued();
    savePublisherUrl(database, "g1", "https://news.example/a");
    saveBodyHtml(database, "g1", "<p>Body</p>");
    savePublisherUrl(database, "g2", "https://news.example/b");
    saveBodyHtml(database, "g2", "<p>Other</p>");

    saveTitlePath(database, "g1", "extract");
    saveExtractedText(database, "g2", "The story");

    expect(
      database
        .prepare(
          "SELECT guid, text_source, extracted_text, stage, body_html FROM articles ORDER BY guid",
        )
        .all(),
    ).toEqual([
      {
        guid: "g1",
        text_source: "title",
        extracted_text: "Earlier",
        stage: "classify",
        // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
        body_html: null,
      },
      {
        guid: "g2",
        text_source: "body",
        extracted_text: "The story",
        stage: "classify",
        // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
        body_html: null,
      },
    ]);
  });
});

describe("stage queue failures", () => {
  it("stays retryable until the third exhausted run", () => {
    const database = givenQueued();

    expect(
      leaveForRetry(
        database,
        { attemptCount: 0, guid: "g1", stage: "unwrap" },
        "once",
      ),
    ).toBe(1);
    expect(
      leaveForRetry(
        database,
        { attemptCount: 2, guid: "g1", stage: "unwrap" },
        "third",
      ),
    ).toBe(0);
    expect(articlesRemaining(database, "unwrap")).toBe(1);
  });

  it("marks a terminal failure without leaving the stage", () => {
    const database = givenQueued();

    saveTerminal(database, "g1", "unwrap", "nope");

    expect(
      database
        .prepare(
          "SELECT stage, retryable, last_error FROM articles WHERE guid = 'g1'",
        )
        .get(),
    ).toEqual({
      stage: "unwrap",
      retryable: 0,
      last_error: "nope",
    });
  });
});

describe("stage queue classify retry", () => {
  it("retries a classify row without leaving the stage", () => {
    const database = givenQueued();
    database
      .prepare("UPDATE articles SET stage = 'classify' WHERE guid = 'g1'")
      .run();

    expect(
      leaveForRetry(
        database,
        { attemptCount: 2, guid: "g1", stage: "classify" },
        "ollama",
      ),
    ).toBe(0);
    expect(
      database
        .prepare(
          "SELECT stage, retryable, attempt_count FROM articles WHERE guid = 'g1'",
        )
        .get(),
    ).toEqual({ attempt_count: 3, retryable: 0, stage: "classify" });
  });

  it("throws when a queued row is not an article", () => {
    const standIn = {
      prepare: () => ({
        all: () => [0],
      }),
    };
    // Checked: the stand-in only implements prepare().all(), which is the call under test.
    const database = /** @type {import("better-sqlite3").Database} */ (
      /** @type {unknown} */ (standIn)
    );

    expect(() => articlesAtStage(database, "unwrap")).toThrow(
      "article row is missing",
    );
    expect(() => articlesToClassify(database, "qwen3.5:9b", "v001")).toThrow(
      "article row is missing",
    );
  });
});

describe("stage queue when the row is not at this stage", () => {
  it("changes nothing when the article is missing", () => {
    const database = givenQueued();

    expect(
      savePublisherUrl(database, "missing", "https://news.example/a"),
    ).toBe(0);
  });

  it("leaves a row that has already left this stage", () => {
    const database = givenQueued();
    savePublisherUrl(database, "g1", "https://news.example/a");

    expect(savePublisherUrl(database, "g1", "https://news.example/other")).toBe(
      0,
    );
    expect(
      database
        .prepare("SELECT stage, publisher_url FROM articles WHERE guid = 'g1'")
        .get(),
    ).toEqual({
      publisher_url: "https://news.example/a",
      stage: "fetch",
    });
  });

  it("does not record a retry against a row that has already moved", () => {
    const database = givenQueued();
    savePublisherUrl(database, "g1", "https://news.example/a");

    expect(
      leaveForRetry(
        database,
        { attemptCount: 0, guid: "g1", stage: "unwrap" },
        "late",
      ),
    ).toBeNull();
    expect(
      database
        .prepare("SELECT stage, attempt_count FROM articles WHERE guid = 'g1'")
        .get(),
    ).toEqual({ attempt_count: 0, stage: "fetch" });
  });
});
