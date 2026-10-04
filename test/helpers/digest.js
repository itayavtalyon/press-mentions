import path from "node:path";

import { isRecord } from "../../src/core/common.js";
import { openAlertsStore } from "../../src/infra/alerts-store.js";
import { openCoverageStore } from "../../src/infra/coverage-store.js";
import { runDigest } from "../../src/jobs/run-digest.js";

import { addCompany, addMention } from "./coverage.js";
import { givenClock } from "./fakes.js";
import { givenTemporaryDirectory } from "./files.js";

const HOUR_MS = 3_600_000;

/**
 * Frozen instant for digest tests. `published_at` is compared as this ISO text.
 */
export const NOW = Date.parse("2026-10-04T12:00:00.000Z");

export const WINDOW_MS = 72 * HOUR_MS;

export const ALERT_EMAIL = "alerts@example.com";

/**
 * @param {number} ms Milliseconds since the epoch.
 * @returns {string} `toISOString` text.
 */
export function iso(ms) {
  return new Date(ms).toISOString();
}

/**
 * @param {number} hours Hours before {@link NOW}.
 * @returns {string} An instant inside or outside the 72-hour window.
 */
function hoursBefore(hours) {
  return iso(NOW - hours * HOUR_MS);
}

/**
 * @param {string} email Address line.
 * @param {string} name Company display name.
 * @param {string[]} blocks Item blocks, already joined with newlines.
 * @returns {string} The digest body, including the newline after the last line.
 */
export function digestBody(email, name, blocks) {
  return `To: ${email}\n${name}\n\n${blocks.join("\n\n")}\n`;
}

/**
 * @param {string} guid Article id.
 * @returns {string} The Google News URL `addMention` stores.
 */
export function googleUrl(guid) {
  return `https://news.google.com/rss/articles/${guid}`;
}

/**
 * @returns {{ alertsDatabase: string, coverageDatabase: string, directory: string }} Temp store paths.
 */
export function givenDigestPaths() {
  const directory = givenTemporaryDirectory();
  return {
    alertsDatabase: path.join(directory, "alerts.sqlite"),
    coverageDatabase: path.join(directory, "coverage.sqlite"),
    directory,
  };
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {Parameters<typeof addMention>[1] & { alertEligible?: number }} mention Article and link.
 * @returns {void}
 */
export function addAlertMention(database, mention) {
  addMention(database, mention);
  database
    .prepare(
      "UPDATE company_articles SET alert_eligible = ? WHERE company_id = ? AND guid = ?",
    )
    .run(mention.alertEligible ?? 1, mention.companyId, mention.guid);
}

/**
 * One eligible mention. `publisher: "google"` leaves the publisher URL null. `""` stores an empty one.
 * @param {string} guid Article id.
 * @param {string} title Headline.
 * @param {string} verdict Stored verdict.
 * @param {{
 *   alertEligible?: number,
 *   companyId?: string,
 *   hoursAgo?: number,
 *   publishedAt?: string,
 *   publisher?: string,
 * }} [options] Overrides. `hoursAgo` is before {@link NOW}.
 * @returns {Parameters<typeof addAlertMention>[1]} A mention fixture.
 */
export function alertMention(guid, title, verdict, options = {}) {
  /**
  @type {Parameters<typeof addAlertMention>[1]}
   */
  const row = {
    companyId: options.companyId ?? "acme",
    guid,
    publishedAt: options.publishedAt ?? hoursBefore(options.hoursAgo ?? 1),
    title,
    verdict,
  };
  if (options.alertEligible !== undefined) {
    row.alertEligible = options.alertEligible;
  }
  if (options.publisher !== "google") {
    row.publisherUrl = options.publisher ?? `https://publisher.example/${guid}`;
  }
  return row;
}

/**
 * @param {ReturnType<typeof givenDigestPaths>} paths Store paths.
 * @param {import("./coverage.js").CompanyFixture[]} companies Companies to insert.
 * @param {Parameters<typeof addAlertMention>[1][]} mentions Mentions to insert.
 * @param {(alerts: import("better-sqlite3").Database) => void} [after] Alerts writes after the mentions.
 * @returns {void}
 */
export function seedMentions(paths, companies, mentions, after) {
  seedStores(paths, (coverage, alerts) => {
    for (const company of companies) {
      addCompany(coverage, company);
    }
    for (const item of mentions) {
      addAlertMention(coverage, item);
    }
    if (after !== undefined) {
      after(alerts);
    }
  });
}

/**
 * @param {ReturnType<typeof givenDigestPaths>} paths Store paths.
 * @param {(
 *   coverage: import("better-sqlite3").Database,
 *   alerts: import("better-sqlite3").Database,
 * ) => void} seed Writes the fixture, then both connections close.
 * @returns {void}
 */
export function seedStores(paths, seed) {
  const coverage = openCoverageStore(paths.coverageDatabase);
  try {
    const alerts = openAlertsStore(paths.alertsDatabase);
    try {
      seed(coverage, alerts);
    } finally {
      alerts.close();
    }
  } finally {
    coverage.close();
  }
}

/**
 * @param {ReturnType<typeof givenDigestPaths>} paths Store paths.
 * @param {string} [alertEmail] Address the command upserts.
 * @returns {Promise<{ digests: number }>} What the command stored.
 */
export function runAt(paths, alertEmail = ALERT_EMAIL) {
  return runDigest(
    {
      alertEmail,
      alertsDatabase: paths.alertsDatabase,
      coverageDatabase: paths.coverageDatabase,
    },
    { clock: givenClock(NOW).clock },
  );
}

/**
 * @param {string} alertsDatabase Alerts file.
 * @returns {{
 *   notified: Record<string, unknown>[],
 *   outbox: Record<string, unknown>[],
 *   subscriptions: Record<string, unknown>[],
 * }} Rows the assertions read.
 */
export function readAlerts(alertsDatabase) {
  const database = openAlertsStore(alertsDatabase);
  try {
    return {
      notified: notifiedRows(database),
      outbox: outboxRows(database),
      subscriptions: subscriptionRows(database),
    };
  } finally {
    database.close();
  }
}

/**
 * @param {import("better-sqlite3").Database} database Alerts store.
 * @returns {Record<string, unknown>[]} Notified rows.
 */
function notifiedRows(database) {
  return queryRows(
    database,
    "SELECT email, company_id, guid FROM notified ORDER BY email, company_id, guid",
  );
}

/**
 * @param {import("better-sqlite3").Database} database Alerts store.
 * @returns {Record<string, unknown>[]} Outbox rows in insert order.
 */
function outboxRows(database) {
  return queryRows(
    database,
    `SELECT id, email, company_id, body, created_at, status, mention_ids, sent_at
       FROM outbox ORDER BY id`,
  );
}

/**
 * @param {import("better-sqlite3").Database} database Alerts store.
 * @returns {Record<string, unknown>[]} Subscription rows.
 */
function subscriptionRows(database) {
  return queryRows(
    database,
    "SELECT company_id, email FROM subscriptions ORDER BY company_id, email",
  );
}

/**
 * @param {import("better-sqlite3").Database} database Alerts store.
 * @param {string} sql Select statement.
 * @returns {Record<string, unknown>[]} Narrowed rows.
 */
function queryRows(database, sql) {
  return database
    .prepare(sql)
    .all()
    .map((row) => {
      if (!isRecord(row)) {
        throw new Error("SQLite row was not an object");
      }
      return row;
    });
}
