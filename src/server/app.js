import { readFileSync } from "node:fs";
import path from "node:path";

import { lastQuarter } from "../core/collection.js";
import { collectionStart, companyList } from "../core/dashboard.js";
import { parseFilters, VISIBLE_VERDICTS } from "../core/filters.js";
import {
  allCompanyCoverage,
  collectionBounds,
  companyCoverage,
  companyMentions,
  flaggedCount,
} from "../infra/coverage-read.js";
import { companyPage } from "../ui/pages/company-page.js";
import { indexPage } from "../ui/pages/index-page.js";
import {
  companyNotFound,
  pageNotFound,
  requestBlocked,
  serverError,
} from "../ui/pages/message-pages.js";

import { subscriptionReply } from "./subscription.js";

/**
 * Dashboard server (ADR 0008): routes, security headers, and static files. Pages are `src/ui/pages`.
 */

/**
 * @typedef {{ type: string, body: Buffer }} Asset A static file held in memory.
 * @typedef {object} AppDependencies
 * @property {import("better-sqlite3").Database} coverage Coverage store. The app only reads it.
 * @property {import("better-sqlite3").Database} alerts Alerts store. Only the subscribe POST writes it.
 * @property {import("../infra/clock.js").Clock} clock Read time.
 * @property {Map<string, Asset>} assets Static files by URL path, from `readAssets`.
 * @property {import("../infra/logger.js").Log} log Structured log.
 * @typedef {{ status: number, type: string, body: string | Buffer, allow?: string }} Reply
 * @typedef {import("../ui/pages/page.js").Shell} Shell
 * @typedef {import("../ui/pages/subscribe-form.js").Subscription} Subscription
 * @typedef {{ request: import("node:http").IncomingMessage, url: URL, dependencies: AppDependencies, now: Date }}
 *   Context One request and what answering it needs.
 */

const HTML = "text/html; charset=utf-8";
const READ_METHODS = "GET, HEAD";
const COMPANY_PATH = /^\/companies\/([a-z0-9-]+)(\/subscriptions)?$/u;
const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";
/**
 * @type {readonly [string, string][]}
 */
const ASSET_FILES = [["app.css", "text/css; charset=utf-8"]];

/**
 * Reads the static files once, at startup.
 * @param {string} directory `src/ui/browser`.
 * @returns {Map<string, Asset>} Each file under `/<name>`.
 * @throws {Error} A file is missing.
 */
export function readAssets(directory) {
  return new Map(
    ASSET_FILES.map(([name, type]) => [
      `/${name}`,
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Names come from ASSET_FILES only.
      { body: readFileSync(path.join(directory, name)), type },
    ]),
  );
}

/**
 * @param {AppDependencies} dependencies Store, clock, files, and log.
 * @returns {import("node:http").RequestListener} The request handler.
 */
export function createApp(dependencies) {
  return async (request, response) => {
    const now = new Date(dependencies.clock.now());
    const url = new URL(`http://localhost${String(request.url)}`);
    let reply;
    try {
      reply = await route({ dependencies, now, request, url });
    } catch (error) {
      // The HTTP boundary: log the failure and answer 500, so one bad request does not stop the server.
      dependencies.log("server.error", {
        error: String(error),
        path: request.url,
      });
      reply = page(
        500,
        serverError({ collection: "unknown", flagged: 0, now }),
      );
    }
    send(response, reply);
  };
}

/**
 * @param {Context} context The request.
 * @returns {Promise<Reply>} What to answer.
 */
async function route(context) {
  const { request, url, dependencies, now } = context;
  const asset = dependencies.assets.get(url.pathname);
  if (asset !== undefined) {
    return isRead(request)
      ? { body: asset.body, status: 200, type: asset.type }
      : notAllowed(READ_METHODS);
  }
  if (url.pathname === "/") {
    return isRead(request)
      ? index(url.searchParams, dependencies, now)
      : notAllowed(READ_METHODS);
  }
  const match = COMPANY_PATH.exec(url.pathname);
  if (match === null) {
    return page(404, pageNotFound(shell(dependencies, now), url.pathname));
  }
  const [, id = ""] = match;
  return match[2] === undefined
    ? companyRoute(context, id)
    : subscriptionRoute(context, id);
}

/**
 * @param {Context} context The request.
 * @param {string} id Company slug.
 * @returns {Reply} The company page, or 405.
 */
function companyRoute(context, id) {
  return isRead(context.request)
    ? companyReply(context, id, context.url.searchParams, { state: "idle" })
    : notAllowed(READ_METHODS);
}

/**
 * @param {Context} context The request.
 * @param {string} id Company slug.
 * @returns {Promise<Reply>} The subscribe outcome, 404 for an unknown company, or 405.
 */
async function subscriptionRoute(context, id) {
  const { request, dependencies, now } = context;
  if (request.method !== "POST") {
    return notAllowed("POST");
  }
  const company = companyCoverage(dependencies.coverage, id, defaultQuery(now));
  if (company === undefined) {
    return page(404, companyNotFound(shell(dependencies, now), id));
  }
  return subscriptionReply(request, {
    alerts: dependencies.alerts,
    blocked: () => page(403, requestBlocked(shell(dependencies, now))),
    company,
    page: (subscription) =>
      companyReply(context, id, new URLSearchParams(), subscription),
  });
}

/**
 * @param {Context} context The request.
 * @param {string} id Company slug.
 * @param {URLSearchParams} query Filters for the page.
 * @param {Subscription} subscription What a subscribe POST did, or idle.
 * @returns {Reply} The company page, 400 for bad filters or a refused address, or 404.
 */
function companyReply(context, id, query, subscription) {
  const { dependencies, now } = context;
  const frame = shell(dependencies, now);
  const result = parseFilters(query, now);
  const filters = "filters" in result ? result.filters : undefined;
  const company = companyCoverage(
    dependencies.coverage,
    id,
    filters ?? defaultQuery(now),
  );
  if (company === undefined) {
    return page(404, companyNotFound(frame, id));
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
    companyPage(frame, {
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
 * @param {URLSearchParams} query Request query.
 * @param {AppDependencies} dependencies Store, clock, files, and log.
 * @param {Date} now Read time.
 * @returns {Reply} The index, or 400 with the filter problems.
 */
function index(query, dependencies, now) {
  const result = parseFilters(query, now);
  const frame = shell(dependencies, now);
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
 * @param {AppDependencies} dependencies Store, clock, files, and log.
 * @param {Date} now Read time.
 * @returns {Shell} Nav count and footer state from the store.
 */
function shell(dependencies, now) {
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
 * @param {import("node:http").IncomingMessage} request Request.
 * @returns {boolean} Whether it is GET or HEAD.
 */
function isRead(request) {
  return request.method === "GET" || request.method === "HEAD";
}

/**
 * @param {string} allow Methods the path takes.
 * @returns {Reply} 405 with `Allow`.
 */
function notAllowed(allow) {
  return {
    allow,
    body: "Method not allowed\n",
    status: 405,
    type: "text/plain; charset=utf-8",
  };
}

/**
 * @param {number} status HTTP status.
 * @param {{ toString(): string }} markup Rendered page.
 * @returns {Reply} An HTML reply.
 */
function page(status, markup) {
  return { body: String(markup), status, type: HTML };
}

/**
 * Writes the reply with the security headers. Node drops the body of a HEAD response itself.
 * @param {import("node:http").ServerResponse} response Response.
 * @param {Reply} reply What to answer.
 * @returns {void}
 */
function send(response, reply) {
  response.writeHead(reply.status, {
    "Content-Length": Buffer.byteLength(reply.body),
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    "Content-Type": reply.type,
    // same-origin, not no-referrer: under no-referrer browsers send `Origin: null` on our own form posts,
    // and the subscribe guard refuses null. Other sites still get no referrer.
    "Referrer-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    ...(reply.allow !== undefined && { Allow: reply.allow }),
  });
  response.end(reply.body);
}
