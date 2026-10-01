import { describe, expect, it } from "vitest";

import { PromptScore } from "../../../src/jobs/prompt-eval/score.js";

const score = new PromptScore();

describe("PromptScore points", () => {
  it("gives a point for the expected tone", () => {
    expect(
      score.tally({ Harvey: "positive" }, new Map([["Harvey", "positive"]])),
    ).toEqual({ relatedness: 1, score: 1 });
  });

  it("counts relatedness when the tone is wrong", () => {
    expect(
      score.tally({ Harvey: "positive" }, new Map([["Harvey", "negative"]])),
    ).toEqual({ relatedness: 1, score: 0 });
  });

  it("gives a point when a namesake is marked unrelated", () => {
    expect(
      score.tally({ Harvey: "unrelated" }, new Map([["Harvey", "unrelated"]])),
    ).toEqual({ relatedness: 1, score: 1 });
  });

  it("gives a point only for an unrelated namesake", () => {
    expect(
      score.tally({ Harvey: "unrelated" }, new Map([["Harvey", "positive"]])),
    ).toEqual({ relatedness: 0, score: 0 });
  });
});

describe("PromptScore gaps", () => {
  it("treats a missing verdict as uncertain", () => {
    expect(score.tally({ Harvey: "positive" }, new Map())).toEqual({
      relatedness: 0,
      score: 0,
    });
  });

  it("rejects an expected verdict that cannot be scored", () => {
    expect(() => score.tally({ Harvey: "uncertain" }, new Map())).toThrow(
      /not scorable/u,
    );
  });
});
