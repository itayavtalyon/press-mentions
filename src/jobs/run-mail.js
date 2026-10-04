import {
  claimOutbox,
  deleteSentBefore,
  openAlertsStore,
  pendingOutbox,
} from "../infra/alerts-store.js";
import { withCommandLock } from "../infra/lock.js";

const HOUR_MS = 3_600_000;
const SENT_RETAIN_MS = 96 * HOUR_MS;

/**
 * @typedef {object} MailConfig
 * @property {string} alertsDatabase Alerts SQLite path. The lock sits next to it.
 * @typedef {object} MailDependencies
 * @property {import("../infra/clock.js").Clock} clock Clock. The job does not call `Date.now`.
 * @property {import("../infra/logger.js").Log} log Structured logger.
 * @typedef {object} MailSummary
 * @property {number} sent Rows claimed on this run.
 */

/**
 * Sends pending digests. The pipeline step after digest enqueue.
 * It logs the stored body and marks the row sent. It does not open coverage, rebuild a body, write a file, or call the network.
 * @param {MailConfig} config Alerts settings.
 * @param {MailDependencies} dependencies Ports.
 * @returns {Promise<MailSummary>} How many rows this run claimed.
 * @throws {Error} Another mailer holds the lock, or a claim's log throws. Later rows stay pending.
 */
export async function runMail(config, dependencies) {
  return withCommandLock(config.alertsDatabase, "mail", async () => {
    const database = openAlertsStore(config.alertsDatabase);
    try {
      return deliver(database, dependencies);
    } finally {
      database.close();
    }
  });
}

/**
 * @param {import("better-sqlite3").Database} database Alerts store.
 * @param {MailDependencies} dependencies Ports.
 * @returns {MailSummary} How many rows this run claimed.
 */
function deliver(database, dependencies) {
  const nowMs = dependencies.clock.now();
  const sentAt = new Date(nowMs).toISOString();
  deleteSentBefore(database, new Date(nowMs - SENT_RETAIN_MS).toISOString());
  return {
    sent: claimAll(database, pendingOutbox(database), sentAt, dependencies.log),
  };
}

/**
 * Each claim commits before the log. A later throw leaves that row sent.
 * @param {import("better-sqlite3").Database} database Alerts store.
 * @param {import("../infra/alerts-store.js").PendingOutbox[]} rows Oldest pending first.
 * @param {string} sentAt `toISOString` text for rows claimed now.
 * @param {import("../infra/logger.js").Log} log Structured logger.
 * @returns {number} Rows whose pending update changed one row.
 */
function claimAll(database, rows, sentAt, log) {
  let sent = 0;
  for (const row of rows) {
    if (claimOutbox(database, row.id, sentAt) !== 1) {
      continue;
    }
    sent += 1;
    log("mail.sent", { body: row.body });
  }
  return sent;
}
