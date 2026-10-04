/**
 * @typedef {object} Window A half-open UTC time range `[from, to)`.
 * @property {Date} from Inclusive start.
 * @property {Date} to Exclusive end.
 */

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const FORWARD_DAYS = 3;

/**
 * The backfill window: the start of the previous UTC calendar quarter through now (ADR 0001, ADR 0003).
 * @param {Date} now Run start.
 * @returns {Window} `[start of last quarter, now)`.
 */
export function backfillWindow(now) {
  return { from: quarterStart(now, -1), to: now };
}

/**
 * The forward feed window: the trailing three days through now (ADR 0003, ADR 0007).
 * @param {Date} now Run start.
 * @returns {Window} `[now - 3 days, now)`.
 */
export function forwardWindow(now) {
  return { from: new Date(now.getTime() - FORWARD_DAYS * DAY_MS), to: now };
}

/**
 * The previous complete UTC calendar quarter (ADR 0001). The dashboard default and the export window.
 * @param {Date} now Read time.
 * @returns {Window} `[start of last quarter, start of this quarter)`.
 */
export function lastQuarter(now) {
  return { from: quarterStart(now, -1), to: quarterStart(now, 0) };
}

/**
 * The current UTC calendar quarter from its start through now (ADR 0001).
 * @param {Date} now Read time.
 * @returns {Window} `[start of this quarter, now)`.
 */
export function thisQuarter(now) {
  return { from: quarterStart(now, 0), to: now };
}

/**
 * @param {Date} now Instant inside the reference quarter.
 * @param {number} offset Quarters to move from the one holding `now`.
 * @returns {Date} Midnight UTC on the first day of that quarter.
 */
function quarterStart(now, offset) {
  const month = Math.floor(now.getUTCMonth() / 3) * 3 + offset * 3;
  // Date.UTC rolls a negative month back into the previous year.
  return new Date(Date.UTC(now.getUTCFullYear(), month, 1));
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
