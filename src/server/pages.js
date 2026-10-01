import { lastQuarter } from "../core/collection.js";
import { collectionStart, companyList } from "../core/dashboard.js";
import { parseFilters, VISIBLE_VERDICTS } from "../core/filters.js";
import {
  allCompanyCoverage,
  collectionBounds,
  companyCoverage,
  companyMentions,
  flaggedCount,
  flaggedRows,
} from "../infra/coverage-read.js";
import { companyPage } from "../ui/pages/company-page.js";
import { indexPage } from "../ui/pages/index-page.js";
import {
  companyNotFound,
  pageNotFound,
  requestBlocked,
  serverError,
} from "../ui/pages/message-pages.js";
import { reviewPage } from "../ui/pages/review-page.js";

/**
 * Page replies (ADR 0008): what each page reads from the stores, and its status. HTTP itself is `app.js`.
 */

/**
 * @typedef {import("./app.js").Context} Context
 * @typedef {import("./app.js").Reply} Reply
 * @typedef {import("../ui/pages/page.js").Shell} Shell
 * @typedef {import("../ui/pages/subscribe-form.js").Subscription} Subscription
 * @typedef {import("../core/dashboard.js").CompanyCoverage} CompanyCoverage
 */

const HTML = "text/html; charset=utf-8";

/**
 * @param {Context} context The request.
 * @returns {Reply} The index, or 400 with the filter problems.
 */
export function indexReply(context) {
  const { dependencies, now, url } = context;
  const frame = shell(context);
  const result = parseFilters(url.searchParams, now);
  if ("problems" in result) {
    return page(400, indexPage(frame, result));
  }
  const all = allCompanyCoverage(dependencies.coverage, result.filters);
  return page(
    200,
    indexPage(frame, {
      anyMention: all.some((row) => row.lastMentionedAt !== undefined),
      filters: result.filters,
      form: result.form,
      rows: companyList(all, result.filters),
    }),
  );
}

/**
 * @param {Context} context The request.
 * @param {string} id Company slug.
 * @param {URLSearchParams} query Filters for the page.
 * @param {Subscription} subscription What a subscribe POST did, or idle.
 * @returns {Reply} The company page, 400 for bad filters or a refused address, or 404.
 */
export function companyReply(context, id, query, subscription) {
  const { dependencies, now } = context;
  const result = parseFilters(query, now);
  const filters = "filters" in result ? result.filters : undefined;
  const company = companyCoverage(
    dependencies.coverage,
    id,
    filters ?? defaultQuery(now),
  );
  if (company === undefined) {
    return companyNotFoundReply(context, id);
  }
  const problems = "problems" in result ? result.problems : [];
  const mentions =
    filters === undefined
      ? []
      : companyMentions(dependencies.coverage, id, filters);
  const status =
    problems.length > 0 || subscription.state === "invalid" ? 400 : 200;
  return page(
    status,
    companyPage(shell(context), {
      company,
      filters,
      form: result.form,
      mentions,
      problems,
      subscription,
    }),
  );
}

/**
 * @param {Context} context The request.
 * @returns {Reply} Every `uncertain` row with its raw reply.
 */
export function reviewReply(context) {
  return page(
    200,
    reviewPage(shell(context), flaggedRows(context.dependencies.coverage)),
  );
}

/**
 * @param {Context} context The request.
 * @param {string} id Company slug.
 * @returns {CompanyCoverage | undefined} The company, or undefined when no company has that id.
 */
export function findCompany(context, id) {
  return companyCoverage(
    context.dependencies.coverage,
    id,
    defaultQuery(context.now),
  );
}

/**
 * @param {Context} context The request.
 * @returns {Reply} 404 for a path with no page.
 */
export function pageNotFoundReply(context) {
  return page(404, pageNotFound(shell(context), context.url.pathname));
}

/**
 * @param {Context} context The request.
 * @param {string} id Company slug.
 * @returns {Reply} 404 for a company id with no company.
 */
export function companyNotFoundReply(context, id) {
  return page(404, companyNotFound(shell(context), id));
}

/**
 * @param {Context} context The request.
 * @returns {Reply} 403 for a form posted from another site.
 */
export function blockedReply(context) {
  return page(403, requestBlocked(shell(context)));
}

/**
 * @param {Date} now Render time.
 * @returns {Reply} 500. It reads no store, since the store may be what failed.
 */
export function serverErrorReply(now) {
  return page(500, serverError({ collection: "unknown", flagged: 0, now }));
}

/**
 * @param {Context} context The request.
 * @returns {Shell} Nav count and footer state from the store.
 */
function shell({ dependencies, now }) {
  return {
    collection:
      collectionStart(collectionBounds(dependencies.coverage)) ?? "not-run",
    flagged: flaggedCount(dependencies.coverage),
    now,
  };
}

/**
 * @param {Date} now Read time.
 * @returns {import("../core/filters.js").CoverageQuery} Last quarter, every visible verdict.
 */
function defaultQuery(now) {
  return { range: lastQuarter(now), verdicts: VISIBLE_VERDICTS };
}

/**
 * @param {number} status HTTP status.
 * @param {{ toString(): string }} markup Rendered page.
 * @returns {Reply} An HTML reply.
 */
function page(status, markup) {
  return { body: String(markup), status, type: HTML };
}
