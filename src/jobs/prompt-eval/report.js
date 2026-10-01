/**
 * @typedef {import("./store.js").ScoreRow} ScoreRow
 */

/**
 * @typedef {object} EvalReport
 * @property {string[]} skippedEmbeddings Embedding models left out of the run.
 * @property {number} possible Company decisions in the case set.
 * @property {ScoreRow[]} rows One row per model and prompt.
 * @property {{ kind: "winner", row: ScoreRow } | { kind: "tie", rows: ScoreRow[] }} outcome Absolute winner, or the rows that remain tied.
 */

/**
 * Negative when `left` should win. Score, then relatedness, then newer prompt.
 * @param {ScoreRow} left Candidate.
 * @param {ScoreRow} right Current best.
 * @returns {number} Ordering for the tie-break.
 */
function compareRank(left, right) {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  return left.relatedness === right.relatedness
    ? right.promptVersion - left.promptVersion
    : right.relatedness - left.relatedness;
}

/**
 * @param {ScoreRow[]} rows One row per model and prompt.
 * @returns {EvalReport["outcome"]} Winner, or the still-tied rows.
 */
export function pickWinner(rows) {
  const first = rows[0];

  if (first === undefined) {
    throw new Error("no scores to rank");
  }

  let best = first;

  for (const row of rows) {
    if (compareRank(row, best) < 0) {
      best = row;
    }
  }

  const tied = rows.filter((row) => compareRank(row, best) === 0);
  const only = tied[0];

  return only !== undefined && tied.length === 1
    ? { kind: "winner", row: only }
    : { kind: "tie", rows: tied };
}

/**
 * @param {EvalReport} report Finished run.
 * @returns {string} Scores and the absolute winner, or a tie.
 */
export function formatReport(report) {
  /**
   * @type {string[]}
   */
  const lines = Array.from(
    report.skippedEmbeddings,
    (name) => `skipped_embedding ${name}`,
  );

  for (const row of report.rows) {
    const seconds = row.secondsPerCase.toFixed(3);
    lines.push(
      `${row.modelId} ${row.promptId} score=${row.score} of ${report.possible} relatedness=${row.relatedness} of ${report.possible} seconds_per_case=${seconds}`,
    );
  }

  lines.push(outcomeLine(report.outcome));

  return lines.join("\n");
}

/**
 * @param {EvalReport["outcome"]} outcome Rank result.
 * @returns {string} Last line of the report.
 */
function outcomeLine(outcome) {
  if (outcome.kind === "winner") {
    return `winner ${outcome.row.modelId} ${outcome.row.promptId}`;
  }

  const names = outcome.rows.map((row) => `${row.modelId} ${row.promptId}`);

  return `tie ${names.join(", ")}`;
}
