import { backfillWindow, contains, splitWeeks } from "./collection.js";
import { selectRoundRobin } from "./select.js";

/**
 * @typedef {object} FeedItem One search result, before any text stage.
 * @property {string} guid Google's article id.
 * @property {string} title Headline without the trailing " - Publisher".
 * @property {string} link Google News article URL.
 * @property {string} publishedAt ISO timestamp from `pubDate`.
 * @property {string | undefined} publisherName Publisher name from `<source>`.
 * @property {string | undefined} publisherHomepage Publisher homepage from `<source url>`.
 */

/**
 * @typedef {object} Feed The news search port (ADR 0006).
 * @property {(company: import("./overlay.js").Company, window: import("./collection.js").Window) => Promise<FeedItem[]>} search
 *   One query. Returns the items as the source sent them, unfiltered.
 */

/**
Google News RSS never returns more than this many items, and a full page is still HTTP 200.
 */
export const FEED_PAGE_LIMIT = 100;

/**
Most candidates kept per company by the backfill (ADR 0003).
 */
export const BACKFILL_CAP = 150;

/**
 * Collects one company's backfill candidates (ADR 0003). One query for the whole window; when that page is
 * full, one query per week, then at most BACKFILL_CAP items round-robin across the weeks.
 * ponytail: no day split. A full week stays truncated. Production keeps halving.
 * @param {import("./overlay.js").Company} company Company to search for.
 * @param {Feed} feed News search port.
 * @param {Date} now Run start.
 * @returns {Promise<{ items: FeedItem[], fullPages: number }>} Candidates inside the window, and how many pages were full.
 */
export async function collectBackfill(company, feed, now) {
  const window = backfillWindow(now);
  const page = await feed.search(company, window);
  if (page.length < FEED_PAGE_LIMIT) {
    return {
      items: selectRoundRobin([within(page, window)], BACKFILL_CAP),
      fullPages: 0,
    };
  }

  const weeks = [];
  let fullPages = 1;
  for (const week of splitWeeks(window)) {
    const items = await feed.search(company, week);
    fullPages += items.length >= FEED_PAGE_LIMIT ? 1 : 0;
    weeks.push(within(items, week));
  }
  return { items: selectRoundRobin(weeks, BACKFILL_CAP), fullPages };
}

/**
 * @param {FeedItem[]} items Items from one query.
 * @param {import("./collection.js").Window} window The query's window.
 * @returns {FeedItem[]} Items published inside the window, in feed order.
 */
function within(items, window) {
  return items.filter((item) => contains(window, item.publishedAt));
}
