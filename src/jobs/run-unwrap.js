import { openCoverageStore } from "../infra/coverage-store.js";
import { HttpStatusError, ThrottledError } from "../infra/http.js";
import { withCommandLock } from "../infra/lock.js";
import { BatchError, UnresolvedError } from "../infra/resolver.js";
import {
  articlesAtStage,
  articlesRemaining,
  leaveForRetry,
  savePublisherUrl,
  saveTitlePath,
} from "../infra/stage-queue.js";
// Three exhausted backoffs stop the rest of this unwrap run (ADR 0006).
const STAGE_STOP_AFTER = 3;
// Measured 2026-10-02: one POST of 20 stored articles returned 20 publisher URLs.
const POST_BATCH = 20;
/**
 * @typedef {{ articles: import("../infra/resolver.js").ArticleResolver, log: import("../infra/logger.js").Log }} UnwrapDependencies Token resolver and logger.
 */
/**
 * @typedef {{ resolved: number, titled: number, retried: number, terminal: number, skipped: number, moved: number, remaining: number, stoppedBy?: string }} UnwrapSummary Counts for one run. `remaining` is filled in at the end.
 */
/**
 * @typedef {{ kind: "resolved" | "titled" | "retried" | "terminal" | "skipped" | "moved", didReset: boolean, didThrottle: boolean }} UnwrapOutcome One row. `didReset` clears the streak. `didThrottle` counts toward the stop.
 */
/**
 * @typedef {{ summary: UnwrapSummary, pending: import("../infra/stage-queue.js").ArticleText[], signed: import("../infra/resolver.js").SignedArticle[], streak: number, stoppedBy: string }} UnwrapRun Rows for the next POST, plus the running counts.
 */
/**
 * @param {{ coverageDatabase: string }} config Coverage settings.
 * @param {UnwrapDependencies} dependencies Ports.
 * @returns {Promise<UnwrapSummary>} What happened.
 */
export async function runUnwrap(config, dependencies) {
  return withCommandLock(config.coverageDatabase, "unwrap", async () => {
    const database = openCoverageStore(config.coverageDatabase);
    try {
      return await unwrapAll(database, dependencies);
    } finally {
      database.close();
    }
  });
}
/**
 * @param {UnwrapSummary} summary Result of runUnwrap.
 * @returns {number} 0 when no retryable row remains at `unwrap`.
 */
export function exitCode(summary) {
  return summary.remaining === 0 ? 0 : 1;
}
/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {UnwrapDependencies} dependencies Ports.
 * @returns {Promise<UnwrapSummary>} What happened.
 */
async function unwrapAll(database, dependencies) {
  /**
   * @type {UnwrapRun}
   */
  const run = {
    pending: [],
    signed: [],
    stoppedBy: "",
    streak: 0,
    summary: {
      moved: 0,
      remaining: 0,
      resolved: 0,
      retried: 0,
      skipped: 0,
      terminal: 0,
      titled: 0,
    },
  };
  for (const article of articlesAtStage(database, "unwrap")) {
    if (run.stoppedBy !== "") {
      dependencies.log("unwrap.skipped", {
        guid: article.guid,
        stage: "unwrap",
      });
      run.summary = count(run.summary, "skipped");
      continue;
    }
    const outcome = await signOne(database, article, dependencies);
    if (outcome.kind === "signed") {
      run.pending.push(article);
      run.signed.push(outcome.signed);
      run.streak = 0;
      if (run.signed.length === POST_BATCH) {
        Object.assign(run, await postBatch(database, dependencies, run));
      }
      continue;
    }
    run.summary = count(run.summary, outcome.kind);
    run.streak = outcome.didReset
      ? 0
      : run.streak + Number(outcome.didThrottle);
    run.stoppedBy = halt(run.streak, run.stoppedBy, dependencies);
  }
  Object.assign(run, await postBatch(database, dependencies, run));
  const remaining = articlesRemaining(database, "unwrap");
  return run.stoppedBy === ""
    ? { ...run.summary, remaining }
    : { ...run.summary, remaining, stoppedBy: run.stoppedBy };
}
/**
 * Posts one batch and returns the run with those rows cleared.
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {UnwrapDependencies} dependencies Ports.
 * @param {UnwrapRun} run Batch and counts.
 * @returns {Promise<UnwrapRun>} Counts after this POST, with no pending rows.
 */
async function postBatch(database, dependencies, run) {
  const posted = await applyPost(
    database,
    dependencies,
    run.pending,
    run.signed,
  );
  let summary = run.summary;
  for (const outcome of posted.outcomes) {
    summary = count(summary, outcome.kind);
  }
  const streak = posted.throttled ? run.streak + 1 : run.streak;
  return {
    pending: [],
    signed: [],
    stoppedBy: halt(streak, run.stoppedBy, dependencies),
    streak,
    summary,
  };
}
/**
 * @param {number} streak Exhausted backoffs in a row.
 * @param {string} stoppedBy Host that already stopped this run, or "".
 * @param {UnwrapDependencies} dependencies Ports.
 * @returns {string} `news.google.com` once the streak reaches three.
 */
function halt(streak, stoppedBy, dependencies) {
  if (stoppedBy !== "" || streak < STAGE_STOP_AFTER) {
    return stoppedBy;
  }
  dependencies.log("unwrap.stopped", {
    host: "news.google.com",
    stage: "unwrap",
  });
  return "news.google.com";
}
/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {import("../infra/stage-queue.js").ArticleText} article Queue row.
 * @param {UnwrapDependencies} dependencies Ports.
 * @returns {Promise<UnwrapOutcome | { kind: "signed", signed: import("../infra/resolver.js").SignedArticle }>} Signature or row outcome.
 */
async function signOne(database, article, dependencies) {
  try {
    return {
      kind: "signed",
      signed: await dependencies.articles.sign(article.googleUrl),
    };
  } catch (error) {
    return failed(database, article, dependencies, error);
  }
}
/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {UnwrapDependencies} dependencies Ports.
 * @param {readonly import("../infra/stage-queue.js").ArticleText[]} pending Rows that signed.
 * @param {readonly import("../infra/resolver.js").SignedArticle[]} signed Signatures, in request order.
 * @returns {Promise<{ outcomes: UnwrapOutcome[], throttled: boolean }>} One throttle flag for the whole POST.
 */
async function applyPost(database, dependencies, pending, signed) {
  if (signed.length === 0) {
    return { outcomes: [], throttled: false };
  }
  try {
    const urls = await dependencies.articles.post(signed);
    return {
      outcomes: pending.map((article) => {
        const publisherUrl = urls.get(article.googleUrl);
        return publisherUrl === undefined
          ? titled(
              database,
              article,
              dependencies,
              new UnresolvedError(article.googleUrl, "no publisher URL"),
            )
          : stored(database, article, dependencies, publisherUrl);
      }),
      throttled: false,
    };
  } catch (error) {
    if (
      error instanceof ThrottledError ||
      error instanceof HttpStatusError ||
      error instanceof BatchError
    ) {
      return {
        outcomes: pending.map((article) =>
          throttled(database, article, dependencies, {
            didThrottle: false,
            error,
          }),
        ),
        throttled: error instanceof ThrottledError,
      };
    }
    throw error;
  }
}
/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {import("../infra/stage-queue.js").ArticleText} article Queue row.
 * @param {UnwrapDependencies} dependencies Ports.
 * @param {string} publisherUrl Resolved article URL.
 * @returns {UnwrapOutcome} Saved, or moved when the row was no longer at `unwrap`.
 */
function stored(database, article, dependencies, publisherUrl) {
  if (savePublisherUrl(database, article.guid, publisherUrl) === 0) {
    dependencies.log("unwrap.moved", { guid: article.guid, stage: "unwrap" });
    return { didReset: true, didThrottle: false, kind: "moved" };
  }
  return { didReset: true, didThrottle: false, kind: "resolved" };
}
/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {import("../infra/stage-queue.js").ArticleText} article Queue row.
 * @param {UnwrapDependencies} dependencies Ports.
 * @param {unknown} error Failure from the resolver.
 * @returns {UnwrapOutcome} Title path, retry, or moved.
 */
function failed(database, article, dependencies, error) {
  if (error instanceof ThrottledError) {
    return throttled(database, article, dependencies, error);
  }
  if (error instanceof HttpStatusError || error instanceof UnresolvedError) {
    return titled(database, article, dependencies, error);
  }
  throw error;
}
/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {import("../infra/stage-queue.js").ArticleText} article Queue row.
 * @param {UnwrapDependencies} dependencies Ports.
 * @param {Error} error Non-retryable failure.
 * @returns {UnwrapOutcome} Title path, or moved. Either one clears the throttle streak.
 */
function titled(database, article, dependencies, error) {
  const didWrite = saveTitlePath(database, article.guid, "unwrap") === 1;
  dependencies.log(
    didWrite ? "unwrap.title" : "unwrap.moved",
    didWrite
      ? { error: String(error), guid: article.guid, stage: "unwrap" }
      : { guid: article.guid, stage: "unwrap" },
  );
  return {
    didReset: true,
    didThrottle: false,
    kind: didWrite ? "titled" : "moved",
  };
}
/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {import("../infra/stage-queue.js").ArticleText} article Queue row.
 * @param {UnwrapDependencies} dependencies Ports.
 * @param {ThrottledError | { error: Error, didThrottle: boolean }} failure GET throttle or a whole-POST failure.
 * @returns {UnwrapOutcome} Retry, terminal, or moved.
 */
function throttled(database, article, dependencies, failure) {
  const error = failure instanceof Error ? failure : failure.error;
  const didThrottle = failure instanceof Error || failure.didThrottle;
  const retryable = leaveForRetry(
    database,
    { attemptCount: article.attemptCount, guid: article.guid, stage: "unwrap" },
    String(error),
  );
  if (retryable === null) {
    dependencies.log("unwrap.moved", { guid: article.guid, stage: "unwrap" });
    return { didReset: false, didThrottle, kind: "moved" };
  }
  dependencies.log("unwrap.retry", {
    guid: article.guid,
    retryable,
    stage: "unwrap",
  });
  return {
    didReset: false,
    didThrottle,
    kind: retryable === 0 ? "terminal" : "retried",
  };
}
/**
 * @param {UnwrapSummary} summary Counts so far.
 * @param {UnwrapOutcome["kind"]} kind What happened.
 * @returns {UnwrapSummary} Counts with that kind incremented. `remaining` is filled in later.
 */
function count(summary, kind) {
  // eslint-disable-next-line security/detect-object-injection -- kind is one of the six count names
  return { ...summary, [kind]: summary[kind] + 1 };
}
