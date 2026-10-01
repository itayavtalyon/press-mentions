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
import { mentionSections } from "./mention.js";
import { formatDay, layout } from "./page.js";
import { ago, emptyState, tallyText, tones } from "./parts.js";
import {
  subscribeBanner,
  subscribeButton,
  subscribeDialog,
  subscribeInline,
} from "./subscribe-form.js";

/**
 * Company page, `GET /companies/:id` (`docs/ui-design.md` §6.2): who the company is, last mentioned, the
 * window tally, and its mentions. The mention list is `mention.js`. Subscribing is `subscribe-form.js`.
 */

/**
 * @typedef {import("./page.js").Shell} Shell
 * @typedef {ReturnType<typeof html>} Html
 * @typedef {import("../../core/dashboard.js").CompanyCoverage} CompanyCoverage
 * @typedef {import("../../infra/coverage-read.js").MentionRow} MentionRow
 * @typedef {import("../../core/filters.js").Filters} Filters
 * @typedef {import("../../core/filters.js").FilterForm} FilterForm
 * @typedef {import("../../core/filters.js").Problem} Problem
 * @typedef {import("./subscribe-form.js").Subscription} Subscription
 * @typedef {object} CompanyView
 * @property {CompanyCoverage} company The company, with counts for the window when the filters are valid.
 * @property {FilterForm} form Values the form shows.
 * @property {Filters | undefined} filters The request, or undefined when it has problems.
 * @property {Problem[]} problems What is wrong with the filters.
 * @property {MentionRow[]} mentions Visible mentions in the window, newest first.
 * @property {Subscription} subscription What the subscribe request did, if there was one.
 */

const SUMMARY_NOTE =
  "Counts cover the selected window. “Last mentioned” covers all collected data.";

/**
 * @param {Shell} shell Shell state.
 * @param {CompanyView} view The company, the request, and its mentions.
 * @returns {Html} The whole page. The caller answers 400 when the filters or the address have problems.
 */
export function companyPage(shell, view) {
  const { company, filters, form, problems, subscription } = view;
  const isInvalid = subscription.state === "invalid";
  const back = filters === undefined ? "/" : `/?${filterQuery(form)}`;
  const banner =
    (subscription.state === "created" || subscription.state === "exists") &&
    subscribeBanner(company, subscription);
  const action = isInvalid
    ? subscribeInline(company, subscription)
    : html`<div class="subscribe-action">${subscribeButton()}</div>`;
  const results =
    filters === undefined
      ? html`<div class="results-gap">${problemEmptyState(problems)}</div>`
      : html`<p class="window-sentence">${windowSentence(filters)}</p>
          ${mentionList(shell, view, filters)}`;
  return layout({
    ...shell,
    body: html`${banner}
      <a class="back-link" href="${back}"
        ><span aria-hidden="true">←&nbsp;</span>All companies</a
      >
      <div class="company-intro">
        ${companyHead(company)}${summary(shell, company, filters)}${action}
      </div>
      ${!isInvalid && subscribeDialog(company)}${problemSummary(problems)}
      ${filterForm({ action: `/companies/${company.id}`, form, problems })}
      ${results}`,
    current: "companies",
    title: `${titlePrefix(view)}${company.displayName}`,
  });
}

/**
 * @param {CompanyView} view The page state.
 * @returns {string} `Error: `, `Subscribed: `, or nothing, for the title a screen reader announces on load.
 */
function titlePrefix({ problems, subscription }) {
  if (problems.length > 0 || subscription.state === "invalid") {
    return "Error: ";
  }
  return subscription.state === "idle" ? "" : "Subscribed: ";
}

/**
 * @param {CompanyCoverage} company The company.
 * @returns {Html} Name, aliases, and the overlay descriptor.
 */
function companyHead(company) {
  const aliases =
    company.aliases.length > 0 &&
    html`<p class="company-head__aliases">
      Also known as ${company.aliases.join(", ")}
    </p>`;
  const descriptor =
    company.descriptor !== undefined &&
    html`<p class="company-head__descriptor">${company.descriptor}</p>`;
  return html`<div class="company-head">
    <h1>${company.displayName}</h1>
    ${aliases}${descriptor}
  </div>`;
}

/**
 * @param {Shell} shell Shell state.
 * @param {CompanyCoverage} company The company.
 * @param {Filters | undefined} filters The request. Without it the card shows last mentioned only.
 * @returns {Html} The summary card.
 */
function summary(shell, company, filters) {
  const counts = tally(company.counts);
  const window =
    filters !== undefined &&
    html`<p class="summary__tally">
        <span class="tally">${tallyText(counts)}</span>${tones(counts)}
      </p>
      <p class="summary__note">${SUMMARY_NOTE}</p>`;
  return html`<div class="summary card">
    <p class="summary__status">${lastMentioned(shell, company)}</p>
    ${window}
  </div>`;
}

/**
 * @param {Shell} shell Shell state.
 * @param {CompanyCoverage} company The company.
 * @returns {string} `Last mentioned today`, `No coverage found since 1 Jul 2026`, or that collection has not run.
 */
function lastMentioned(shell, { lastMentionedAt }) {
  if (lastMentionedAt !== undefined) {
    return `Last mentioned ${ago(lastMentionedDays(lastMentionedAt, shell.now))}`;
  }
  return shell.collection instanceof Date
    ? `No coverage found since ${formatDay(shell.collection)}`
    : "Collection has not run yet";
}

/**
 * @param {Shell} shell Shell state.
 * @param {CompanyView} view The page state.
 * @param {Filters} filters The valid request.
 * @returns {Html} The mention list, or the empty state.
 */
function mentionList(shell, view, filters) {
  return view.mentions.length === 0
    ? emptyMentions(shell, view, filters)
    : mentionSections(view.mentions);
}

/**
 * @param {Shell} shell Shell state.
 * @param {CompanyView} view The page state.
 * @param {Filters} filters The valid request.
 * @returns {Html} What the window holds for this company, and where to look instead.
 */
function emptyMentions(shell, { company, form }, filters) {
  const path = `/companies/${company.id}`;
  const verdict = filters.verdict === "all" ? "" : `${filters.verdict} `;
  const today = shell.now.toISOString().slice(0, 10);
  const start = shell.collection instanceof Date && shell.collection;
  const actions = [
    filters.window !== "last" &&
      html`<a href="${path}?${filterQuery({ ...form, window: "last" })}"
        >Show last quarter</a
      >`,
    start &&
      html`<a
        href="${path}?${filterQuery({ ...form, from: start.toISOString().slice(0, 10), to: today, window: "custom" })}"
        >Show all coverage since ${formatDay(start)}</a
      >`,
    filters.verdict !== "all" &&
      html`<a href="${path}?${filterQuery({ ...form, verdict: "all" })}"
        >Show all verdicts</a
      >`,
  ];
  return emptyState({
    actions: html`${actions}`,
    title: `No ${verdict}mentions of ${company.displayName} in ${windowPhrase(filters)}.`,
  });
}
