import path from "node:path";

import { describe, expect, it } from "vitest";

import { withLock } from "../../src/infra/lock.js";
import {
  fileExists,
  givenFile,
  givenTemporaryDirectory,
  readText,
} from "../helpers/files.js";

describe("withLock", () => {
  it("returns what the work returned", async () => {
    const lock = path.join(givenTemporaryDirectory(), "job.lock");

    await expect(withLock(lock, () => 42)).resolves.toBe(42);
  });

  it("holds a lock file with this process id while the work runs", async () => {
    const lock = path.join(givenTemporaryDirectory(), "job.lock");

    const contents = await withLock(lock, () => readText(lock));

    expect(contents).toBe(String(process.pid));
  });

  it("removes the lock file after the work resolves", async () => {
    const lock = path.join(givenTemporaryDirectory(), "job.lock");

    await withLock(lock, () => "done");

    expect(fileExists(lock)).toBe(false);
  });

  it("removes the lock file after the work throws, and rethrows", async () => {
    const lock = path.join(givenTemporaryDirectory(), "job.lock");

    await expect(
      withLock(lock, () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(fileExists(lock)).toBe(false);
  });
});

describe("withLock while another job holds the lock", () => {
  it("names the holder without the trailing newline a shell leaves", async () => {
    const lock = givenFile(givenTemporaryDirectory(), "job.lock", "4242\n");

    await expect(withLock(lock, () => "never")).rejects.toThrow(
      `Process 4242 holds ${lock}.`,
    );
  });

  it("refuses, naming the holder", async () => {
    const lock = givenFile(givenTemporaryDirectory(), "job.lock", "4242");

    await expect(withLock(lock, () => "never")).rejects.toThrow(
      `Process 4242 holds ${lock}. If no job is running, delete that file`,
    );
  });

  it("leaves the other job's lock file in place", async () => {
    const lock = givenFile(givenTemporaryDirectory(), "job.lock", "4242");

    await expect(withLock(lock, () => "never")).rejects.toThrow("holds");

    expect(readText(lock)).toBe("4242");
  });

  it("does not run the work", async () => {
    const lock = givenFile(givenTemporaryDirectory(), "job.lock", "4242");
    let hasRun = false;

    await expect(
      withLock(lock, () => {
        hasRun = true;
      }),
    ).rejects.toThrow("holds");

    expect(hasRun).toBe(false);
  });

  it("rethrows a failure other than an existing lock", async () => {
    const lock = path.join(givenTemporaryDirectory(), "missing", "job.lock");

    await expect(withLock(lock, () => "never")).rejects.toThrow("ENOENT");
  });
});
