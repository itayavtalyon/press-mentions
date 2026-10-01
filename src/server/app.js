import { readFileSync } from "node:fs";
import path from "node:path";

import { collectionStart, companyList } from "../core/dashboard.js";
import { parseFilters } from "../core/filters.js";
import {
  allCompanyCoverage,
  collectionBounds,
  flaggedCount,
} from "../infra/coverage-read.js";
import { indexPage } from "../ui/pages/index-page.js";
import { pageNotFound, serverError } from "../ui/pages/message-pages.js";

/**
 * Dashboard server (ADR 0008): routes, security headers, and static files. Pages are `src/ui/pages`.
 */

/**
 * @typedef {{ type: string, body: Buffer }} Asset A static file held in memory.
 * @typedef {object} AppDependencies
 * @property {import("better-sqlite3").Database} coverage Coverage store. The app only reads it.
 * @property {import("../infra/clock.js").Clock} clock Read time.
 * @property {Map<string, Asset>} assets Static files by URL path, from `readAssets`.
 * @property {import("../infra/logger.js").Log} log Structured log.
 * @typedef {{ status: number, type: string, body: string | Buffer, allow?: string }} Reply
 * @typedef {import("../ui/pages/page.js").Shell} Shell
 */

const HTML = "text/html; charset=utf-8";
const ALLOWED_METHODS = "GET, HEAD";
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
  return (request, response) => {
    const now = new Date(dependencies.clock.now());
    let reply;
    try {
      reply = route(request, dependencies, now);
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
 * @param {import("node:http").IncomingMessage} request Request.
 * @param {AppDependencies} dependencies Store, clock, files, and log.
 * @param {Date} now Read time.
 * @returns {Reply} What to answer.
 */
function route(request, dependencies, now) {
  const url = new URL(`http://localhost${String(request.url)}`);
  const asset = dependencies.assets.get(url.pathname);
  if (asset === undefined && url.pathname !== "/") {
    return page(404, pageNotFound(shell(dependencies, now), url.pathname));
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return {
      allow: ALLOWED_METHODS,
      body: "Method not allowed\n",
      status: 405,
      type: "text/plain; charset=utf-8",
    };
  }
  return asset === undefined
    ? index(url.searchParams, dependencies, now)
    : { body: asset.body, status: 200, type: asset.type };
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
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    ...(reply.allow !== undefined && { Allow: reply.allow }),
  });
  response.end(reply.body);
}
