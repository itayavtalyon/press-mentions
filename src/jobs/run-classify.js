import {
  Classifier,
  isObjectReply,
  LIVE_MODEL,
  LIVE_PROMPT_VERSION,
  replyVerdict,
} from "../core/classifier.js";
import { isRecord, ownValue } from "../core/common.js";
import { openCoverageStore } from "../infra/coverage-store.js";
import { backoffMs, RETRY_POLICY } from "../infra/http.js";
import { withCommandLock } from "../infra/lock.js";
import {
  articlesToClassify,
  classifyRemaining,
  leaveForRetry,
  saveVerdicts,
} from "../infra/stage-queue.js";

import { loadPrompt } from "./prompt-eval/prompts.js";

const STAGE_STOP_AFTER = 3;
const OUTAGE_CODES = new Set([
  "ECONNREFUSED",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

/**
 * @typedef {object} ClassifyDependencies
 * @property {(request: import("../core/classifier.js").ClassifierRequest) => Promise<string>} chat One model call.
 * @property {import("../infra/clock.js").Clock} clock Clock.
 * @property {() => number} random Jitter source in `[0, 1)`.
 * @property {import("../infra/logger.js").Log} log Structured logger.
 * @typedef {object} ClassifySummary
 * @property {number} classified Articles whose open links were stored.
 * @property {number} retried Rows left queued after an exhausted backoff.
 * @property {number} terminal Rows made terminal by a third exhausted run.
 * @property {number} skipped Rows not requested after Ollama stopped.
 * @property {number} moved Rows that were no longer at `classify`.
 * @property {number} remaining Retryable rows at `classify` with an open link.
 * @property {string} [stoppedBy] Dependency that stopped the rest of the run.
 * @typedef {"classified" | "retried" | "terminal" | "skipped" | "moved"} ClassifyKind
 */

/**
 * @param {{ coverageDatabase: string }} config Coverage settings.
 * @param {ClassifyDependencies} dependencies Ports.
 * @returns {Promise<ClassifySummary>} What happened.
 */
export async function runClassify(config, dependencies) {
  const prompt = loadPrompt(LIVE_PROMPT_VERSION);
  return withCommandLock(config.coverageDatabase, "classify", async () => {
    const database = openCoverageStore(config.coverageDatabase);
    try {
      return await classifyAll(database, dependencies, prompt);
    } finally {
      database.close();
    }
  });
}

/**
 * @param {ClassifySummary} summary Result of runClassify.
 * @returns {number} 0 when no retryable row at `classify` still has an open link.
 */
export function exitCode(summary) {
  return summary.remaining === 0 ? 0 : 1;
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {ClassifyDependencies} dependencies Ports.
 * @param {import("../core/classifier.js").PromptVersion} prompt Live prompt.
 * @returns {Promise<ClassifySummary>} What happened.
 */
async function classifyAll(database, dependencies, prompt) {
  /**
   * @type {ClassifySummary}
   */
  let summary = {
    classified: 0,
    moved: 0,
    remaining: 0,
    retried: 0,
    skipped: 0,
    terminal: 0,
  };
  let streak = 0;
  let isStopped = false;
  const queued = articlesToClassify(database, LIVE_MODEL, LIVE_PROMPT_VERSION);
  for (const article of queued) {
    const kind = isStopped
      ? "skipped"
      : await classifyOne(database, article, dependencies, prompt);
    summary = withKind(summary, kind);
    if (kind === "classified") {
      streak = 0;
    } else if (kind === "retried" || kind === "terminal") {
      streak += 1;
    }
    if (isStopped || streak < STAGE_STOP_AFTER) {
      continue;
    }
    isStopped = true;
    dependencies.log("classify.stopped", {
      dependency: "ollama",
      stage: "classify",
    });
  }
  const remaining = classifyRemaining(
    database,
    LIVE_MODEL,
    LIVE_PROMPT_VERSION,
  );
  return isStopped
    ? { ...summary, remaining, stoppedBy: "ollama" }
    : { ...summary, remaining };
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {import("../infra/stage-queue.js").ClassifyArticle} article Queue row.
 * @param {ClassifyDependencies} dependencies Ports.
 * @param {import("../core/classifier.js").PromptVersion} prompt Live prompt.
 * @returns {Promise<ClassifyKind>} What happened to this article.
 */
async function classifyOne(database, article, dependencies, prompt) {
  if (article.extractedText === null) {
    throw new Error(`extracted_text for ${article.guid} is null`);
  }
  const request = new Classifier().request(LIVE_MODEL, prompt, {
    article: article.extractedText,
    companies: article.links.map((link) =>
      link.descriptor === null || link.descriptor === ""
        ? { name: link.queryName }
        : { extra: link.descriptor, name: link.queryName },
    ),
    homepage: article.publisherHomepage ?? "",
    publisher: article.publisherName ?? "",
  });
  const result = await callWithBackoff(dependencies, request);
  return typeof result === "string"
    ? storeReply(database, article, dependencies.log, result)
    : storeOutage(database, article, dependencies.log, result);
}

/**
 * @param {ClassifyDependencies} dependencies Ports.
 * @param {import("../core/classifier.js").ClassifierRequest} request Chat request.
 * @returns {Promise<string | unknown>} Reply text, or the outage once the attempts are exhausted.
 */
async function callWithBackoff(dependencies, request) {
  /**
   * @type {unknown}
   */
  let failure = new Error("ollama");
  const last = RETRY_POLICY.maxAttempts - 1;
  for (let attempt = 0; attempt <= last; attempt += 1) {
    try {
      return await dependencies.chat(request);
    } catch (error) {
      if (!isOutage(error)) {
        throw error;
      }
      failure = error;
    }
    if (attempt < last) {
      await dependencies.clock.sleep(backoffMs(attempt, dependencies.random));
    }
  }
  return failure;
}

/**
 * @param {unknown} error Thrown value.
 * @returns {boolean} True for connection refused, timeout, or HTTP 5xx.
 */
function isOutage(error) {
  if (!isRecord(error)) {
    return false;
  }
  const status = ownValue(error, "status_code");
  const isServer = typeof status === "number" && status >= 500 && status <= 599;
  return (
    isServer ||
    ownValue(error, "name") === "TimeoutError" ||
    OUTAGE_CODES.has(outageCode(error))
  );
}

/**
 * @param {object} error Error object.
 * @returns {string} An outage code on the error or its cause, or an empty string.
 */
function outageCode(error) {
  const direct = stringCode(ownValue(error, "code"));
  if (direct !== "") {
    return direct;
  }
  const cause = ownValue(error, "cause");
  return isRecord(cause) ? stringCode(ownValue(cause, "code")) : "";
}

/**
 * @param {unknown} value Property value.
 * @returns {string} The text, or an empty string when the property is not a string.
 */
function stringCode(value) {
  return typeof value === "string" ? value : "";
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {import("../infra/stage-queue.js").ClassifyArticle} article Queue row.
 * @param {import("../infra/logger.js").Log} log Structured logger.
 * @param {string} reply Model reply.
 * @returns {ClassifyKind} Stored, or moved when the row was no longer at `classify`.
 */
function storeReply(database, article, log, reply) {
  const wrote = saveVerdicts(database, article.guid, {
    modelId: LIVE_MODEL,
    promptVersion: LIVE_PROMPT_VERSION,
    rawResponse: reply,
    verdicts: verdictRows(article, reply),
  });
  if (wrote === 0) {
    log("classify.moved", { guid: article.guid, stage: "classify" });
    return "moved";
  }
  return "classified";
}

/**
 * @param {import("../infra/stage-queue.js").ClassifyArticle} article Queue row.
 * @param {string} reply Model reply.
 * @returns {import("../infra/stage-queue.js").StoredVerdict[]} One row per open link.
 */
function verdictRows(article, reply) {
  const reviewFlag = isObjectReply(reply) ? 0 : 1;
  return article.links.map((link) => ({
    companyId: link.companyId,
    reviewFlag,
    verdict: replyVerdict(reply, link.queryName),
  }));
}

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {import("../infra/stage-queue.js").ClassifyArticle} article Queue row.
 * @param {import("../infra/logger.js").Log} log Structured logger.
 * @param {unknown} error Exhausted outage.
 * @returns {ClassifyKind} Retry, terminal, or moved.
 */
function storeOutage(database, article, log, error) {
  const retryable = leaveForRetry(
    database,
    {
      attemptCount: article.attemptCount,
      guid: article.guid,
      stage: "classify",
    },
    String(error),
  );
  if (retryable === null) {
    log("classify.moved", { guid: article.guid, stage: "classify" });
    return "moved";
  }
  log("classify.retry", {
    error: String(error),
    guid: article.guid,
    retryable,
    stage: "classify",
  });
  return retryable === 0 ? "terminal" : "retried";
}

/**
 * @param {ClassifySummary} summary Counts so far.
 * @param {ClassifyKind} kind What happened.
 * @returns {ClassifySummary} Counts with that kind incremented.
 */
function withKind(summary, kind) {
  // eslint-disable-next-line security/detect-object-injection -- kind is the closed ClassifyKind set.
  return { ...summary, [kind]: summary[kind] + 1 };
}
