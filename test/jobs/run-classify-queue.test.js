import path from "node:path";

import { describe, expect, it } from "vitest";

import { runClassify } from "../../src/jobs/run-classify.js";
import {
  article,
  day,
  givenAcme,
  link,
  openStore,
  readLinks,
  run,
} from "../helpers/classify.js";
import { givenClock, givenLog } from "../helpers/fakes.js";
import { fileExists, readText } from "../helpers/files.js";
import { readArticle } from "../helpers/queue.js";

describe("runClassify prompt fields", () => {
  it("omits an empty note and sends a blank publisher", async () => {
    const { coverageDatabase, database } = openStore([
      { descriptor: "", id: "mica", queryName: "Mica" },
      { id: "zeta", queryName: "Zeta" },
    ]);
    article(database, {
      extractedText: "A headline.",
      guid: "g1",
      publishedAt: day(0),
    });
    link(database, "mica", "g1");
    link(database, "zeta", "g1");
    database.close();
    /**
     * @type {import("../../src/core/classifier.js").ClassifierRequest[]}
     */
    const calls = [];

    await run(coverageDatabase, async (request) => {
      calls.push(request);
      return '{"Mica":"unrelated","Zeta":"unranked"}';
    });

    expect(calls[0]?.format.required).toEqual(["Mica", "Zeta"]);
    expect(calls[0]?.prompt).toContain("Publisher: \nHomepage: \n");
    expect(calls[0]?.prompt).not.toContain("\u{2014}");
    expect(calls[0]?.prompt).not.toContain("(seed)");
  });
});

describe("runClassify placeholder-like text", () => {
  it("sends an article containing {{ as written and stores its verdict", async () => {
    const coverageDatabase = givenAcme({
      extractedText: "Acme ships {{ vue }} and {{candidates}}.",
    });
    /**
     * @type {string[]}
     */
    const prompts = [];

    const { summary } = await run(coverageDatabase, async (request) => {
      prompts.push(request.prompt);
      return '{"Acme":"positive"}';
    });

    expect(prompts[0]).toContain("Acme ships {{ vue }} and {{candidates}}.");
    expect(summary.classified).toBe(1);
  });
});

describe("runClassify article order", () => {
  it("classifies the older article first", async () => {
    const { coverageDatabase, database } = openStore([
      { descriptor: "payments company", id: "acme", queryName: "Acme" },
    ]);
    article(database, {
      extractedText: "later",
      guid: "g2",
      publishedAt: day(1),
      publisherHomepage: "https://news.example",
      publisherName: "Example News",
    });
    article(database, {
      extractedText: "earlier",
      guid: "g1",
      publishedAt: day(0),
      publisherHomepage: "https://news.example",
      publisherName: "Example News",
    });
    link(database, "acme", "g1");
    link(database, "acme", "g2");
    database.close();
    /**
     * @type {string[]}
     */
    const texts = [];

    await run(coverageDatabase, async (request) => {
      texts.push(request.prompt.includes("earlier") ? "earlier" : "later");
      return '{"Acme":"positive"}';
    });

    expect(texts).toEqual(["earlier", "later"]);
  });
});

describe("runClassify skips rows that are not an open classify link", () => {
  it("does not call for a closed link, a terminal row, or another stage", async () => {
    const { coverageDatabase, database } = openStore([
      { descriptor: "payments company", id: "acme", queryName: "Acme" },
    ]);
    article(database, {
      extractedText: "closed",
      guid: "closed",
      publishedAt: day(0),
      publisherHomepage: "https://news.example",
      publisherName: "Example News",
    });
    link(database, "acme", "closed", {
      modelId: "qwen3.5:9b",
      promptVersion: "v001",
      rawResponse: "kept",
      verdict: "positive",
    });
    article(database, {
      extractedText: "terminal",
      guid: "terminal",
      publishedAt: day(1),
      publisherHomepage: "https://news.example",
      publisherName: "Example News",
      retryable: 0,
    });
    link(database, "acme", "terminal");
    article(database, {
      extractedText: "extract",
      guid: "extract",
      publishedAt: day(2),
      publisherHomepage: "https://news.example",
      publisherName: "Example News",
      stage: "extract",
    });
    link(database, "acme", "extract");
    database.close();

    const { summary } = await run(coverageDatabase, async () => {
      throw new Error("called");
    });

    expect(summary.remaining).toBe(0);
    expect(readArticle(coverageDatabase, "terminal")).toMatchObject({
      attemptCount: 0,
      retryable: 0,
      stage: "classify",
    });
    expect(readLinks(coverageDatabase, "closed")).toEqual([
      {
        companyId: "acme",
        modelId: "qwen3.5:9b",
        promptVersion: "v001",
        rawResponse: "kept",
        reviewFlag: 0,
        verdict: "positive",
      },
    ]);
  });
});

describe("runClassify and the alerts store", () => {
  it("does not open the alerts database", async () => {
    const { coverageDatabase, database, directory } = openStore([
      { descriptor: "payments company", id: "acme", queryName: "Acme" },
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

    await run(coverageDatabase, async () => '{"Acme":"positive"}');

    expect(fileExists(path.join(directory, "alerts.sqlite"))).toBe(false);
    expect(
      readText(new URL("../../src/jobs/run-classify.js", import.meta.url)),
    ).not.toContain("alerts");
    expect(
      readText(new URL("../../src/jobs/classify.js", import.meta.url)),
    ).not.toContain("alerts");
  });
});

describe("runClassify lock", () => {
  it("names the holder and does not chat when classify is already running", async () => {
    const { coverageDatabase, database } = openStore([
      { descriptor: "payments company", id: "acme", queryName: "Acme" },
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
    const started = Promise.withResolvers();
    const release = Promise.withResolvers();
    const { clock } = givenClock();
    const log = givenLog().log;
    const first = runClassify(
      { coverageDatabase },
      {
        chat: async () => {
          started.resolve("open");
          await release.promise;
          return '{"Acme":"positive"}';
        },
        clock,
        log,
        random: () => 0,
      },
    );
    await started.promise;
    /**
     * @type {string[]}
     */
    const calls = [];

    await expect(
      runClassify(
        { coverageDatabase },
        {
          chat: async () => {
            calls.push("called");
            return '{"Acme":"positive"}';
          },
          clock,
          log,
          random: () => 0,
        },
      ),
    ).rejects.toThrow(/Process \d+ holds .+\.classify\.lock/u);

    expect(calls).toEqual([]);
    release.resolve("done");
    await first;
    expect(fileExists(`${coverageDatabase}.classify.lock`)).toBe(false);
  });
});
