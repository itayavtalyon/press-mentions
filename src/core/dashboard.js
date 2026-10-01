import { backfillWindow } from "./collection.js";
import { daysSince } from "./mention-status.js";

/**
 * Dashboard presentation rules (ADR 0001, ADR 0002, ADR 0008): index order, tallies, last mentioned,
 * when collection started, and the subscribe address rule. The query string is `filters.js`.
 */

/**
 * @typedef {{ negative: number, positive: number, neutral: number, unranked: number }} VerdictCounts
 * @typedef {{ mentions: number, rated: number, positive: number, negative: number, neutral: number }} Tally
 * @typedef {object} CompanyCoverage One company with its counts for a window.
 * @property {string} id Slug.
 * @property {string} displayName Seed name.
 * @property {string[]} aliases Seed aliases.
 * @property {string | undefined} descriptor Overlay descriptor.
 * @property {string | undefined} lastMentionedAt Newest visible mention in all stored data.
 * @property {VerdictCounts} counts Visible mentions in the window, by verdict.
 * @typedef {{ firstBackfilledAt: string | undefined, firstPublishedAt: string | undefined }} CollectionBounds
 * @typedef {{ email: string } | { problem: "empty" | "invalid" | "long" }} AddressResult
 */

const MAX_ADDRESS_LENGTH = 254;

/**
 * Index rows: a verdict filter drops companies without such a mention, then newest last mention first,
 * companies with none last, then display name ignoring case.
 * @param {CompanyCoverage[]} rows Every company with its counts.
 * @param {import("./filters.js").Filters} filters The request.
 * @returns {CompanyCoverage[]} Rows to show, in order.
 */
export function companyList(rows, filters) {
  const shown =
    filters.verdict === "all"
      ? rows
      : rows.filter((row) => tally(row.counts).mentions > 0);
  return shown.toSorted(byLastMentionThenName);
}

/**
 * @param {VerdictCounts} counts Visible mentions by verdict.
 * @returns {Tally} "18 mentions, 11 rated" and the tone counts. `unranked` is a mention that is not rated.
 */
export function tally(counts) {
  const rated = counts.positive + counts.negative + counts.neutral;
  return {
    mentions: rated + counts.unranked,
    negative: counts.negative,
    neutral: counts.neutral,
    positive: counts.positive,
    rated,
  };
}

/**
 * @param {string} lastMentionedAt Newest visible mention, as ISO text.
 * @param {Date} now Read time.
 * @returns {number} Whole elapsed days, with a future date clamped to 0.
 */
export function lastMentionedDays(lastMentionedAt, now) {
  return Math.max(0, daysSince(new Date(lastMentionedAt), now));
}

/**
 * When collection started: the backfill window of the first backfill, else the first stored day.
 * @param {CollectionBounds} bounds First backfill and first stored article.
 * @returns {Date | undefined} Midnight UTC, or undefined when nothing is stored.
 */
export function collectionStart({ firstBackfilledAt, firstPublishedAt }) {
  if (firstBackfilledAt !== undefined) {
    return backfillWindow(new Date(firstBackfilledAt)).from;
  }
  return firstPublishedAt === undefined
    ? undefined
    : new Date(`${firstPublishedAt.slice(0, 10)}T00:00:00.000Z`);
}

/**
 * The subscribe rule: trimmed, one `@` with text before it, no whitespace, a dot inside the domain,
 * at most 254 characters.
 * @param {string} raw Posted value.
 * @returns {AddressResult} The trimmed address as typed, or why it was refused.
 */
export function parseAddress(raw) {
  const email = raw.trim();
  if (email === "") {
    return { problem: "empty" };
  }
  if (email.length > MAX_ADDRESS_LENGTH) {
    return { problem: "long" };
  }
  return isAddress(email) ? { email } : { problem: "invalid" };
}

/**
 * @param {CompanyCoverage} a Row.
 * @param {CompanyCoverage} b Row.
 * @returns {number} Sort order.
 */
function byLastMentionThenName(a, b) {
  if (a.lastMentionedAt !== b.lastMentionedAt) {
    if (a.lastMentionedAt === undefined) {
      return 1;
    }
    if (b.lastMentionedAt === undefined) {
      return -1;
    }
    return a.lastMentionedAt < b.lastMentionedAt ? 1 : -1;
  }
  return a.displayName.localeCompare(b.displayName, "en", {
    sensitivity: "base",
  });
}

/**
 * @param {string} email Trimmed, non-empty address.
 * @returns {boolean} One `@` with text before it, no whitespace, and a dot inside the domain.
 */
function isAddress(email) {
  const [local = "", domain = "", ...extra] = email.split("@");
  return (
    extra.length === 0 &&
    local !== "" &&
    !/\s/u.test(email) &&
    domain.slice(1, -1).includes(".")
  );
}
