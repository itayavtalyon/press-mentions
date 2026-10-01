import { parseAddress } from "../core/dashboard.js";
import { subscribe } from "../infra/alerts-store.js";
import { subscriptionMessage } from "../ui/pages/subscribe-form.js";

/**
 * Subscribe POST, `/companies/:id/subscriptions` (ADR 0008, `docs/ui-design.md` §6.3): the cross-site guard,
 * the form body, the address rule, and the insert. A form submit gets the company page. The page script
 * asks for JSON with the same form body and shows the outcome in the dialog.
 */

/**
 * @typedef {import("./app.js").Reply} Reply
 * @typedef {import("../ui/pages/subscribe-form.js").Subscription} Subscription
 * @typedef {import("../ui/pages/subscribe-form.js").Company} Company
 * @typedef {object} SubscriptionPort What the POST needs from the app.
 * @property {import("better-sqlite3").Database} alerts Alerts store.
 * @property {Company} company The company, already found.
 * @property {(subscription: Subscription) => Reply} page The company page for an outcome.
 * @property {() => Reply} blocked The 403 page.
 */

// ponytail: 4 KiB holds any address (at most 254 characters). Past it the body is drained, not stored.
const MAX_BODY_BYTES = 4096;
const FORM_TYPE = /^application\/x-www-form-urlencoded\s*(?:;|$)/iu;
const TEXT = "text/plain; charset=utf-8";

/**
 * @param {import("node:http").IncomingMessage} request The POST.
 * @param {SubscriptionPort} port Store, company, and pages.
 * @returns {Promise<Reply>} 403, 413, 415, the company page, or JSON for the page script.
 */
export async function subscriptionReply(request, port) {
  if (isCrossSite(request)) {
    return port.blocked();
  }
  if (!FORM_TYPE.test(request.headers["content-type"] ?? "")) {
    return plain(415, "Send the form as application/x-www-form-urlencoded.\n");
  }
  const body = await readBody(request);
  if (body === undefined) {
    return plain(413, "The form is larger than 4 KiB.\n");
  }
  const subscription = store(
    port,
    new URLSearchParams(body).get("email") ?? "",
  );
  return wantsJson(request)
    ? json(port.company, subscription)
    : port.page(subscription);
}

/**
 * @param {import("node:http").IncomingMessage} request The POST.
 * @returns {boolean} Whether a browser says it came from another site, or from another origin than this server.
 */
function isCrossSite(request) {
  const { origin, host } = request.headers;
  return (
    request.headers["sec-fetch-site"] === "cross-site" ||
    (origin !== undefined && origin !== `http://${String(host)}`)
  );
}

/**
 * @param {import("node:http").IncomingMessage} request The POST.
 * @returns {Promise<string | undefined>} The body as text, or undefined when it passes 4 KiB.
 */
async function readBody(request) {
  /**
   * @type {Buffer[]}
   */
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size <= MAX_BODY_BYTES) {
      chunks.push(chunk);
    }
  }
  return size <= MAX_BODY_BYTES
    ? Buffer.concat(chunks).toString("utf8")
    : undefined;
}

/**
 * @param {SubscriptionPort} port Store and company.
 * @param {string} raw Posted address.
 * @returns {Exclude<Subscription, { state: "idle" }>} The stored or existing pair, or why the address was refused.
 */
function store(port, raw) {
  const address = parseAddress(raw);
  if ("problem" in address) {
    return { problem: address.problem, state: "invalid", value: raw };
  }
  return {
    email: address.email,
    state: subscribe(port.alerts, port.company.id, address.email),
  };
}

/**
 * @param {import("node:http").IncomingMessage} request The POST.
 * @returns {boolean} Whether the page script asked for JSON.
 */
function wantsJson(request) {
  return (request.headers.accept ?? "").includes("application/json");
}

/**
 * @param {Company} company The company.
 * @param {Exclude<Subscription, { state: "idle" }>} subscription The outcome.
 * @returns {Reply} `{ outcome, message }`, plus `field` for a refused address. 400 when refused.
 */
function json(company, subscription) {
  const message = subscriptionMessage(company, subscription);
  const isInvalid = subscription.state === "invalid";
  return {
    body: JSON.stringify(
      isInvalid
        ? { field: "email", message, outcome: "invalid" }
        : { message, outcome: subscription.state },
    ),
    status: isInvalid ? 400 : 200,
    type: "application/json; charset=utf-8",
  };
}

/**
 * @param {number} status HTTP status.
 * @param {string} text Body.
 * @returns {Reply} A plain-text reply.
 */
function plain(status, text) {
  return { body: text, status, type: TEXT };
}
