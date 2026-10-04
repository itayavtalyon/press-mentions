import { parseAddress } from "../core/dashboard.js";
import {
  listSubscriptions,
  notifiedRows,
  openAlertsStore,
  storeDigests,
  subscribe,
} from "../infra/alerts-store.js";
import {
  alertCandidates,
  companyIds,
  openCoverageStore,
} from "../infra/coverage-store.js";
import { withCommandLock } from "../infra/lock.js";

const HOUR_MS = 3_600_000;
const ALERT_WINDOW_MS = 72 * HOUR_MS;

/**
 * @typedef {object} DigestConfig
 * @property {string} coverageDatabase Coverage SQLite path.
 * @property {string} alertsDatabase Alerts SQLite path. The lock sits next to it.
 * @property {string} alertEmail Default subscriber upserted for every company.
 * @typedef {object} DigestDependencies
 * @property {import("../infra/clock.js").Clock} clock Clock. The job does not call `Date.now`.
 * @typedef {object} DigestSummary
 * @property {number} digests Messages built for this run, including a set already stored.
 */

/**
 * Enqueues digests. The pipeline step after eligible.
 * It does not collect, unwrap, fetch, extract, classify, mark eligibility, or send.
 * @param {DigestConfig} config Store paths and `ALERT_EMAIL`.
 * @param {DigestDependencies} dependencies Ports.
 * @returns {Promise<DigestSummary>} How many digests this run built.
 * @throws {Error} Another digest holds the lock, or a digest write fails. A failed digest rolls back alone.
 */
export async function runDigest(config, dependencies) {
  const alertEmail = requireAlertEmail(config.alertEmail);
  return withCommandLock(config.alertsDatabase, "digest", async () => {
    const coverage = openCoverageStore(config.coverageDatabase);
    try {
      const alerts = openAlertsStore(config.alertsDatabase);
      try {
        return enqueue(coverage, alerts, alertEmail, dependencies.clock);
      } finally {
        alerts.close();
      }
    } finally {
      coverage.close();
    }
  });
}

/**
 * @param {string} raw `ALERT_EMAIL` as configured.
 * @returns {string} The trimmed address the subscribe form would accept.
 * @throws {Error} The address is empty, too long, or not an email.
 */
function requireAlertEmail(raw) {
  const parsed = parseAddress(raw);
  if ("email" in parsed) {
    return parsed.email;
  }
  throw new Error(`ALERT_EMAIL is ${parsed.problem}`);
}

/**
 * @param {import("better-sqlite3").Database} coverage Coverage store.
 * @param {import("better-sqlite3").Database} alerts Alerts store.
 * @param {string} alertEmail Default subscriber.
 * @param {import("../infra/clock.js").Clock} clock Injected clock.
 * @returns {DigestSummary} How many digests this run built.
 */
function enqueue(coverage, alerts, alertEmail, clock) {
  for (const companyId of companyIds(coverage)) {
    subscribe(alerts, companyId, alertEmail);
  }
  const nowMs = clock.now();
  const createdAt = new Date(nowMs).toISOString();
  const messages = buildDigests(
    listSubscriptions(alerts),
    alertCandidates(
      coverage,
      new Date(nowMs - ALERT_WINDOW_MS).toISOString(),
      createdAt,
    ),
    notifiedKeys(notifiedRows(alerts)),
    createdAt,
  );
  storeDigests(alerts, messages);
  return { digests: messages.length };
}

/**
 * @param {import("../infra/alerts-store.js").SubscriptionRow[]} subscriptions Stored pairs.
 * @param {import("../infra/coverage-store.js").AlertCandidate[]} candidates Window matches.
 * @param {Set<string>} notified Email, company, and guid already alerted.
 * @param {string} createdAt `toISOString` text for new outbox rows.
 * @returns {import("../infra/alerts-store.js").StoredDigest[]} Digests in email, then company id, order.
 */
function buildDigests(subscriptions, candidates, notified, createdAt) {
  /**
   * @type {import("../infra/alerts-store.js").StoredDigest[]}
   */
  const messages = [];
  for (const subscription of subscriptions) {
    const items = candidates
      .filter((candidate) =>
        isNewForSubscription(subscription, candidate, notified),
      )
      .toSorted(byDigestOrder);
    if (items.length === 0) {
      continue;
    }
    messages.push(toMessage(subscription, items, createdAt));
  }
  messages.sort(byAddress);
  return messages;
}

/**
 * @param {import("../infra/alerts-store.js").SubscriptionRow} subscription Stored pair.
 * @param {import("../infra/coverage-store.js").AlertCandidate} candidate One mention.
 * @param {Set<string>} notified Already alerted keys.
 * @returns {boolean} True when this mention is new for that stored email and company.
 */
function isNewForSubscription(subscription, candidate, notified) {
  return (
    candidate.companyId === subscription.companyId &&
    !notified.has(
      notifiedKey(subscription.email, subscription.companyId, candidate.guid),
    )
  );
}

/**
 * @param {import("../infra/alerts-store.js").NotifiedRow[]} rows Notified mentions.
 * @returns {Set<string>} Keys of email, company, and guid.
 */
function notifiedKeys(rows) {
  return new Set(
    rows.map((row) => notifiedKey(row.email, row.companyId, row.guid)),
  );
}

/**
 * @param {string} email Stored address.
 * @param {string} companyId Company slug.
 * @param {string} guid Article id.
 * @returns {string} One notified key.
 */
function notifiedKey(email, companyId, guid) {
  return JSON.stringify([email, companyId, guid]);
}

/**
 * @param {import("../infra/alerts-store.js").SubscriptionRow} subscription Stored pair.
 * @param {import("../infra/coverage-store.js").AlertCandidate[]} items Mentions in digest order.
 * @param {string} createdAt `toISOString` text.
 * @returns {import("../infra/alerts-store.js").StoredDigest} One outbox row and its notified guids.
 */
function toMessage(subscription, items, createdAt) {
  /**
   * @type {string[]}
   */
  const blocks = [];
  /**
   * @type {string[]}
   */
  const guids = [];
  let name = "";
  for (const item of items) {
    if (blocks.length === 0) {
      name = item.displayName;
    }
    blocks.push(itemLines(item));
    guids.push(item.guid);
  }
  return {
    body: `To: ${subscription.email}\n${name}\n\n${blocks.join("\n\n")}\n`,
    companyId: subscription.companyId,
    createdAt,
    email: subscription.email,
    guids,
    mentionIds: JSON.stringify(guids.toSorted(compareText)),
  };
}

/**
 * @param {import("../infra/coverage-store.js").AlertCandidate} item One mention.
 * @returns {string} Title, link, verdict, and the tone line when the verdict is unranked.
 */
function itemLines(item) {
  const lines = [item.title, itemLink(item), `Verdict: ${item.verdict}`];
  if (item.verdict === "unranked") {
    lines.push("Tone: unranked");
  }
  return lines.join("\n");
}

/**
 * @param {import("../infra/coverage-store.js").AlertCandidate} item One mention.
 * @returns {string} The publisher URL, or the Google URL when that is null or empty.
 */
function itemLink(item) {
  const publisher = item.publisherUrl ?? "";
  return publisher === "" ? item.googleUrl : publisher;
}

/**
 * @param {import("../infra/coverage-store.js").AlertCandidate} left One mention.
 * @param {import("../infra/coverage-store.js").AlertCandidate} right Another mention.
 * @returns {number} Negative, positive, neutral, unranked; newest first; then guid.
 */
function byDigestOrder(left, right) {
  return (
    verdictRank(left.verdict) - verdictRank(right.verdict) ||
    compareText(right.publishedAt, left.publishedAt) ||
    compareText(left.guid, right.guid)
  );
}

/**
 * @param {import("../infra/alerts-store.js").StoredDigest} left One digest.
 * @param {import("../infra/alerts-store.js").StoredDigest} right Another digest.
 * @returns {number} Email, then company id.
 */
function byAddress(left, right) {
  return (
    compareText(left.email, right.email) ||
    compareText(left.companyId, right.companyId)
  );
}

/**
 * @param {string} verdict Candidate verdict.
 * @returns {number} Negative, positive, neutral, then unranked.
 */
function verdictRank(verdict) {
  if (verdict === "negative") {
    return 0;
  }
  if (verdict === "positive") {
    return 1;
  }
  return verdict === "neutral" ? 2 : 3;
}

/**
 * UTF-16 code unit order, which is also time order for `toISOString` text.
 * @param {string} left One string.
 * @param {string} right Another string.
 * @returns {number} Negative when `left` is first.
 */
function compareText(left, right) {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}
