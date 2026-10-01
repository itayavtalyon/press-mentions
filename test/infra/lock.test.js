/* eslint-disable security/detect-non-literal-fs-filename -- These tests touch only paths inside a fresh temp directory. */
import { readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { withLock } from "../../src/infra/lock.js";
import {
  fileExists,
  givenFile,
  givenTemporaryDirectory,
  readText,
} from "../helpers/files.js";

/**
 * Not a running pid on this machine. `kill` reports ESRCH.
 */
const DEAD_PID = "2147483647";

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
    const lock = givenFile(
      givenTemporaryDirectory(),
      "job.lock",
      `${process.pid}\n`,
    );

    await expect(withLock(lock, () => "never")).rejects.toThrow(
      `Process ${process.pid} holds ${lock}`,
    );
  });

  it("refuses a running pid and does not run the work", async () => {
    const lock = givenFile(
      givenTemporaryDirectory(),
      "job.lock",
      String(process.pid),
    );
    let hasRun = false;

    await expect(
      withLock(lock, () => {
        hasRun = true;
      }),
    ).rejects.toThrow(`Process ${process.pid} holds ${lock}`);

    expect(hasRun).toBe(false);
    expect(readText(lock)).toBe(String(process.pid));
  });

  it("treats a pid we cannot signal as still running", async () => {
    const lock = givenFile(givenTemporaryDirectory(), "job.lock", "1");

    await expect(withLock(lock, () => "never")).rejects.toThrow(
      `Process 1 holds ${lock}`,
    );
    expect(readText(lock)).toBe("1");
  });

  it("rethrows a failure other than an existing lock", async () => {
    const lock = path.join(givenTemporaryDirectory(), "missing", "job.lock");

    await expect(withLock(lock, () => "never")).rejects.toThrow("ENOENT");
  });
});

describe("withLock after the holder has exited", () => {
  it("takes a lock whose pid is not running", async () => {
    const lock = givenFile(givenTemporaryDirectory(), "job.lock", DEAD_PID);

    const contents = await withLock(lock, () => readText(lock));

    expect(contents).toBe(String(process.pid));
    expect(fileExists(lock)).toBe(false);
    expect(
      readdirSync(path.dirname(lock)).some(
        (name) => name.endsWith(".stale") || name.endsWith(".claim"),
      ),
    ).toBe(false);
  });

  it("takes a lock whose contents are not a pid", async () => {
    const directory = givenTemporaryDirectory();

    await expect(
      withLock(givenFile(directory, "empty.lock", ""), () => "empty"),
    ).resolves.toBe("empty");
    await expect(
      withLock(givenFile(directory, "text.lock", "nope"), () => "text"),
    ).resolves.toBe("text");
    await expect(
      withLock(givenFile(directory, "zero.lock", "0"), () => "zero"),
    ).resolves.toBe("zero");
    await expect(
      withLock(
        givenFile(directory, "huge.lock", "9999999999999999999"),
        () => "huge",
      ),
    ).resolves.toBe("huge");
  });

  it("removes the lock when the work throws after a stale file was replaced", async () => {
    const lock = givenFile(givenTemporaryDirectory(), "job.lock", DEAD_PID);

    await expect(
      withLock(lock, () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(fileExists(lock)).toBe(false);
  });
});

describe("withLock when two starts recover one stale file", () => {
  it("names the holder when another start already took the stale file", async () => {
    const lock = givenFile(givenTemporaryDirectory(), "job.lock", DEAD_PID);
    let hasRun = false;

    await expect(
      withLock(
        lock,
        () => {
          hasRun = true;
        },
        {
          rename: (from, to) => {
            writeFileSync(from, String(process.pid));
            throw Object.assign(new Error(`lost ${to}`), { code: "ENOENT" });
          },
        },
      ),
    ).rejects.toThrow(`Process ${process.pid} holds ${lock}`);

    expect(hasRun).toBe(false);
    expect(readText(lock)).toBe(String(process.pid));
  });

  it("takes the lock when the stale file was already renamed away", async () => {
    const lock = givenFile(givenTemporaryDirectory(), "job.lock", DEAD_PID);

    const contents = await withLock(lock, () => readText(lock), {
      rename: (from, to) => {
        unlinkSync(from);
        throw Object.assign(new Error(`gone ${to}`), { code: "ENOENT" });
      },
    });

    expect(contents).toBe(String(process.pid));
  });

  it("rethrows a rename failure that names no code", async () => {
    const lock = givenFile(givenTemporaryDirectory(), "job.lock", DEAD_PID);

    await expect(
      withLock(lock, () => "never", {
        rename: () => {
          throw new Error("no code");
        },
      }),
    ).rejects.toThrow("no code");
    expect(readText(lock)).toBe(DEAD_PID);
  });
});

describe("withLock when the stale file cannot be moved", () => {
  it("leaves the stale file when it cannot be renamed", async () => {
    const lock = givenFile(givenTemporaryDirectory(), "job.lock", DEAD_PID);

    await expect(
      withLock(lock, () => "never", {
        rename: (from, to) => {
          throw Object.assign(new Error(`denied ${from} ${to}`), {
            code: "EACCES",
          });
        },
      }),
    ).rejects.toThrow("denied");
    expect(readText(lock)).toBe(DEAD_PID);
  });
});

describe("withLock when the claim cannot be published", () => {
  it("rethrows and leaves no claim file", async () => {
    const directory = givenTemporaryDirectory();
    const lock = path.join(directory, "job.lock");

    await expect(
      withLock(lock, () => "never", {
        link: () => {
          throw Object.assign(new Error("io"), { code: "EIO" });
        },
      }),
    ).rejects.toThrow("io");
    expect(fileExists(lock)).toBe(false);
    expect(readdirSync(directory).some((name) => name.endsWith(".claim"))).toBe(
      false,
    );
  });
});
/* eslint-enable security/detect-non-literal-fs-filename -- End of the temp-directory tests. */
