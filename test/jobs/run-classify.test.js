import { describe, expect, it } from "vitest";

import { LIVE_MODEL, LIVE_PROMPT_VERSION } from "../../src/core/classifier.js";
import { openCoverageStore } from "../../src/infra/coverage-store.js";
import { exitCode } from "../../src/jobs/run-classify.js";
import {
  article,
  day,
  givenAcme,
  link,
  openStore,
  readLinks,
  run,
  stored,
} from "../helpers/classify.js";
import { readArticle } from "../helpers/queue.js";

describe("runClassify", () => {
  it("writes one verdict per open company and stays at classify", async () => {
    const { coverageDatabase, database } = openStore([
      { descriptor: "payments company", id: "acme", queryName: "Acme" },
      { descriptor: "analytics company", id: "zeta", queryName: "Zeta" },
    ]);
    article(database, {
      extractedText: "Acme raised a round.",
      guid: "g1",
      publishedAt: day(0),
      publisherHomepage: "https://news.example",
      publisherName: "Example News",
    });
    link(database, "acme", "g1");
    link(database, "zeta", "g1");
    database
      .prepare(
        "UPDATE articles SET attempt_count = 2, last_error = 'before' WHERE guid = 'g1'",
      )
      .run();
    database.close();
    const reply = '{"Acme":"positive","Zeta":"negative"}';
    /**
     * @type {import("../../src/core/classifier.js").ClassifierRequest[]}
     */
    const calls = [];

    const { summary } = await run(coverageDatabase, async (request) => {
      calls.push(request);
      return reply;
    });

    expect(calls.map((request) => request.format.required)).toEqual([
      ["Acme", "Zeta"],
    ]);
    expect(calls[0]?.model).toBe(LIVE_MODEL);
    expect(calls[0]?.prompt).toContain("namesake");
    expect(calls[0]?.prompt).toContain("Acme \u{2014} payments company");
    expect(calls[0]?.prompt).toContain("Acme raised a round.");
    expect(calls[0]?.prompt).toContain("Example News");
    expect(calls[0]?.prompt).not.toContain("(seed)");
    expect(readLinks(coverageDatabase, "g1")).toEqual([
      stored("acme", "positive", reply),
      stored("zeta", "negative", reply),
    ]);
    expect(readArticle(coverageDatabase, "g1")).toMatchObject({
      attemptCount: 0,
      // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
      lastError: null,
      retryable: 1,
      stage: "classify",
    });
    expect(summary.remaining).toBe(0);
    expect(exitCode(summary)).toBe(0);
  });
});

describe("runClassify when the live pair is already stored", () => {
  it("makes no chat call on the next run", async () => {
    const coverageDatabase = givenAcme();
    let calls = 0;
    const chat = async () => {
      calls += 1;
      return '{"Acme":"positive"}';
    };

    await run(coverageDatabase, chat);
    await run(coverageDatabase, chat);

    expect(calls).toBe(1);
  });
});

describe("runClassify when a stored pair is not live", () => {
  it("calls again and overwrites a different prompt version", async () => {
    const coverageDatabase = givenAcme(
      {},
      {
        modelId: LIVE_MODEL,
        promptVersion: "v000",
        rawResponse: "old",
        verdict: "positive",
      },
    );
    const reply = '{"Acme":"negative"}';
    let calls = 0;

    await run(coverageDatabase, async () => {
      calls += 1;
      return reply;
    });

    expect(calls).toBe(1);
    expect(readLinks(coverageDatabase, "g1")).toEqual([
      stored("acme", "negative", reply),
    ]);
  });

  it("calls again and overwrites a different model", async () => {
    const coverageDatabase = givenAcme(
      {},
      {
        modelId: "gemma4:12b",
        promptVersion: LIVE_PROMPT_VERSION,
        rawResponse: "old",
        verdict: "positive",
      },
    );
    let calls = 0;

    await run(coverageDatabase, async () => {
      calls += 1;
      return '{"Acme":"neutral"}';
    });

    expect(calls).toBe(1);
    expect(readLinks(coverageDatabase, "g1")).toEqual([
      stored("acme", "neutral", '{"Acme":"neutral"}'),
    ]);
  });
});

describe("runClassify when a company is linked later", () => {
  it("sends only that company and keeps the older verdict", async () => {
    const { coverageDatabase, database } = openStore([
      { descriptor: "payments company", id: "acme", queryName: "Acme" },
      { descriptor: "analytics company", id: "zeta", queryName: "Zeta" },
    ]);
    article(database, {
      extractedText: "Body",
      guid: "g1",
      publishedAt: day(0),
      publisherHomepage: "https://news.example",
      publisherName: "Example News",
    });
    link(database, "acme", "g1");
    database.close();
    /**
     * @type {string[][]}
     */
    const names = [];
    /**
     * @type {(request: import("../../src/core/classifier.js").ClassifierRequest) => Promise<string>}
     */
    const chat = async (request) => {
      names.push([...request.format.required]);
      return names.length === 1 ? '{"Acme":"positive"}' : '{"Zeta":"neutral"}';
    };

    await run(coverageDatabase, chat);
    const added = openCoverageStore(coverageDatabase);
    link(added, "zeta", "g1");
    added.close();
    await run(coverageDatabase, chat);

    expect(names).toEqual([["Acme"], ["Zeta"]]);
    expect(readLinks(coverageDatabase, "g1")).toEqual([
      stored("acme", "positive", '{"Acme":"positive"}'),
      stored("zeta", "neutral", '{"Zeta":"neutral"}'),
    ]);
  });
});

describe("runClassify replies", () => {
  it.each(["nope", "[]"])(
    "stores uncertain for %j and does not call again",
    async (reply) => {
      const { coverageDatabase, database } = openStore([
        { descriptor: "payments company", id: "acme", queryName: "Acme" },
        { descriptor: "analytics company", id: "zeta", queryName: "Zeta" },
      ]);
      article(database, {
        extractedText: "Body",
        guid: "g1",
        publishedAt: day(0),
        publisherHomepage: "https://news.example",
        publisherName: "Example News",
      });
      link(database, "acme", "g1");
      link(database, "zeta", "g1");
      database.close();
      let calls = 0;
      const chat = async () => {
        calls += 1;
        return reply;
      };

      const { summary } = await run(coverageDatabase, chat);
      await run(coverageDatabase, chat);

      expect(calls).toBe(1);
      expect(readLinks(coverageDatabase, "g1")).toEqual([
        stored("acme", "uncertain", reply, 1),
        stored("zeta", "uncertain", reply, 1),
      ]);
      expect(summary.remaining).toBe(0);
      expect(exitCode(summary)).toBe(0);
    },
  );
});

describe("runClassify review flag", () => {
  it("stores review flag 0 when the model says uncertain", async () => {
    const coverageDatabase = givenAcme();
    let calls = 0;
    const chat = async () => {
      calls += 1;
      return '{"Acme":"uncertain"}';
    };

    await run(coverageDatabase, chat);
    await run(coverageDatabase, chat);

    expect(calls).toBe(1);
    expect(readLinks(coverageDatabase, "g1")).toEqual([
      stored("acme", "uncertain", '{"Acme":"uncertain"}'),
    ]);
  });

  it("keeps a verdict when another company in the reply is missing", async () => {
    const { coverageDatabase, database } = openStore([
      { descriptor: "payments company", id: "acme", queryName: "Acme" },
      { descriptor: "analytics company", id: "zeta", queryName: "Zeta" },
    ]);
    article(database, {
      extractedText: "Body",
      guid: "g1",
      publishedAt: day(0),
      publisherHomepage: "https://news.example",
      publisherName: "Example News",
    });
    link(database, "acme", "g1");
    link(database, "zeta", "g1");
    database.close();
    const reply = '{"Acme":"positive"}';

    await run(coverageDatabase, async () => reply);

    expect(readLinks(coverageDatabase, "g1")).toEqual([
      stored("acme", "positive", reply),
      stored("zeta", "uncertain", reply),
    ]);
  });
});

describe("exitCode", () => {
  it("is 0 only when no open link remains", () => {
    const clean = {
      classified: 1,
      moved: 0,
      remaining: 0,
      retried: 0,
      skipped: 0,
      terminal: 0,
    };

    expect(exitCode(clean)).toBe(0);
    expect(exitCode({ ...clean, remaining: 2 })).toBe(1);
  });
});
