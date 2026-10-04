/* eslint-disable security/detect-non-literal-fs-filename, unicorn/no-null -- Temp paths only. The export's JSON uses null. */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { openAlertsStore } from "../../src/infra/alerts-store.js";
import { openCoverageStore } from "../../src/infra/coverage-store.js";
import { runExport } from "../../src/jobs/run-export.js";
import { addCompany, addMention } from "../helpers/coverage.js";
import { givenClock } from "../helpers/fakes.js";
import { givenTemporaryDirectory, readText } from "../helpers/files.js";

const NOW = Date.parse("2026-10-04T12:00:00.000Z");

/**
 * @returns {import("../../src/jobs/run-export.js").ExportConfig} Stores with one mentioned and one silent company.
 */
function givenStores() {
  const directory = givenTemporaryDirectory();
  const config = {
    alertsDatabase: path.join(directory, "alerts.sqlite"),
    coverageDatabase: path.join(directory, "coverage.sqlite"),
    evaluationDatabase: path.join(directory, "evaluation.sqlite"),
    outDirectory: path.join(directory, "out"),
  };

  const coverage = openCoverageStore(config.coverageDatabase);
  addCompany(coverage, { displayName: "Acme", id: "acme" });
  addCompany(coverage, { displayName: "Quiet", id: "quiet" });
  addMention(coverage, {
    companyId: "acme",
    guid: "in-quarter",
    publishedAt: "2026-08-01T00:00:00.000Z",
    publisherName: "Daily",
    publisherUrl: "https://daily.example/a",
    verdict: "positive",
  });
  addMention(coverage, {
    companyId: "acme",
    guid: "this-quarter",
    publishedAt: "2026-10-02T00:00:00.000Z",
    verdict: "negative",
  });
  addMention(coverage, {
    companyId: "quiet",
    guid: "namesake",
    publishedAt: "2026-08-02T00:00:00.000Z",
    verdict: "unrelated",
  });
  coverage.close();

  const alerts = openAlertsStore(config.alertsDatabase);
  alerts
    .prepare(
      `INSERT INTO outbox (email, company_id, body, created_at, status, mention_ids)
       VALUES ('real@person.test', 'acme', 'Acme: 1 new mention', '2026-10-04T11:00:00.000Z', 'pending', '["this-quarter"]')`,
    )
    .run();
  alerts
    .prepare(
      "INSERT INTO subscriptions (company_id, email) VALUES ('acme', 'real@person.test'), ('acme', 'other@person.test')",
    )
    .run();
  alerts.close();

  new Database(config.evaluationDatabase).close();
  return config;
}

/**
 * @param {string} file JSON file.
 * @returns {ReturnType<typeof JSON.parse>} Parsed value.
 */
function readJson(file) {
  return JSON.parse(readText(file));
}

describe("runExport JSON", () => {
  it("writes the last quarter's visible mentions and each company's status", async () => {
    const config = givenStores();

    const summary = await runExport(config, givenClock(NOW));

    expect(summary).toEqual({ alerts: 1, companies: 2, mentions: 1 });
    expect(
      readJson(path.join(config.outDirectory, "companies", "acme.json")),
    ).toEqual({
      as_of: "2026-10-04T12:00:00.000Z",
      last_mentioned_at: "2026-10-02T00:00:00.000Z",
      mentions: [
        {
          link: "https://daily.example/a",
          published_at: "2026-08-01T00:00:00.000Z",
          publisher: "Daily",
          text_source: "body",
          title: "Title in-quarter",
          verdict: "positive",
        },
      ],
      name: "Acme",
    });
    const status = readJson(path.join(config.outDirectory, "summary.json"));
    expect(status.quarter).toEqual({
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-10-01T00:00:00.000Z",
    });
    expect(
      status.companies.map(
        (
          /** @type {{ id: string, days_since_last_mention: number | null }} */ company,
        ) => [company.id, company.days_since_last_mention],
      ),
    ).toEqual([
      ["acme", 2],
      ["quiet", null],
    ]);
  });
});

describe("runExport alerts and links", () => {
  it("falls back to the Google link and writes alerts without addresses", async () => {
    const config = givenStores();
    const coverage = openCoverageStore(config.coverageDatabase);
    coverage
      .prepare(
        "UPDATE articles SET publisher_url = NULL, publisher_name = NULL, text_source = NULL",
      )
      .run();
    coverage.close();

    await runExport(config, givenClock(NOW));

    const [mention] = readJson(
      path.join(config.outDirectory, "companies", "acme.json"),
    ).mentions;
    expect([mention.link, mention.publisher, mention.text_source]).toEqual([
      expect.stringContaining("in-quarter"),
      null,
      null,
    ]);
    const alerts = readText(path.join(config.outDirectory, "alerts.json"));
    expect(alerts).toContain("Acme: 1 new mention");
    expect(alerts).not.toContain("person.test");
  });
});

describe("runExport copies", () => {
  it("copies every store and redacts the alerts copy only", async () => {
    const config = givenStores();
    const coverage = openCoverageStore(config.coverageDatabase);
    coverage
      .prepare(
        "UPDATE articles SET body_html = '<script>token = \"pk.secret\"</script>'",
      )
      .run();
    coverage.close();
    const sqlite = path.join(config.outDirectory, "sqlite");
    await runExport(config, givenClock(NOW));
    writeFileSync(path.join(sqlite, "stale.sqlite"), "");

    await runExport(config, givenClock(NOW));

    expect(readdirSync(sqlite).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "alerts.sqlite",
      "coverage.sqlite",
      "evaluation.sqlite",
    ]);
    const copy = new Database(path.join(sqlite, "alerts.sqlite"));
    const emails = copy
      .prepare(
        "SELECT email FROM subscriptions UNION ALL SELECT email FROM outbox",
      )
      .pluck()
      .all();
    copy.close();
    expect(emails).toEqual(["redacted@example.com", "redacted@example.com"]);
    expect(
      readFileSync(path.join(sqlite, "coverage.sqlite")).includes("pk.secret"),
    ).toBe(false);
    const live = new Database(config.alertsDatabase);
    expect(
      live.prepare("SELECT COUNT(*) FROM subscriptions").pluck().get(),
    ).toBe(2);
    live.close();
  });

  it("refuses a copy over the size limit and deletes it", async () => {
    const config = { ...givenStores(), maxCopyBytes: 1 };

    await expect(runExport(config, givenClock(NOW))).rejects.toThrow(
      "coverage.sqlite is over 1 bytes",
    );
    expect(readdirSync(path.join(config.outDirectory, "sqlite"))).toEqual([]);
  });
});
/* eslint-enable security/detect-non-literal-fs-filename, unicorn/no-null -- End of file. */
