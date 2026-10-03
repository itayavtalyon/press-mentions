import { describe, expect, it } from "vitest";

import { exitCode } from "../../src/jobs/run-classify.js";
import {
  article,
  day,
  givenAcme,
  givenMany,
  link,
  openStore,
  readLinks,
  run,
  stored,
} from "../helpers/classify.js";
import { givenLog } from "../helpers/fakes.js";
import { readArticle } from "../helpers/queue.js";

/**
 * @returns {Error} Connection refused on the error itself.
 */
function refused() {
  const error = new Error("connect ECONNREFUSED 127.0.0.1:11434");
  Object.defineProperty(error, "code", { value: "ECONNREFUSED" });
  return error;
}

describe("runClassify when Ollama is down", () => {
  it("leaves the row retryable after the attempts are exhausted", async () => {
    const coverageDatabase = givenAcme();
    let calls = 0;

    const { sleeps, summary } = await run(coverageDatabase, async () => {
      calls += 1;
      throw refused();
    });

    expect(calls).toBe(5);
    expect(sleeps).toEqual([1000, 2000, 4000, 8000]);
    expect(readArticle(coverageDatabase, "g1")).toMatchObject({
      attemptCount: 1,
      lastError: expect.stringContaining("ECONNREFUSED"),
      retryable: 1,
      stage: "classify",
    });
    expect(summary.retried).toBe(1);
    expect(summary.remaining).toBe(1);
    expect(exitCode(summary)).toBe(1);
  });
});

describe("runClassify third exhaustion", () => {
  it("makes the third exhausted run terminal and a later run skips it", async () => {
    const coverageDatabase = givenAcme({ attemptCount: 2 });
    let calls = 0;

    const third = await run(coverageDatabase, async () => {
      calls += 1;
      throw refused();
    });

    expect(readArticle(coverageDatabase, "g1")).toMatchObject({
      attemptCount: 3,
      retryable: 0,
      stage: "classify",
    });
    expect(third.summary.terminal).toBe(1);
    expect(exitCode(third.summary)).toBe(0);
    await run(coverageDatabase, async () => {
      calls += 1;
      throw refused();
    });
    expect(calls).toBe(5);
  });
});

describe("runClassify when Ollama keeps failing", () => {
  it("stops after three exhausted articles and leaves the rest unchanged", async () => {
    const coverageDatabase = givenMany(4);
    let calls = 0;
    const { events, log } = givenLog();

    const { summary } = await run(
      coverageDatabase,
      async () => {
        calls += 1;
        throw refused();
      },
      log,
    );

    expect(calls).toBe(15);
    expect(events).toContainEqual({
      event: "classify.stopped",
      fields: { dependency: "ollama", stage: "classify" },
    });
    expect(summary.retried).toBe(3);
    expect(summary.skipped).toBe(1);
    expect(summary.remaining).toBe(4);
    expect(exitCode(summary)).toBe(1);
    expect(readArticle(coverageDatabase, "g3")).toMatchObject({
      attemptCount: 0,
      retryable: 1,
      stage: "classify",
    });
    expect(readLinks(coverageDatabase, "g3")).toEqual([
      {
        companyId: "acme",
        // eslint-disable-next-line unicorn/no-null -- The link was never classified.
        modelId: null,
        // eslint-disable-next-line unicorn/no-null -- The link was never classified.
        promptVersion: null,
        // eslint-disable-next-line unicorn/no-null -- The link was never classified.
        rawResponse: null,
        reviewFlag: 0,
        // eslint-disable-next-line unicorn/no-null -- The link was never classified.
        verdict: null,
      },
    ]);
  });
});

describe("runClassify stop count", () => {
  it("resets the stop count after a stored verdict", async () => {
    const coverageDatabase = givenMany(6);
    /**
     * @type {string[]}
     */
    const seen = [];
    const { events, log } = givenLog();

    await run(
      coverageDatabase,
      async (request) => {
        const guid = /BODY-(g\d)-END/u.exec(request.prompt)?.[1] ?? "";
        seen.push(guid);
        if (guid === "g1") {
          return '{"Acme":"positive"}';
        }
        throw refused();
      },
      log,
    );

    expect(seen.filter((guid) => guid === "g5")).toEqual([]);
    expect(seen.filter((guid) => guid === "g1")).toHaveLength(1);
    expect(seen.filter((guid) => guid === "g4")).toHaveLength(5);
    expect(events).toContainEqual({
      event: "classify.stopped",
      fields: { dependency: "ollama", stage: "classify" },
    });
    expect(readLinks(coverageDatabase, "g1")).toEqual([
      stored("acme", "positive", '{"Acme":"positive"}'),
    ]);
    expect(readArticle(coverageDatabase, "g5")).toMatchObject({
      attemptCount: 0,
      retryable: 1,
    });
    expect(readArticle(coverageDatabase, "g0")).toMatchObject({
      attemptCount: 1,
      retryable: 1,
    });
  });
});

describe("runClassify when the row leaves classify", () => {
  it("logs the guid and leaves the row where it went", async () => {
    const { coverageDatabase, database } = openStore([
      { descriptor: "payments company", id: "acme", queryName: "Acme" },
    ]);
    article(database, {
      extractedText: "saved-body",
      guid: "saved",
      publishedAt: day(0),
      publisherHomepage: "https://news.example",
      publisherName: "Example News",
    });
    article(database, {
      extractedText: "failed-body",
      guid: "failed",
      publishedAt: day(1),
      publisherHomepage: "https://news.example",
      publisherName: "Example News",
    });
    link(database, "acme", "saved");
    link(database, "acme", "failed");
    const { events, log } = givenLog();

    await run(
      coverageDatabase,
      async (request) => {
        const guid = request.prompt.includes("failed-body")
          ? "failed"
          : "saved";
        database
          .prepare("UPDATE articles SET stage = 'fetch' WHERE guid = ?")
          .run(guid);
        if (guid === "failed") {
          throw refused();
        }
        return '{"Acme":"positive"}';
      },
      log,
    );

    expect(events).toEqual([
      { event: "classify.moved", fields: { guid: "saved", stage: "classify" } },
      {
        event: "classify.moved",
        fields: { guid: "failed", stage: "classify" },
      },
    ]);
    expect(readArticle(coverageDatabase, "saved").stage).toBe("fetch");
    expect(readArticle(coverageDatabase, "failed").stage).toBe("fetch");
    expect(readLinks(coverageDatabase, "saved")[0]).toMatchObject({
      // eslint-disable-next-line unicorn/no-null -- The verdict was not written.
      verdict: null,
    });
    database.close();
  });
});
