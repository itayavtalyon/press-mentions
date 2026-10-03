import { describe, expect, it } from "vitest";

import { BatchError } from "../../src/infra/resolver.js";
import { runUnwrap } from "../../src/jobs/run-unwrap.js";
import { givenLog, signing } from "../helpers/fakes.js";
import {
  addQueuedArticle,
  givenQueueStore,
  readArticle,
} from "../helpers/queue.js";

const DAY = "2026-08-01T00:00:00.000Z";
const PUBLISHER = "https://publisher.example/story";

/**
 * @param {number} count How many unwrap rows to insert.
 * @returns {string} Coverage database path. The store is closed.
 */
function givenUnwrapRows(count) {
  const { coverageDatabase, database } = givenQueueStore();
  for (let index = 0; index < count; index += 1) {
    addQueuedArticle(database, {
      guid: String(index),
      publishedAt: new Date(Date.parse(DAY) + index * 86_400_000).toISOString(),
      stage: "unwrap",
    });
  }
  database.close();
  return coverageDatabase;
}

/**
 * @param {readonly import("../../src/infra/resolver.js").SignedArticle[]} signed Articles in this POST.
 * @returns {Promise<Map<string, string>>} One publisher URL per Google URL.
 */
async function publisherUrls(signed) {
  return new Map(signed.map((article) => [article.googleUrl, PUBLISHER]));
}

/**
 * @param {number} count Rows at stage unwrap.
 * @param {(signed: readonly import("../../src/infra/resolver.js").SignedArticle[]) => Promise<Map<string, string>>} post POST fake.
 * @returns {Promise<{ coverageDatabase: string, posted: number[], summary: Awaited<ReturnType<typeof runUnwrap>> }>} Lengths and the run summary.
 */
async function postedRun(count, post) {
  const coverageDatabase = givenUnwrapRows(count);
  /**
   * @type {number[]}
   */
  const posted = [];
  const summary = await runUnwrap(
    { coverageDatabase },
    {
      articles: signing(async (signed) => {
        posted.push(signed.length);
        return post(signed);
      }),
      log: givenLog().log,
    },
  );
  return { coverageDatabase, posted, summary };
}

describe("runUnwrap post batches", () => {
  it("posts a full batch once and does not post an empty remainder", async () => {
    const { posted, summary } = await postedRun(20, publisherUrls);
    expect(posted).toEqual([20]);
    expect(summary.resolved).toBe(20);
  });

  it("posts every 20 signed articles, then the remainder", async () => {
    const { posted, summary } = await postedRun(21, publisherUrls);
    expect(posted).toEqual([20, 1]);
    expect(summary.resolved).toBe(21);
  });

  it("retries only the batch whose POST failed and still posts the next one", async () => {
    let calls = 0;
    const { coverageDatabase, summary } = await postedRun(
      21,
      async (signed) => {
        calls += 1;
        if (calls === 1) {
          throw new BatchError();
        }
        return publisherUrls(signed);
      },
    );
    expect(calls).toBe(2);
    expect(summary).toMatchObject({ resolved: 1, retried: 20, titled: 0 });
    expect(readArticle(coverageDatabase, "0")).toMatchObject({
      attemptCount: 1,
      stage: "unwrap",
    });
    expect(readArticle(coverageDatabase, "20").stage).toBe("fetch");
  });
});
