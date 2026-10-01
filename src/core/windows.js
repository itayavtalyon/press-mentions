/**
 * @typedef {object} Window A half-open UTC time range `[from, to)`.
 * @property {Date} from Inclusive start.
 * @property {Date} to Exclusive end.
 */

const WEEK_MS = 7 * 86_400_000;

/**
 * The backfill window: the start of the previous UTC calendar quarter through now (ADR 0001, ADR 0003).
 * @param {Date} now Run start.
 * @returns {Window} `[start of last quarter, now)`.
 */
export function backfillWindow(now) {
  const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
  // Date.UTC rolls a negative month back into the previous year.
  return {
    from: new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth - 3, 1)),
    to: now,
  };
}

/**
 * Splits a window into consecutive seven-day windows. The last one ends at `window.to`.
 * @param {Window} window Range to split.
 * @returns {Window[]} Weeks in time order. Empty when the window is empty.
 */
export function splitWeeks(window) {
  const end = window.to.getTime();
  /**
   * @type {Window[]}
   */
  const weeks = [];
  for (let start = window.from.getTime(); start < end; start += WEEK_MS) {
    weeks.push({
      from: new Date(start),
      to: new Date(Math.min(start + WEEK_MS, end)),
    });
  }
  return weeks;
}

/**
 * @param {Window} window Range.
 * @param {string} instant ISO timestamp.
 * @returns {boolean} Whether `instant` falls inside `[from, to)`.
 */
export function contains(window, instant) {
  const time = Date.parse(instant);
  return time >= window.from.getTime() && time < window.to.getTime();
}
