import path from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { runBackfill } from "../../src/jobs/run-backfill.js";
import {
  fileExists,
  givenFile,
  givenTemporaryDirectory,
} from "../helpers/files.js";

const givenConfig = () => {
  const directory = givenTemporaryDirectory();
  return {
    coverageDatabase: path.join(directory, "coverage.sqlite"),
    seedPath: givenFile(
      directory,
      "companies.txt",
      "Harvey\nLudeo (formerly Edge)",
    ),
    overlayPath: givenFile(directory, "overlay.json", "{}"),
  };
};

/**
 * @param {string} file Coverage store path.
 * @returns {string[]} Company ids in the store.
 */
const storedIds = (file) => {
  const database = new Database(file, { readonly: true });
  try {
    return database
      .prepare("SELECT id FROM companies ORDER BY id")
      .pluck()
      .all()
      .map(String);
  } finally {
    database.close();
  }
};

describe("runBackfill", () => {
  it("syncs the seed into the coverage store", async () => {
    const config = givenConfig();

    await runBackfill(config);

    expect(storedIds(config.coverageDatabase)).toEqual(["harvey", "ludeo"]);
  });

  it("returns the number of companies synced", async () => {
    await expect(runBackfill(givenConfig())).resolves.toBe(2);
  });

  it("releases the job lock when it finishes", async () => {
    const config = givenConfig();

    await runBackfill(config);

    expect(fileExists(`${config.coverageDatabase}.lock`)).toBe(false);
  });

  it("refuses to run while another job holds the lock", async () => {
    const config = givenConfig();
    givenFile(
      path.dirname(config.coverageDatabase),
      "coverage.sqlite.lock",
      "4242",
    );

    await expect(runBackfill(config)).rejects.toThrow("Process 4242 holds");
  });

  it("does not create the store when the seed is invalid", async () => {
    const config = givenConfig();
    givenFile(path.dirname(config.coverageDatabase), "companies.txt", "Wave)");

    await expect(runBackfill(config)).rejects.toThrow('Seed line "Wave)"');
    expect(fileExists(config.coverageDatabase)).toBe(false);
  });
});
