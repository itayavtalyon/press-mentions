import { html } from "./markup.js";
import { formatDay, formatRange } from "./page.js";
import { capitalized, emptyState, formField } from "./parts.js";

/**
 * Filter form (`docs/ui-design.md` §5, §6.6): the shared GET form, its error copy, and the sentence that
 * names the window. The query-string contract itself is `src/core/filters.js`.
 */

/**
 * @typedef {import("../../core/filters.js").FilterForm} FilterForm
 * @typedef {import("../../core/filters.js").Filters} Filters
 * @typedef {import("../../core/filters.js").Problem} Problem
 * @typedef {ReturnType<typeof html>} Html
 */

/**
 * Pill order follows the tone counts, not the digest order (spec §5).
 */
const PILL_VERDICTS = /** @type {const} */ ([
  "positive",
  "negative",
  "neutral",
  "unranked",
]);

/**
 * @type {readonly ["last" | "this" | "custom", string][]}
 */
const WINDOW_OPTIONS = [
  ["last", "Last quarter"],
  ["this", "This quarter"],
  ["custom", "Custom"],
];

/**
 * @param {{ action: string, form: FilterForm, problems: Problem[] }} request Where it submits, what it shows, and
 *   what was wrong.
 * @returns {Html} The form and the hint shown to script users.
 */
export function filterForm({ action, form, problems }) {
  const from = problems.find((problem) => problem.field === "from");
  const to = problems.find((problem) => problem.field === "to");
  return html`<form
      class="filters card"
      method="get"
      action="${action}"
      aria-label="Filters"
      data-filters
    >
      <fieldset>
        <legend>Time window</legend>
        <div class="segmented">
          ${WINDOW_OPTIONS.map((option) => windowRadio(option, form.window))}
        </div>
        <div class="custom-range">
          ${dateField("from", form.from, from, from !== undefined)}
          ${dateField("to", form.to, to, from === undefined && to !== undefined)}
        </div>
      </fieldset>
      <fieldset>
        <legend>Verdict</legend>
        <div class="pills">
          ${verdictPill("all", form.verdict)}${PILL_VERDICTS.map((verdict) => verdictPill(verdict, form.verdict))}
        </div>
      </fieldset>
      <div class="filters__actions">
        <button class="btn btn--primary" type="submit">Apply</button>
      </div>
    </form>
    <p class="filters__hint">Results update as you change filters.</p>`;
}

/**
 * @param {Problem[]} problems Field problems from the request.
 * @returns {Html} The error summary that links each message to its field, or nothing.
 */
export function problemSummary(problems) {
  if (problems.length === 0) {
    return html``;
  }
  const heading = onlyDates(problems) ? "Check the dates" : "Check the filters";
  return html`<div class="error-summary" aria-labelledby="error-summary-title">
    <h2 id="error-summary-title">${heading}</h2>
    <ul>
      ${problems.map((problem) => html`<li><a href="${problemTarget(problem)}">${problemText(problem)}</a></li>`)}
    </ul>
  </div>`;
}

/**
 * @param {Problem[]} problems Field problems from the request.
 * @returns {Html} What a page shows instead of results when its filters are wrong.
 */
export function problemEmptyState(problems) {
  return emptyState({
    body: onlyDates(problems)
      ? "Fix the date range above, then apply it to see coverage."
      : "Fix the filters above, then apply them to see coverage.",
    title: "No results to show.",
  });
}

/**
 * @param {FilterForm} form Values to keep.
 * @returns {string} `window=…&verdict=…`, plus `from` and `to` for a custom window, for links that keep the filters.
 */
export function filterQuery(form) {
  const query = new URLSearchParams({
    window: form.window,
    verdict: form.verdict,
  });
  if (form.window === "custom") {
    query.set("from", form.from);
    query.set("to", form.to);
  }
  return query.toString();
}

/**
 * @param {Filters} filters A valid request.
 * @returns {string} `Last quarter: 1 Jul – 30 Sep 2026 (UTC)`.
 */
export function windowSentence(filters) {
  return `${windowLabel(filters)}: ${rangeText(filters)} (UTC)`;
}

/**
 * @param {Filters} filters A valid request.
 * @returns {string} `Last quarter (1 Jul – 30 Sep 2026, UTC)`, for captions and empty states.
 */
export function windowPhrase(filters) {
  return `${windowLabel(filters)} (${rangeText(filters)}, UTC)`;
}

/**
 * @param {"from" | "to"} name Which custom date.
 * @param {string} value Typed or prefilled day.
 * @param {Problem | undefined} problem What is wrong with it.
 * @param {boolean} focus Whether it is the first bad date.
 * @returns {Html} The labeled date input.
 */
function dateField(name, value, problem, focus) {
  return formField({
    error: problem && problemText(problem),
    focus,
    id: name,
    label: name === "from" ? "From (UTC)" : "To (UTC)",
    name,
    type: "date",
    value,
  });
}

/**
 * @param {"all" | (typeof PILL_VERDICTS)[number]} value Pill value.
 * @param {string} chosen Value in the request.
 * @returns {Html} One verdict radio.
 */
function verdictPill(value, chosen) {
  const isAll = value === "all";
  const label = isAll
    ? "All visible"
    : html`<span class="dot" aria-hidden="true"></span>${capitalized(value)}`;
  const verdictAttribute = !isAll && html` data-verdict="${value}"`;
  return html`<label class="pill" ${verdictAttribute}
    ><input
      type="radio"
      name="verdict"
      value="${value}"
      ${isAll && html` id="verdict-all"`}${chosen === value && html` checked`}
    /><span>${label}</span></label
  >`;
}

/**
 * @param {readonly ["last" | "this" | "custom", string]} option Window value and its label.
 * @param {string} chosen Value in the request.
 * @returns {Html} One segment of the window control.
 */
function windowRadio([value, label], chosen) {
  return html`<label
    ><input
      type="radio"
      name="window"
      value="${value}"
      ${value === "last" && html` id="window-last"`}${chosen === value && html` checked`}
    /><span>${label}</span></label
  >`;
}

/**
 * @param {Problem} problem A field problem.
 * @returns {string} The message, starting with the field's name.
 */
function problemText({ field, kind }) {
  if (field === "window") {
    return "Time window: choose Last quarter, This quarter, or Custom.";
  }
  if (field === "verdict") {
    return "Verdict: choose All visible, Positive, Negative, Neutral, or Unranked.";
  }
  if (kind === "order") {
    return "From date must be on or before To date.";
  }
  return field === "from"
    ? "From date: enter a date like 2026-07-01."
    : "To date: enter a date like 2026-09-30.";
}

/**
 * @param {Problem} problem A field problem.
 * @returns {string} The fragment of the control to focus.
 */
function problemTarget({ field }) {
  if (field === "window") {
    return "#window-last";
  }
  return field === "verdict" ? "#verdict-all" : `#${field}`;
}

/**
 * @param {Filters} filters A valid request.
 * @returns {string} The window's name in a sentence.
 */
function windowLabel({ window }) {
  const option = WINDOW_OPTIONS.find(([value]) => value === window);
  return window === "custom" || option === undefined
    ? "Custom range"
    : option[1];
}

/**
 * @param {Filters} filters A valid request.
 * @returns {string} First to last day of the half-open range. This quarter on its first day says `so far`.
 */
function rangeText({ window, range }) {
  const last = new Date(Math.max(range.from.getTime(), range.to.getTime() - 1));
  const text = formatRange(range.from, last);
  return window === "this" && formatDay(range.from) === formatDay(last)
    ? `${text} so far`
    : text;
}

/**
 * @param {Problem[]} problems Field problems.
 * @returns {boolean} Whether every problem is a custom date.
 */
function onlyDates(problems) {
  return problems.every(
    (problem) => problem.field === "from" || problem.field === "to",
  );
}
