/**
 * Backoff policy (ADR 0006). An item that exhausts it stays retryable for the next run.
 */
const POLICY = {
  maxAttempts: 5,
  baseDelayMs: 2000,
  maxDelayMs: 300_000,
  timeoutMs: 30_000,
};

/**
 * A non-transient HTTP status, such as 400, 401, 403, or 404. Not retried.
 */
export class HttpStatusError extends Error {
  /**
   * @param {string} url Requested URL.
   * @param {number} status Response status.
   */
  constructor(url, status) {
    super(`HTTP ${status} from ${url}`);
    this.name = "HttpStatusError";
    this.status = status;
  }
}

/**
 * The host kept throttling or failing transiently until the backoff ran out. Retryable on the next run.
 */
export class ThrottledError extends Error {
  /**
   * @param {string} host Throttling host.
   * @param {string} reason Last transient failure.
   */
  constructor(host, reason) {
    super(`${host} still throttling after backoff: ${reason}`);
    this.name = "ThrottledError";
    this.host = host;
  }
}

/**
 * @typedef {object} HttpClient
 * @property {(url: string, options?: { isBlocked?: (response: Response) => boolean }) => Promise<string>} getText
 *   GETs a URL through the rate limiter. `isBlocked` marks a 2xx response that is really a block or consent page.
 */

/**
 * @typedef {object} HttpDependencies
 * @property {typeof fetch} fetch Fetch implementation.
 * @property {import("./rate-limiter.js").RateLimiter} limiter Per-host limiter.
 * @property {import("./clock.js").Clock} clock Time port, for `Retry-After` dates.
 * @property {() => number} random Jitter source in `[0, 1)`.
 */

/**
 * Creates the throttle-aware HTTP client (ADR 0006). 429, 5xx, a network error, a timeout, or a blocked page
 * backs off: `Retry-After` when present, otherwise exponential with jitter, and the whole host waits.
 * @param {HttpDependencies} dependencies Dependencies.
 * @returns {HttpClient} The client.
 */
export function createHttpClient(dependencies) {
  return {
    getText: (url, options = {}) =>
      getText(dependencies, url, options.isBlocked ?? (() => false)),
  };
}

/**
 * @param {HttpDependencies} dependencies Dependencies.
 * @param {string} url URL.
 * @param {(response: Response) => boolean} isBlocked Block-page detector.
 * @returns {Promise<string>} The response body.
 */
async function getText(dependencies, url, isBlocked) {
  const { host } = new URL(url);
  let reason = "";
  for (let attempt = 0; attempt < POLICY.maxAttempts; attempt += 1) {
    await dependencies.limiter.take(host);
    const outcome = await attemptOnce(dependencies, url, isBlocked);
    if (outcome.text !== undefined) {
      return outcome.text;
    }
    reason = outcome.reason;
    const wait =
      outcome.retryAfterMs ?? backoffMs(attempt, dependencies.random);
    if (wait > POLICY.maxDelayMs) {
      break;
    }
    dependencies.limiter.pause(host, wait);
  }
  throw new ThrottledError(host, reason);
}

/**
 * @param {HttpDependencies} dependencies Dependencies.
 * @param {string} url URL.
 * @param {(response: Response) => boolean} isBlocked Block-page detector.
 * @returns {Promise<{ text: string } | { text?: undefined, reason: string, retryAfterMs: number | undefined }>}
 *   The body, or why this attempt should be retried.
 */
async function attemptOnce(dependencies, url, isBlocked) {
  let response;
  try {
    response = await dependencies.fetch(url, {
      signal: AbortSignal.timeout(POLICY.timeoutMs),
    });
  } catch (error) {
    return { reason: `network: ${String(error)}`, retryAfterMs: undefined };
  }
  if (response.status === 429 || response.status >= 500) {
    return {
      reason: `HTTP ${response.status}`,
      retryAfterMs: parseRetryAfter(
        response.headers.get("retry-after"),
        dependencies.clock.now(),
      ),
    };
  }
  if (!response.ok) {
    throw new HttpStatusError(url, response.status);
  }
  if (isBlocked(response)) {
    return {
      reason: `blocked page at ${response.url}`,
      retryAfterMs: undefined,
    };
  }
  return { text: await response.text() };
}

/**
 * @param {string | null} header `Retry-After`: seconds or an HTTP date.
 * @param {number} now Milliseconds since the epoch.
 * @returns {number | undefined} Milliseconds to wait, or undefined when absent or unreadable.
 */
function parseRetryAfter(header, now) {
  const value = header?.trim() ?? "";
  const ms = /^\d+$/u.test(value)
    ? Number(value) * 1000
    : Date.parse(value) - now;
  return Number.isNaN(ms) ? undefined : Math.max(0, ms);
}

/**
 * @param {number} attempt Zero-based attempt that just failed.
 * @param {() => number} random Jitter source in `[0, 1)`.
 * @returns {number} Half to all of `base * 2^attempt`, capped at the maximum delay.
 */
function backoffMs(attempt, random) {
  return (
    Math.min(POLICY.maxDelayMs, POLICY.baseDelayMs * 2 ** attempt) *
    (0.5 + random() / 2)
  );
}
