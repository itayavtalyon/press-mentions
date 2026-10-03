import { RefusedUrlError } from "../infra/article-fetcher.js";
import { openCoverageStore } from "../infra/coverage-store.js";
import { HttpStatusError, ThrottledError } from "../infra/http.js";
import { withCommandLock } from "../infra/lock.js";
import {
  articlesAtStage,
  articlesRemaining,
  leaveForRetry,
  saveBodyHtml,
  saveTitlePath,
} from "../infra/stage-queue.js";

/**
 * Consecutive exhausted backoffs that stop one publisher host for the rest of the run (ADR 0006).
 */
const STAGE_STOP_AFTER = 3;

/**
 * @typedef {object} FetchDependencies
 * @property {import("../infra/article-fetcher.js").ArticleFetcher} articles Publisher fetcher.
 * @property {import("../infra/logger.js").Log} log Structured logger.
 */

/**
 * @typedef {object} FetchSummary
 * @property {number} fetched Pages stored.
 * @property {number} titled Rows sent to classify on the title path.
 * @property {number} retried Rows left queued after an exhausted backoff.
 * @property {number} terminal Rows made terminal by a third exhausted run.
 * @property {number} skipped Rows not requested because their host had already stopped.
 * @property {number} moved Rows that were no longer at `fetch`.
 * @property {number} remaining Retryable rows still at `fetch`.
 * @property {string[]} stoppedHosts Hosts this run stopped fetching.
 */

/**
 * @typedef {object} FetchOutcome
 * @property {"fetched" | "titled" | "retried" | "terminal" | "skipped" | "moved"} kind What happened.
 * @property {string} [host] Host whose in-run throttle count changes.
 * @property {"reset" | "throttle"} [hostEffect] Whether that count resets or increments.
 */

/**
 * Fetches publisher pages for articles at stage `fetch`. It does not unwrap, extract, or classify.
 * @param {{ coverageDatabase: string }} config Coverage settings.
 * @param {FetchDependencies} dependencies Ports.
 * @returns {Promise<FetchSummary>} What happened.
 * @throws {Error} Another fetch holds the lock, or the fetcher threw something other than a known HTTP failure.
 */
export async function runFetch(config, dependencies) {
  return withCommandLock(config.coverageDatabase, "fetch", async () => {
    const database = openCoverageStore(config.coverageDatabase);
    try {
      return await fetchAll(database, dependencies);
    } finally {
      database.close();
    }
  });
}

/**
 * @param {FetchSummary} summary Result of runFetch.
 * @returns {number} 0 when no retryable row remains at `fetch`.
 */
export function exitCode(summary) {
  return summary.remaining === 0 ? 0 : 1;
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {FetchDependencies} dependencies Ports.
 * @returns {Promise<FetchSummary>} What happened.
 */
async function fetchAll(database, dependencies) {
  /**
   * @type {FetchSummary}
   */
  let summary = {
    fetched: 0,
    moved: 0,
    remaining: 0,
    retried: 0,
    skipped: 0,
    stoppedHosts: [],
    terminal: 0,
    titled: 0,
  };
  /**
   * @type {Map<string, number>}
   */
  const throttledInARow = new Map();
  /**
   * @type {Set<string>}
   */
  const stopped = new Set();
  for (const article of articlesAtStage(database, "fetch")) {
    const outcome = await fetchOne(database, article, dependencies, stopped);
    summary = withKind(summary, outcome.kind);
    noteHost(outcome, throttledInARow, stopped, dependencies.log);
  }
  return {
    ...summary,
    remaining: articlesRemaining(database, "fetch"),
    stoppedHosts: [...stopped],
  };
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {import("../infra/stage-queue.js").ArticleText} article Queue row.
 * @param {FetchDependencies} dependencies Ports.
 * @param {Set<string>} stopped Hosts this run has stopped.
 * @returns {Promise<FetchOutcome>} What happened to this article.
 */
async function fetchOne(database, article, dependencies, stopped) {
  const host = hostOf(article.publisherUrl);
  if (host !== undefined && stopped.has(host)) {
    dependencies.log("fetch.skipped", {
      guid: article.guid,
      host,
      stage: "fetch",
    });
    return { kind: "skipped" };
  }
  try {
    const html = await dependencies.articles.fetchArticle(article.publisherUrl);
    return stored(database, article, { host, log: dependencies.log }, html);
  } catch (error) {
    return failed(database, article, { host, log: dependencies.log }, error);
  }
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {import("../infra/stage-queue.js").ArticleText} article Queue row.
 * @param {{ host: string | undefined, log: import("../infra/logger.js").Log }} context Logger and publisher host.
 * @param {string} html Response body.
 * @returns {FetchOutcome} Saved, or moved when the row was no longer at `fetch`.
 */
function stored(database, article, context, html) {
  const { host, log } = context;
  if (saveBodyHtml(database, article.guid, html) === 0) {
    log("fetch.moved", { guid: article.guid, stage: "fetch" });
    return effect("moved", host, "reset");
  }
  return effect("fetched", host, "reset");
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {import("../infra/stage-queue.js").ArticleText} article Queue row.
 * @param {{ host: string | undefined, log: import("../infra/logger.js").Log }} context Logger and publisher host.
 * @param {unknown} error Failure from the fetcher.
 * @returns {FetchOutcome} Title path, retry, or moved.
 */
function failed(database, article, context, error) {
  const { host, log } = context;
  if (error instanceof ThrottledError) {
    return throttled(database, article, error, log);
  }
  if (error instanceof HttpStatusError) {
    return titled(database, article, { error: String(error), host, log });
  }
  if (error instanceof RefusedUrlError) {
    return titled(database, article, {
      error: String(error),
      host: undefined,
      log,
    });
  }
  throw error;
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {import("../infra/stage-queue.js").ArticleText} article Queue row.
 * @param {ThrottledError} error Exhausted backoff.
 * @param {import("../infra/logger.js").Log} log Structured logger.
 * @returns {FetchOutcome} Retry, terminal, or moved. The host count still increments.
 */
function throttled(database, article, error, log) {
  const retryable = leaveForRetry(
    database,
    { attemptCount: article.attemptCount, guid: article.guid, stage: "fetch" },
    String(error),
  );
  if (retryable === null) {
    log("fetch.moved", { guid: article.guid, stage: "fetch" });
    return effect("moved", error.host, "throttle");
  }
  log("fetch.retry", {
    error: String(error),
    guid: article.guid,
    retryable,
    stage: "fetch",
  });
  return effect(
    retryable === 0 ? "terminal" : "retried",
    error.host,
    "throttle",
  );
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {import("../infra/stage-queue.js").ArticleText} article Queue row.
 * @param {{ error: string, host: string | undefined, log: import("../infra/logger.js").Log }} context
 *   Message, logger, and the host that answered. `host` is undefined when the URL was refused.
 * @returns {FetchOutcome} Title path, or moved. An HTTP status resets that host.
 */
function titled(database, article, context) {
  const { error, host, log } = context;
  const didWrite = saveTitlePath(database, article.guid, "fetch") === 1;
  log(
    didWrite ? "fetch.title" : "fetch.moved",
    didWrite
      ? { error, guid: article.guid, stage: "fetch" }
      : { guid: article.guid, stage: "fetch" },
  );
  return effect(
    didWrite ? "titled" : "moved",
    host,
    host === undefined ? undefined : "reset",
  );
}

/**
 * @param {FetchOutcome["kind"]} kind What happened.
 * @param {string | undefined} host Publisher host.
 * @param {"reset" | "throttle" | undefined} hostEffect How the in-run count changes.
 * @returns {FetchOutcome} Outcome. Host fields are omitted when there is nothing to count.
 */
function effect(kind, host, hostEffect) {
  return host === undefined || hostEffect === undefined
    ? { kind }
    : { kind, host, hostEffect };
}

/**
 * @param {FetchOutcome} outcome Result for one article.
 * @param {Map<string, number>} throttledInARow Exhausted backoffs in a row, by host.
 * @param {Set<string>} stopped Hosts this run has stopped.
 * @param {import("../infra/logger.js").Log} log Structured logger.
 * @returns {void}
 */
function noteHost(outcome, throttledInARow, stopped, log) {
  if (outcome.host === undefined || outcome.hostEffect === undefined) {
    return;
  }
  if (outcome.hostEffect === "reset") {
    throttledInARow.set(outcome.host, 0);
    return;
  }
  const next = (throttledInARow.get(outcome.host) ?? 0) + 1;
  throttledInARow.set(outcome.host, next);
  if (next < STAGE_STOP_AFTER) {
    return;
  }
  stopped.add(outcome.host);
  log("fetch.stopped", { host: outcome.host, stage: "fetch" });
}

/**
 * @param {FetchSummary} summary Counts so far.
 * @param {FetchOutcome["kind"]} kind What happened.
 * @returns {FetchSummary} Counts with that kind incremented.
 */
function withKind(summary, kind) {
  if (kind === "fetched") {
    return { ...summary, fetched: summary.fetched + 1 };
  }
  if (kind === "titled") {
    return { ...summary, titled: summary.titled + 1 };
  }
  if (kind === "retried") {
    return { ...summary, retried: summary.retried + 1 };
  }
  if (kind === "terminal") {
    return { ...summary, terminal: summary.terminal + 1 };
  }
  return kind === "skipped"
    ? { ...summary, skipped: summary.skipped + 1 }
    : { ...summary, moved: summary.moved + 1 };
}

/**
 * @param {string} url Publisher URL.
 * @returns {string | undefined} `URL.host`, or undefined when the URL does not parse.
 */
function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    // eslint-disable-next-line unicorn/no-useless-undefined -- consistent-return needs an explicit value.
    return undefined;
  }
}
