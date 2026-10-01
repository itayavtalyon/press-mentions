import { readFileSync } from "node:fs";
import path from "node:path";

import {
  blockedReply,
  companyNotFoundReply,
  companyReply,
  findCompany,
  indexReply,
  pageNotFoundReply,
  reviewReply,
  serverErrorReply,
} from "./pages.js";
import { subscriptionReply } from "./subscription.js";

/**
 * Dashboard server (ADR 0008): routes, method checks, security headers, static files, and the 500 boundary.
 * What a page reads is `pages.js`. The subscribe POST is `subscription.js`. Markup is `src/ui/pages`.
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
 * @typedef {{ request: import("node:http").IncomingMessage, url: URL, dependencies: AppDependencies, now: Date }}
 *   Context One request and what answering it needs.
 */

const READ_METHODS = "GET, HEAD";
const COMPANY_PATH = /^\/companies\/([a-z0-9-]+)(\/subscriptions)?$/u;
/**
 * @type {Map<string, (context: Context) => Reply>}
 */
const PAGES = new Map([
  ["/", indexReply],
  ["/review", reviewReply],
]);
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
      reply = serverErrorReply(now);
    }
    send(response, reply);
  };
}

/**
 * @param {Context} context The request.
 * @returns {Promise<Reply>} What to answer.
 */
async function route(context) {
  const { request, url, dependencies } = context;
  const asset = dependencies.assets.get(url.pathname);
  if (asset !== undefined) {
    return isRead(request)
      ? { body: asset.body, status: 200, type: asset.type }
      : notAllowed(READ_METHODS);
  }
  const pageReply = PAGES.get(url.pathname);
  if (pageReply !== undefined) {
    return isRead(request) ? pageReply(context) : notAllowed(READ_METHODS);
  }
  const match = COMPANY_PATH.exec(url.pathname);
  if (match === null) {
    return pageNotFoundReply(context);
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
  const { request, dependencies } = context;
  if (request.method !== "POST") {
    return notAllowed("POST");
  }
  const company = findCompany(context, id);
  if (company === undefined) {
    return companyNotFoundReply(context, id);
  }
  return subscriptionReply(request, {
    alerts: dependencies.alerts,
    blocked: () => blockedReply(context),
    company,
    page: (subscription) =>
      companyReply(context, id, new URLSearchParams(), subscription),
  });
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
