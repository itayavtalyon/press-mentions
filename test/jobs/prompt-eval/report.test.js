import { describe, expect, it } from "vitest";

import {
  formatReport,
  pickWinner,
} from "../../../src/jobs/prompt-eval/report.js";

/**
 * @param {Partial<import("../../../src/jobs/prompt-eval/store.js").ScoreRow>} overrides Fields that differ.
 * @returns {import("../../../src/jobs/prompt-eval/store.js").ScoreRow} A score row.
 */
function givenRow(overrides = {}) {
  return {
    modelId: "qwen2.5:14b",
    promptId: "v000",
    promptVersion: 0,
    relatedness: 1,
    score: 1,
    secondsPerCase: 1,
    ...overrides,
  };
}

describe("pickWinner", () => {
  it("throws when there are no rows", () => {
    expect(() => pickWinner([])).toThrow(/no scores to rank/u);
  });

  it("picks the higher score", () => {
    const winner = givenRow({ modelId: "gemma4:12b", score: 2 });

    expect(pickWinner([givenRow(), winner])).toEqual({
      kind: "winner",
      row: winner,
    });
  });

  it("breaks a score tie toward higher relatedness", () => {
    const winner = givenRow({ modelId: "gemma4:12b", relatedness: 2 });

    expect(pickWinner([givenRow(), winner])).toEqual({
      kind: "winner",
      row: winner,
    });
  });

  it("prints a tie when score, relatedness, and prompt version match", () => {
    const left = givenRow();
    const right = givenRow({ modelId: "gemma4:12b" });
    const outcome = pickWinner([left, right]);

    expect(
      formatReport({
        outcome,
        possible: 1,
        rows: [left, right],
        skippedEmbeddings: [],
      }),
    ).toContain("tie qwen2.5:14b v000, gemma4:12b v000");
  });
});
