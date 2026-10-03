import path from "node:path";

import { describe, expect, it } from "vitest";

import { openCoverageStore } from "../../src/infra/coverage-store.js";
import { exitCode, runExtract } from "../../src/jobs/run-extract.js";
import { givenLog } from "../helpers/fakes.js";
import {
  fileExists,
  givenFile,
  givenTemporaryDirectory,
} from "../helpers/files.js";
import { addQueuedArticle } from "../helpers/queue.js";

const DAY = "2026-08-01T00:00:00.000Z";

/**
 * @returns {{ coverageDatabase: string, database: import("better-sqlite3").Database, directory: string }}
 *   A store the test closes before the job opens it.
 */
function givenStore() {
  const directory = givenTemporaryDirectory();
  const coverageDatabase = path.join(directory, "coverage.sqlite");
  return {
    coverageDatabase,
    database: openCoverageStore(coverageDatabase),
    directory,
  };
}

/**
 * @param {string} file Coverage store path.
 * @param {string} guid Article id.
 * @returns {Record<string, unknown>} That article.
 */
function articleRow(file, guid) {
  const database = openCoverageStore(file);
  try {
    const row = database
      .prepare(
        `SELECT guid, stage, text_source AS textSource, extracted_text AS extractedText,
                body_html AS bodyHtml, attempt_count AS attemptCount
           FROM articles WHERE guid = ?`,
      )
      .get(guid);
    if (row === undefined) {
      throw new Error(`missing article ${guid}`);
    }
    return /** @type {Record<string, unknown>} */ (row);
  } finally {
    database.close();
  }
}

describe("runExtract", () => {
  it("stores trimmed body text and clears the page", async () => {
    const { coverageDatabase, database } = givenStore();
    addQueuedArticle(database, {
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

    expect(articleRow(coverageDatabase, "g1")).toEqual({
      attemptCount: 0,
      // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
      bodyHtml: null,
      extractedText: "Hello",
      guid: "g1",
      stage: "classify",
      textSource: "body",
    });
    expect(summary.extracted).toBe(1);
    expect(exitCode(summary)).toBe(0);
  });
});

describe("runExtract title path", () => {
  it.each(["", " \n\t "])(
    "takes the title path when the text is %j",
    async (text) => {
      const { coverageDatabase, database } = givenStore();
      addQueuedArticle(database, {
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

      expect(articleRow(coverageDatabase, "g1")).toMatchObject({
        // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
        bodyHtml: null,
        extractedText: "Shell",
        stage: "classify",
        textSource: "title",
      });
      expect(summary.titled).toBe(1);
    },
  );
});

describe("runExtract queue", () => {
  it("reads only the extract stage", async () => {
    const { coverageDatabase, database } = givenStore();
    addQueuedArticle(database, {
      bodyHtml: "<p>Stay</p>",
      guid: "fetch",
      publishedAt: DAY,
      publisherUrl: "https://example.com/fetch",
      stage: "fetch",
    });
    addQueuedArticle(database, {
      bodyHtml: "<p>Go</p>",
      guid: "extract",
      publishedAt: DAY,
      publisherUrl: "https://example.com/extract",
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

    expect(seen).toEqual(["<p>Go</p>"]);
    expect(articleRow(coverageDatabase, "fetch").stage).toBe("fetch");
  });
});

describe("runExtract moved row", () => {
  it("logs a row that already moved and leaves it there", async () => {
    const { coverageDatabase, database } = givenStore();
    addQueuedArticle(database, {
      bodyHtml: "<p>Late</p>",
      guid: "g1",
      publishedAt: DAY,
      publisherUrl: "https://example.com/one",
      stage: "extract",
    });
    const { log, events } = givenLog();

    await runExtract(
      { coverageDatabase },
      {
        extract: (html) => {
          database
            .prepare("UPDATE articles SET stage = 'classify' WHERE guid = 'g1'")
            .run();
          return html;
        },
        log,
      },
    );

    expect(events).toEqual([
      { event: "extract.moved", fields: { guid: "g1", stage: "extract" } },
    ]);
    expect(articleRow(coverageDatabase, "g1").stage).toBe("classify");
    database.close();
  });
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
    const { coverageDatabase, database, directory } = givenStore();
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

describe("runExtract throw", () => {
  it("releases the lock when extract throws", async () => {
    const { coverageDatabase, database } = givenStore();
    addQueuedArticle(database, {
      bodyHtml: "<p>Go</p>",
      guid: "g1",
      publishedAt: DAY,
      publisherUrl: "https://example.com/one",
      stage: "extract",
    });
    database.close();

    await expect(
      runExtract(
        { coverageDatabase },
        {
          extract: () => {
            throw new Error("parser");
          },
          log: givenLog().log,
        },
      ),
    ).rejects.toThrow("parser");
    expect(fileExists(`${coverageDatabase}.extract.lock`)).toBe(false);
    expect(articleRow(coverageDatabase, "g1").stage).toBe("extract");
  });
});

describe("exitCode", () => {
  it("is 1 when a retryable row is still at extract", () => {
    expect(exitCode({ extracted: 0, moved: 0, remaining: 1, titled: 0 })).toBe(
      1,
    );
  });
});
