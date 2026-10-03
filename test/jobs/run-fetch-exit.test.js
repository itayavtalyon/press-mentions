import { describe, expect, it } from "vitest";

import { exitCode } from "../../src/jobs/run-fetch.js";

describe("exitCode", () => {
  const clean = {
    fetched: 0,
    moved: 0,
    remaining: 0,
    retried: 0,
    skipped: 0,
    stoppedHosts: [],
    terminal: 0,
    titled: 0,
  };

  it("is 0 when nothing at fetch is still retryable", () => {
    expect(exitCode(clean)).toBe(0);
  });

  it("is 1 when a retryable row is still at fetch", () => {
    expect(exitCode({ ...clean, remaining: 2 })).toBe(1);
  });
});
