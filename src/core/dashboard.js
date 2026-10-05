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
 * @typedef {{ publishedAt: string, verdict: string, ownSite: boolean }} DatedMention
 * @typedef {{ from: Date, counts: VerdictCounts }} WeekCounts
 */

const MAX_ADDRESS_LENGTH = 254;
const WEEK = 7 * 24 * 60 * 60 * 1000;
const SECOND_LEVEL = new Set(["ac", "co", "com", "gov", "net", "org"]);

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
 * Counted mentions in 7-day buckets from the window start. The last bucket may be shorter.
 * ponytail: always weeks. A multi-year custom range gets thin columns; add month buckets if one is picked.
 * @param {DatedMention[]} mentions Mentions in the window. Own-site ones are not counted.
 * @param {import("./collection.js").Window} range Half-open window.
 * @returns {WeekCounts[]} One bucket per week, oldest first.
 */
export function weeklyCounts(mentions, { from, to }) {
  const length = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / WEEK));
  return Array.from({ length }, (_, index) => {
    const start = from.getTime() + index * WEEK;
    const week = mentions.filter((mention) => {
      const at = Date.parse(mention.publishedAt);
      return !mention.ownSite && at >= start && at < start + WEEK;
    });
    const count = (/** @type {string} */ verdict) =>
      week.filter((mention) => mention.verdict === verdict).length;
    return {
      counts: {
        negative: count("negative"),
        neutral: count("neutral"),
        positive: count("positive"),
        unranked: count("unranked"),
      },
      from: new Date(start),
    };
  });
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
 * The own-site rule: the publisher is the company itself. With an overlay `website`, the publisher host is that
 * host or under it. Without one, the host's registrable name equals the slug without hyphens (`harvey.ai`,
 * `corporate.tubitv.com`, `ro.co`), so a country domain like `news.ro` is not Ro.
 * ponytail: a short list of second-level suffixes, not the public suffix list. Add one when a miss shows up.
 * @param {string} companyId Slug.
 * @param {string | undefined} website Overlay host, like `ro.co`.
 * @param {string | undefined} homepage Publisher homepage from the feed.
 * @returns {boolean} True when the company published the article itself.
 */
export function isOwnSite(companyId, website, homepage) {
  if (homepage === undefined || !URL.canParse(homepage)) {
    return false;
  }
  const host = new URL(homepage).hostname;
  if (website !== undefined) {
    return host === website || host.endsWith(`.${website}`);
  }
  const labels = host.split(".");
  const name = SECOND_LEVEL.has(labels.at(-2) ?? "")
    ? labels.at(-3)
    : labels.at(-2);
  return name === companyId.replaceAll("-", "");
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
