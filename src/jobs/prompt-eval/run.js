import { loadConfig } from "../../config.js";
import { Classifier } from "../../core/classifier.js";
import { withLock } from "../../infra/lock.js";
import { OllamaClient } from "../../infra/ollama.js";

import { formatReport, pickWinner } from "./report.js";
import { PromptScore } from "./score.js";

/**
 * @typedef {import("./store.js").EvaluationStore} EvaluationStore
 * @typedef {import("./store.js").ScoreRow} ScoreRow
 * @typedef {import("./rows.js").EvalCase} EvalCase
 * @typedef {import("./report.js").EvalReport} EvalReport
 * @typedef {import("../../core/classifier.js").PromptVersion} PromptVersion
 */

/**
 * @typedef {object} PromptEvalPorts
 * @property {Record<string, string | undefined>} env Process environment.
 * @property {string} cwd Working directory.
 * @property {OllamaClient} ollama Ollama operations.
 * @property {(databasePath: string) => EvaluationStore} openStore Opens the evaluation database.
 * @property {() => PromptVersion[]} loadPrompts Loads saved prompts.
 * @property {(text: string) => void} stdout Writes the score report.
 * @property {(text: string) => void} stderr Writes a failure message.
 * @property {() => Date} now Clock for the score timestamp.
 * @property {() => number} monotonicMs Millisecond clock for call duration.
 */

/**
 * Run the tournament and print the scores. Returns 0 on a finished report.
 * @param {PromptEvalPorts} ports Ports and configuration.
 * @returns {Promise<number>} Process status.
 */
export async function runPromptEval(ports) {
  try {
    const report = await executeEval(ports);
    ports.stdout(formatReport(report));
    return 0;
  } catch (error) {
    ports.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

/**
 * @param {PromptEvalPorts} ports Ports and configuration.
 * @returns {Promise<EvalReport>} Report, after scores are stored.
 */
async function executeEval(ports) {
  const databasePath = loadConfig(ports.env, ports.cwd).databasePath;

  return withLock(`${databasePath}.lock`, () =>
    scoreAndStore(ports, databasePath),
  );
}

/**
 * @param {PromptEvalPorts} ports Ports and configuration.
 * @param {string} databasePath Evaluation SQLite path.
 * @returns {Promise<EvalReport>} Report.
 */
async function scoreAndStore(ports, databasePath) {
  const store = ports.openStore(databasePath);

  try {
    const cases = store.listCases();
    const report = await scoreModels({
      cases,
      listText: await ports.ollama.list(ports.env),
      monotonicMs: ports.monotonicMs,
      ollama: ports.ollama,
      prompts: ports.loadPrompts(),
    });
    store.insertScores(report.rows, ports.now().toISOString());

    return report;
  } finally {
    store.close();
  }
}

/**
 * @param {object} input Run inputs.
 * @param {string} input.listText `ollama list` table.
 * @param {PromptVersion[]} input.prompts Saved prompts.
 * @param {EvalCase[]} input.cases Labeled articles.
 * @param {OllamaClient} input.ollama Ollama operations.
 * @param {() => number} input.monotonicMs Millisecond clock.
 * @returns {Promise<EvalReport>} Scores and the rank outcome.
 */
async function scoreModels(input) {
  const models = OllamaClient.chatModels(input.listText);

  if (input.prompts.length === 0) {
    throw new Error("no classifier prompts");
  }

  if (input.cases.length === 0) {
    throw new Error("no evaluation cases");
  }

  const classifier = new Classifier();
  const promptScore = new PromptScore();
  /**
   * @type {ScoreRow[]}
   */
  const rows = [];

  for (const modelId of models.chat) {
    for (const prompt of input.prompts) {
      const totals = await scorePair({
        cases: input.cases,
        classifier,
        modelId,
        monotonicMs: input.monotonicMs,
        ollama: input.ollama,
        prompt,
        promptScore,
      });
      rows.push({
        modelId,
        promptId: prompt.id,
        promptVersion: prompt.version,
        ...totals,
      });
    }
  }

  return {
    outcome: pickWinner(rows),
    possible: countDecisions(input.cases),
    rows,
    skippedEmbeddings: models.skipped,
  };
}

/**
 * @param {object} input Pair inputs.
 * @param {Classifier} input.classifier Classifier operations.
 * @param {OllamaClient} input.ollama Ollama operations.
 * @param {EvalCase[]} input.cases Labeled articles.
 * @param {PromptVersion} input.prompt Prompt version injected into each call.
 * @param {PromptScore} input.promptScore Scoring against the expected result.
 * @param {string} input.modelId Model injected into each call.
 * @param {() => number} input.monotonicMs Millisecond clock.
 * @returns {Promise<{ score: number, relatedness: number, secondsPerCase: number }>} Pair totals.
 */
async function scorePair(input) {
  let score = 0;
  let relatedness = 0;
  let elapsedMs = 0;

  for (const evalCase of input.cases) {
    const started = input.monotonicMs();
    const request = input.classifier.request(
      input.modelId,
      input.prompt,
      evalCase.parameters,
    );
    const reply = await input.ollama.chat(request);
    elapsedMs += input.monotonicMs() - started;
    const part = input.promptScore.tally(
      evalCase.expected,
      input.classifier.verdicts(reply, request.format.required),
    );
    score += part.score;
    relatedness += part.relatedness;
  }

  return {
    relatedness,
    score,
    secondsPerCase: elapsedMs / input.cases.length / 1000,
  };
}

/**
 * @param {EvalCase[]} cases Labeled articles.
 * @returns {number} Company judgments in the set.
 */
function countDecisions(cases) {
  let count = 0;

  for (const evalCase of cases) {
    count += Object.keys(evalCase.expected).length;
  }

  return count;
}
