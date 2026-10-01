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
        misses: [],
        outcome,
        possible: 1,
        rows: [left, right],
        skippedEmbeddings: [],
      }),
    ).toContain("tie qwen2.5:14b v000, gemma4:12b v000");
  });
});

describe("formatReport", () => {
  it("prints a miss before the outcome", () => {
    const row = givenRow();
    const text = formatReport({
      misses: [
        {
          actual: "unrelated",
          caseId: "harvey-funding",
          company: "Harvey",
          expected: "positive",
          modelId: row.modelId,
          promptId: row.promptId,
        },
      ],
      outcome: { kind: "winner", row },
      possible: 1,
      rows: [row],
      skippedEmbeddings: [],
    });

    expect(text).toContain(
      "miss qwen2.5:14b v000 harvey-funding Harvey expected=positive actual=unrelated",
    );
    expect(text.indexOf("miss ")).toBeLessThan(text.lastIndexOf("winner "));
  });
});
