const DAY_MS = 86_400_000;

/**
 * Builds the Google News search query for one company (ADR 0003).
 * Every name and term is quoted. Names and aliases are joined with OR. Overlay query terms narrow the result.
 * The date operators are widened by a day on each side, because Google's day boundaries are not UTC
 * (`after:2026-06-30` returned an item dated 2026-06-30 07:00 UTC). Callers filter on `pubDate` themselves.
 * @param {import("./overlay.js").Company} company Company with aliases and query terms.
 * @param {import("./windows.js").Window} window Range to search.
 * @returns {string} The `q` parameter, unencoded.
 * @throws {Error} A name or term contains a double quote.
 */
export function buildQuery(company, window) {
  const names = orGroup([company.queryName, ...company.aliases]);
  const narrowing =
    company.queryTerms.length > 0 ? [orGroup(company.queryTerms)] : [];
  return [
    names,
    ...narrowing,
    `after:${isoDay(window.from.getTime() - DAY_MS)}`,
    `before:${isoDay(window.to.getTime() + DAY_MS)}`,
  ].join(" ");
}

/**
 * @param {string[]} terms One or more terms.
 * @returns {string} `"a"`, or `("a" OR "b")`.
 */
function orGroup(terms) {
  const joined = terms.map((term) => quote(term)).join(" OR ");
  return terms.length > 1 ? `(${joined})` : joined;
}

/**
 * @param {string} term Name or term.
 * @returns {string} The term in double quotes.
 */
function quote(term) {
  if (term.includes('"')) {
    throw new Error(`Query term ${term} contains a double quote`);
  }
  return `"${term}"`;
}

/**
 * @param {number} time Milliseconds since the epoch.
 * @returns {string} `YYYY-MM-DD` in UTC.
 */
function isoDay(time) {
  return new Date(time).toISOString().slice(0, 10);
}
