const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Whole days from `date` until `now`, rounded toward negative infinity.
 * @param {Date} date Start instant.
 * @param {Date} now End instant.
 * @returns {number} Elapsed whole days. Negative when `date` is after `now`.
 * @throws {TypeError} Either argument is an invalid date.
 */
export function daysSince(date, now) {
  const elapsedMilliseconds = now.getTime() - date.getTime();

  if (Number.isNaN(elapsedMilliseconds)) {
    throw new TypeError("daysSince expects valid Date instances");
  }

  return Math.floor(elapsedMilliseconds / MILLISECONDS_PER_DAY);
}
