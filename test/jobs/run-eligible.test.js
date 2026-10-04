import path from "node:path";

import { describe, expect, it } from "vitest";

import { isRecord } from "../../src/core/common.js";
import { openCoverageStore } from "../../src/infra/coverage-store.js";
import { runEligible } from "../../src/jobs/run-eligible.js";
import { addCompany, addMention } from "../helpers/coverage.js";
import {
  fileExists,
  givenFile,
  givenTemporaryDirectory,
} from "../helpers/files.js";

const PUBLISHED_AT = "2026-10-04T12:00:00.000Z";

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {string} guid Article id.
 * @param {string | undefined} verdict Stored verdict.
 * @param {"backfill" | "daily"} origin How the row was collected.
 * @returns {void}
 */
function link(database, guid, verdict, origin) {
  addMention(database, {
    companyId: "acme",
    guid,
    publishedAt: PUBLISHED_AT,
    title: guid,
    verdict,
  });
  database
    .prepare("UPDATE company_articles SET origin = ? WHERE guid = ?")
    .run(origin, guid);
}

/**
 * @param {string} coverageDatabase Coverage file.
 * @returns {Record<string, unknown>[]} Links in guid order.
 */
function links(coverageDatabase) {
  const database = openCoverageStore(coverageDatabase);
  try {
    return database
      .prepare(
        "SELECT guid, origin, verdict, alert_eligible FROM company_articles ORDER BY guid",
      )
      .all()
      .map((row) => {
        if (!isRecord(row)) {
          throw new Error("SQLite row was not an object");
        }
        return row;
      });
  } finally {
    database.close();
  }
}

/**
 * @returns {{ coverageDatabase: string, directory: string }} A store with one company.
 */
function givenCoverage() {
  const directory = givenTemporaryDirectory();
  const coverageDatabase = path.join(directory, "coverage.sqlite");
  const database = openCoverageStore(coverageDatabase);
  addCompany(database, { displayName: "Acme", id: "acme" });
  database.close();
  return { coverageDatabase, directory };
}

describe("runEligible marks", () => {
  it("marks daily mentions whose verdict can alert and leaves the rest", async () => {
    const { coverageDatabase, directory } = givenCoverage();
    const database = openCoverageStore(coverageDatabase);
    link(database, "pos", "positive", "daily");
    link(database, "neg", "negative", "daily");
    link(database, "neu", "neutral", "daily");
    link(database, "unr", "unranked", "daily");
    link(database, "hide", "unrelated", "daily");
    link(database, "flag", "uncertain", "daily");
    link(database, "open", undefined, "daily");
    link(database, "old", "positive", "backfill");
    database.close();

    await expect(runEligible({ coverageDatabase })).resolves.toEqual({
      marked: 4,
    });

    expect(fileExists(path.join(directory, "alerts.sqlite"))).toBe(false);
    expect(links(coverageDatabase)).toEqual([
      {
        alert_eligible: 0,
        guid: "flag",
        origin: "daily",
        verdict: "uncertain",
      },
      {
        alert_eligible: 0,
        guid: "hide",
        origin: "daily",
        verdict: "unrelated",
      },
      { alert_eligible: 1, guid: "neg", origin: "daily", verdict: "negative" },
      { alert_eligible: 1, guid: "neu", origin: "daily", verdict: "neutral" },
      {
        alert_eligible: 0,
        guid: "old",
        origin: "backfill",
        verdict: "positive",
      },
      {
        alert_eligible: 0,
        guid: "open",
        origin: "daily",
        // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
        verdict: null,
      },
      { alert_eligible: 1, guid: "pos", origin: "daily", verdict: "positive" },
      { alert_eligible: 1, guid: "unr", origin: "daily", verdict: "unranked" },
    ]);
  });
});

describe("runEligible again", () => {
  it("marks nothing the second time", async () => {
    const { coverageDatabase } = givenCoverage();
    const database = openCoverageStore(coverageDatabase);
    link(database, "pos", "positive", "daily");
    database.close();
    await runEligible({ coverageDatabase });

    await expect(runEligible({ coverageDatabase })).resolves.toEqual({
      marked: 0,
    });
    expect(links(coverageDatabase)).toEqual([
      { alert_eligible: 1, guid: "pos", origin: "daily", verdict: "positive" },
    ]);
  });
});

describe("runEligible lock", () => {
  it("names the holder and does not open the store", async () => {
    const directory = givenTemporaryDirectory();
    const coverageDatabase = path.join(directory, "coverage.sqlite");
    givenFile(directory, "coverage.sqlite.eligible.lock", String(process.pid));

    await expect(runEligible({ coverageDatabase })).rejects.toThrow(
      `Process ${process.pid} holds ${coverageDatabase}.eligible.lock`,
    );
    expect(fileExists(coverageDatabase)).toBe(false);
  });
});
