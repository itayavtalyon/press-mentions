import { lastQuarter, thisQuarter } from "./collection.js";

/**
 * Dashboard filters: the query-string contract (ADR 0001, ADR 0008, `docs/ui-design.md` §5). It turns
 * `window`, `from`, `to`, and `verdict` into the range and verdicts the store filters by.
 * Request validation returns field problems. Bad input is expected output, not an error.
 */

/**
 * @typedef {import("./collection.js").Window} Window
 * @typedef {"last" | "this" | "custom"} WindowName
 * @typedef {"all" | "negative" | "positive" | "neutral" | "unranked"} VerdictChoice
 * @typedef {{ range: Window, verdicts: readonly string[] }} CoverageQuery What the store filters by.
 * @typedef {CoverageQuery & { window: WindowName, verdict: VerdictChoice }} Filters A valid request.
 * @typedef {{ window: string, verdict: string, from: string, to: string }} FilterForm Values the form shows.
 * @typedef {{ field: "window" | "verdict" | "from" | "to", kind: "unknown" | "invalid" | "order" }} Problem
 * @typedef {{ filters: Filters, form: FilterForm } | { problems: Problem[], form: FilterForm }} FilterResult
 */

/**
 * Verdicts a reader sees, in digest order (ADR 0002, ADR 0007).
 * @type {readonly ["negative", "positive", "neutral", "unranked"]}
 */
export const VISIBLE_VERDICTS = ["negative", "positive", "neutral", "unranked"];

/**
 * @type {readonly WindowName[]}
 */
const WINDOW_NAMES = ["last", "this", "custom"];
/**
 * @type {readonly VerdictChoice[]}
 */
const VERDICT_CHOICES = ["all", ...VISIBLE_VERDICTS];
const PREFILL_DAYS = 90;
const MILLISECONDS_PER_DAY = 86_400_000;
const DAY_TEXT = /^\d{4}-\d{2}-\d{2}$/u;
const LAST_YEAR = 9999;

/**
 * Reads `window`, `from`, `to`, and `verdict`. An empty value means the default.
 * @param {URLSearchParams} query Request query.
 * @param {Date} now Read time.
 * @returns {FilterResult} The filters, or every field problem. Both carry the form values.
 */
export function parseFilters(query, now) {
  const form = filterForm(query, now);
  const window = WINDOW_NAMES.find((name) => name === form.window);
  const verdict = VERDICT_CHOICES.find((choice) => choice === form.verdict);
  const range = window === undefined ? [] : windowRange(window, form, now);

  if (window === undefined || verdict === undefined || Array.isArray(range)) {
    return {
      form,
      problems: [
        ...unknown(window, "window"),
        ...unknown(verdict, "verdict"),
        ...(Array.isArray(range) ? range : []),
      ],
    };
  }

  const verdicts = verdict === "all" ? VISIBLE_VERDICTS : [verdict];
  return { filters: { range, verdict, verdicts, window }, form };
}

/**
 * @param {URLSearchParams} query Request query.
 * @param {Date} now Read time.
 * @returns {FilterForm} Typed custom dates, or the last 90 days through today when custom is not chosen.
 */
function filterForm(query, now) {
  const window = query.get("window") || "last";
  const verdict = query.get("verdict") || "all";
  if (window === "custom") {
    return {
      from: query.get("from") ?? "",
      to: query.get("to") ?? "",
      verdict,
      window,
    };
  }
  const today = now.getTime() - (now.getTime() % MILLISECONDS_PER_DAY);
  return {
    from: dayText(new Date(today - (PREFILL_DAYS - 1) * MILLISECONDS_PER_DAY)),
    to: dayText(new Date(today)),
    verdict,
    window,
  };
}

/**
 * @param {WindowName} window Chosen window.
 * @param {FilterForm} form Typed dates.
 * @param {Date} now Read time.
 * @returns {Window | Problem[]} The half-open range, or the date problems.
 */
function windowRange(window, form, now) {
  if (window === "last") {
    return lastQuarter(now);
  }
  return window === "this" ? thisQuarter(now) : customRange(form);
}

/**
 * @param {FilterForm} form Typed dates. `to` includes its whole UTC day.
 * @returns {Window | Problem[]} `[from, to + 1 day)`, or the date problems.
 */
function customRange(form) {
  const from = parseDay(form.from);
  const to = parseDay(form.to);
  const end = to && new Date(to.getTime() + MILLISECONDS_PER_DAY);
  // The store compares `toISOString` text, which writes year 10000 as `+010000-…` and sorts it first.
  const until = end && end.getUTCFullYear() <= LAST_YEAR ? end : undefined;
  if (from === undefined || until === undefined) {
    return [
      ...unknown(from, "from", "invalid"),
      ...unknown(until, "to", "invalid"),
    ];
  }
  return from.getTime() >= until.getTime()
    ? [{ field: "from", kind: "order" }]
    : { from, to: until };
}

/**
 * @param {unknown} value Parsed value, undefined when it did not parse.
 * @param {Problem["field"]} field Field it came from.
 * @param {Problem["kind"]} [kind] Problem kind.
 * @returns {Problem[]} One problem when the value is missing.
 */
function unknown(value, field, kind = "unknown") {
  return value === undefined ? [{ field, kind }] : [];
}

/**
 * @param {string} text `YYYY-MM-DD`.
 * @returns {Date | undefined} Midnight UTC that day, or undefined for any other text or an impossible day.
 */
function parseDay(text) {
  const day = new Date(`${text}T00:00:00.000Z`);
  // Date rolls 2026-02-30 into March, so the day must read back the same.
  return DAY_TEXT.test(text) &&
    !Number.isNaN(day.getTime()) &&
    dayText(day) === text
    ? day
    : undefined;
}

/**
 * @param {Date} date Valid instant.
 * @returns {string} Its UTC day as `YYYY-MM-DD`.
 */
function dayText(date) {
  return date.toISOString().slice(0, 10);
}
