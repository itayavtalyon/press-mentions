import { lastMentionedDays, tally } from "../../core/dashboard.js";

import {
  filterForm,
  filterQuery,
  problemEmptyState,
  problemSummary,
  windowPhrase,
  windowSentence,
} from "./filter-form.js";
import { html } from "./markup.js";
import { formatDay, layout, plural } from "./page.js";
import { ago, capitalized, emptyState, tallyText, tones } from "./parts.js";

/**
 * Index page, `GET /` (`docs/ui-design.md` §6.1): every company with last mentioned and the window tally.
 */

/**
 * @typedef {import("./page.js").Shell} Shell
 * @typedef {ReturnType<typeof html>} Html
 * @typedef {import("../../core/dashboard.js").CompanyCoverage} CompanyCoverage
 * @typedef {import("../../core/filters.js").Filters} Filters
 * @typedef {import("../../core/filters.js").FilterForm} FilterForm
 * @typedef {import("../../core/filters.js").Problem} Problem
 * @typedef {object} IndexView A valid request and its rows.
 * @property {Filters} filters The request.
 * @property {FilterForm} form Values the form shows.
 * @property {CompanyCoverage[]} rows Rows to list, already filtered and sorted.
 * @property {boolean} anyMention Whether the store holds any visible mention at all.
 * @typedef {{ form: FilterForm, problems: Problem[] }} IndexProblems A request with bad filters.
 */

const TITLE = "Portfolio coverage";

/**
 * @param {Shell} shell Shell state.
 * @param {IndexView | IndexProblems} view Rows to show, or what was wrong with the request.
 * @returns {Html} The whole page. The caller answers 400 when `view` has problems.
 */
export function indexPage(shell, view) {
  const header = html`<div class="page-header">
    <h1>${TITLE}</h1>
    <p class="page-header__lede">
      Press mentions for each portfolio company, classified by tone.
    </p>
  </div>`;
  if ("problems" in view) {
    const problemForm = filterForm({ action: "/", ...view });
    return layout({
      ...shell,
      body: html`${header}${problemSummary(view.problems)}${problemForm}
        <div class="results-gap">${problemEmptyState(view.problems)}</div>`,
      current: "companies",
      title: `Error: ${TITLE}`,
    });
  }
  const form = filterForm({ action: "/", form: view.form, problems: [] });
  return layout({
    ...shell,
    body: html`${header}${form}
      <p class="window-sentence">${windowSentence(view.filters)}</p>
      ${panel(shell, view)}${results(shell, view)}`,
    current: "companies",
    title: TITLE,
  });
}

/**
 * @param {Shell} shell Shell state.
 * @param {IndexView} view The request and its rows.
 * @returns {Html | undefined} The note shown before collection or classification has produced a mention.
 */
function panel(shell, view) {
  if (shell.collection === "not-run") {
    return notePanel(
      "Collection has not run yet.",
      "Companies fill in here after the first collection and classification run.",
    );
  }
  return view.anyMention
    ? undefined
    : notePanel(
        "No mentions yet.",
        "Articles are being collected, and companies fill in here as they're classified.",
      );
}

/**
 * @param {Shell} shell Shell state.
 * @param {IndexView} view The request and its rows.
 * @returns {Html | undefined} The table with its name filter, the empty state when a verdict leaves no
 *   company, or nothing when the store has no company yet (the panel says why).
 */
function results(shell, view) {
  const { filters, form, rows } = view;
  if (rows.length === 0) {
    const showAll = `/?${filterQuery({ ...form, verdict: "all" })}`;
    return filters.verdict === "all"
      ? undefined
      : emptyState({
          actions: html`<a href="${showAll}">Show all verdicts</a>`,
          title: `No ${filters.verdict} mentions in ${windowPhrase(filters)}.`,
        });
  }
  const verdict =
    filters.verdict === "all" ? "All visible" : capitalized(filters.verdict);
  // intentional: the same words as `countText` in src/ui/browser/name-filter.js, which runs in the page and
  // is not imported by the server.
  const count = `Showing ${rows.length} of ${plural(rows.length, "company", "companies")}`;
  return html`${nameFilterTools(count)}
    <table class="companies" id="companies" role="table">
      <caption>
        ${verdict} mentions, ${windowPhrase(filters)}
      </caption>
      <thead role="rowgroup">
        <tr role="row">
          <th role="columnheader" scope="col" class="col-company">Company</th>
          <th role="columnheader" scope="col" class="col-last">
            Last mentioned
          </th>
          <th role="columnheader" scope="col">Coverage</th>
        </tr>
      </thead>
      <tbody role="rowgroup">
        ${rows.map((row) => companyRow(row, form, shell.now))}
      </tbody>
    </table>
    ${footnote(shell, view)} ${nameFilterEmpty()}`;
}

/**
 * @param {string} count `Showing N of N companies`.
 * @returns {Html} The name filter, hidden until the page script shows it.
 */
function nameFilterTools(count) {
  return html`<div class="table-tools" data-name-filter hidden>
    <div class="field">
      <label for="name-filter">Filter by name</label>
      <input
        class="input"
        type="search"
        id="name-filter"
        placeholder="Name or alias"
        autocomplete="off"
        aria-controls="companies"
      />
    </div>
    <p
      class="table-tools__count"
      id="name-filter-count"
      role="status"
      aria-live="polite"
    >
      ${count}
    </p>
  </div>`;
}

/**
 * @returns {Html} The state the page script shows when no name matches.
 */
function nameFilterEmpty() {
  return html`<div id="name-filter-empty" data-name-filter-empty hidden>
    <div class="empty-state">
      <p class="empty-state__title">
        No companies match “<span data-query></span>”.
      </p>
      <p class="empty-state__actions">
        <button type="button" class="link-button" data-clear-filter>
          Clear filter
        </button>
      </p>
    </div>
  </div>`;
}

/**
 * @param {CompanyCoverage} row One company.
 * @param {FilterForm} form Filters its link keeps.
 * @param {Date} now Read time.
 * @returns {Html} One table row.
 */
function companyRow(row, form, now) {
  const href = `/companies/${encodeURIComponent(row.id)}?${filterQuery(form)}`;
  const search = [row.displayName, ...row.aliases].join(" ").toLowerCase();
  const aliases =
    row.aliases.length > 0 &&
    html`<span class="company-aliases">Also ${row.aliases.join(", ")}</span>`;
  return html`<tr role="row" data-search="${search}">
    <th role="rowheader" scope="row">
      <a class="company-name" href="${href}">${row.displayName}</a>${aliases}
    </th>
    <td role="cell">
      <span class="cell-label" aria-hidden="true">Last mentioned</span
      >${lastMentionedCell(row.lastMentionedAt, now)}
    </td>
    <td role="cell">
      <span class="cell-label" aria-hidden="true">Coverage</span
      >${coverageCell(row)}
    </td>
  </tr>`;
}

/**
 * @param {string | undefined} lastMentionedAt Newest visible mention.
 * @param {Date} now Read time.
 * @returns {Html} `Today`, `3 days ago`, or `No coverage`.
 */
function lastMentionedCell(lastMentionedAt, now) {
  if (lastMentionedAt === undefined) {
    return html`<span class="muted">No coverage</span>`;
  }
  const text = capitalized(ago(lastMentionedDays(lastMentionedAt, now)));
  return html`<time datetime="${lastMentionedAt}">${text}</time>`;
}

/**
 * @param {CompanyCoverage} row One company.
 * @returns {Html} The window tally and tones, or that the window is empty.
 */
function coverageCell(row) {
  const counts = tally(row.counts);
  return counts.mentions === 0
    ? html`<span class="muted">No mentions in this window</span>`
    : html`<div class="coverage">
        <span class="tally">${tallyText(counts)}</span
        >${tones(counts)}${toneBar(counts)}
      </div>`;
}

/**
 * @param {import("../../core/dashboard.js").Tally} tally Window tally.
 * @returns {Html | false} The share of rated tone as one bar, or nothing when no mention is rated. The
 *   tone counts beside it carry the meaning, so it is hidden from screen readers.
 */
function toneBar({ positive, neutral, negative, rated }) {
  return (
    rated > 0 &&
    html`<svg
      class="tone-bar"
      viewBox="0 0 ${rated} 1"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect data-verdict="positive" width="${positive}" height="1" />
      <rect
        data-verdict="neutral"
        x="${positive}"
        width="${neutral}"
        height="1"
      />
      <rect
        data-verdict="negative"
        x="${positive + neutral}"
        width="${negative}"
        height="1"
      />
    </svg>`
  );
}

/**
 * @param {Shell} shell Shell state.
 * @param {IndexView} view The request and its rows.
 * @returns {Html | undefined} What "No coverage" means, when a listed company has none.
 */
function footnote(shell, { anyMention, rows }) {
  const start = shell.collection;
  const needed =
    start instanceof Date &&
    anyMention &&
    rows.some((row) => row.lastMentionedAt === undefined);
  return needed
    ? html`<p class="table-footnote">
        “No coverage” means nothing found since ${formatDay(start)}, when
        collection started.
      </p>`
    : undefined;
}

/**
 * @param {string} title What is true.
 * @param {string} body What happens next.
 * @returns {Html} The neutral info panel.
 */
function notePanel(title, body) {
  return html`<div class="banner" data-verdict="neutral" role="note">
    <span class="banner__icon" aria-hidden="true">i</span>
    <div>
      <p class="banner__title">${title}</p>
      <p class="banner__body">${body}</p>
    </div>
  </div>`;
}
