import { describe, expect, it } from "vitest";

import { givenAcme, readLinks, run, stored } from "../helpers/classify.js";
import { readArticle } from "../helpers/queue.js";

/**
 * @param {number} status HTTP status.
 * @returns {Error} Error with `status_code`.
 */
function httpError(status) {
  const error = new Error(`HTTP ${status}`);
  Object.defineProperty(error, "status_code", { value: status });
  return error;
}

/**
 * @returns {Error} Fetch failure whose cause is connection refused.
 */
function refusedCause() {
  const cause = new Error("connect ECONNREFUSED 127.0.0.1:11434");
  Object.defineProperty(cause, "code", { value: "ECONNREFUSED" });
  const error = new Error("fetch failed");
  Object.defineProperty(error, "cause", { value: cause });
  return error;
}

/**
 * @returns {Error} Aborted because the request timed out.
 */
function timedOut() {
  const error = new Error("The operation was aborted due to timeout");
  Object.defineProperty(error, "name", { value: "TimeoutError" });
  return error;
}

describe("runClassify when the article has no text", () => {
  it("throws and does not call the model", async () => {
    const coverageDatabase = givenAcme({
      // eslint-disable-next-line unicorn/no-null -- Extract never stored this row.
      extractedText: null,
    });
    let calls = 0;

    await expect(
      run(coverageDatabase, async () => {
        calls += 1;
        return "{}";
      }),
    ).rejects.toThrow("extracted_text for g1 is null");
    expect(calls).toBe(0);
  });
});

describe("runClassify unexpected errors", () => {
  it.each([
    ["HTTP 404", httpError(404)],
    ["HTTP 600", httpError(600)],
    ["a plain error", new Error("disk")],
  ])("rejects %s without a retry", async (_label, error) => {
    const coverageDatabase = givenAcme();
    let calls = 0;

    await expect(
      run(coverageDatabase, async () => {
        calls += 1;
        throw error;
      }),
    ).rejects.toThrow(error.message);

    expect(calls).toBe(1);
    expect(readArticle(coverageDatabase, "g1")).toMatchObject({
      attemptCount: 0,
      retryable: 1,
      stage: "classify",
    });
  });

  it("rejects a failure that is not an Error", async () => {
    const coverageDatabase = givenAcme();

    await expect(
      run(coverageDatabase, async () => {
        throw "disk";
      }),
    ).rejects.toBe("disk");
    expect(readArticle(coverageDatabase, "g1").attemptCount).toBe(0);
  });
});

describe("runClassify retries one outage", () => {
  it.each([
    ["HTTP 503", httpError(503)],
    ["a timeout", timedOut()],
    ["a refused connection", refusedCause()],
  ])("stores the verdict after %s", async (_label, error) => {
    const coverageDatabase = givenAcme();
    let calls = 0;

    const { sleeps } = await run(coverageDatabase, async () => {
      calls += 1;
      if (calls === 1) {
        throw error;
      }
      return '{"Acme":"positive"}';
    });

    expect(calls).toBe(2);
    expect(sleeps).toEqual([1000]);
    expect(readLinks(coverageDatabase, "g1")).toEqual([
      stored("acme", "positive", '{"Acme":"positive"}'),
    ]);
    expect(readArticle(coverageDatabase, "g1")).toMatchObject({
      attemptCount: 0,
      // eslint-disable-next-line unicorn/no-null -- A stored verdict clears the error.
      lastError: null,
    });
  });
});
