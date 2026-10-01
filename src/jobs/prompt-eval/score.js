import { VERDICT_NAMES } from "../../core/classifier.js";
import { ownValue } from "../../core/common.js";

const SCORABLE = new Set(
  VERDICT_NAMES.filter((verdict) => verdict !== "uncertain"),
);

const RELATED = new Set(
  VERDICT_NAMES.filter(
    (verdict) => verdict !== "uncertain" && verdict !== "unrelated",
  ),
);

/**
 * Compares a classifier reply with the expected result. The classifier does not know the gold labels.
 */
export class PromptScore {
  /**
   * @param {string} verdict Gold verdict.
   * @returns {boolean} True when the verdict can earn a point.
   */
  static scorable(verdict) {
    return SCORABLE.has(verdict);
  }

  /**
   * @param {Record<string, string>} expected Gold verdict by company name.
   * @param {Map<string, string>} verdicts Verdicts the classifier read from one reply.
   * @returns {{ score: number, relatedness: number, misses: { company: string, expected: string, actual: string }[] }} Points, correct relevance decisions, and the decisions that earned no point.
   */
  tally(expected, verdicts) {
    const names = Object.keys(expected);
    let score = 0;
    let relatedness = 0;
    /**
     * @type {{ company: string, expected: string, actual: string }[]}
     */
    const misses = [];

    for (const name of names) {
      const expectedVerdict = String(ownValue(expected, name));
      const actual = verdicts.get(name) ?? "uncertain";
      const decision = scoreDecision(expectedVerdict, actual);
      score += decision.point;
      relatedness += decision.relatedness;

      if (decision.point === 0) {
        misses.push({ actual, company: name, expected: expectedVerdict });
      }
    }

    return { misses, relatedness, score };
  }
}

/**
 * @param {string} verdict Model or expected label.
 * @returns {"related" | "unrelated" | "unknown"} Relevance bucket.
 */
function relevance(verdict) {
  if (verdict === "unrelated") {
    return "unrelated";
  }

  return RELATED.has(verdict) ? "related" : "unknown";
}

/**
 * @param {string} expected Gold verdict.
 * @param {string} actual Model verdict.
 * @returns {{ point: number, relatedness: number }} Counts, each 0 or 1.
 */
function scoreDecision(expected, actual) {
  if (!SCORABLE.has(expected)) {
    throw new Error(`expected verdict is not scorable: ${expected}`);
  }

  const matched = relevance(expected) === relevance(actual) ? 1 : 0;

  if (expected === "unrelated") {
    return { point: actual === "unrelated" ? 1 : 0, relatedness: matched };
  }

  return { point: expected === actual ? 1 : 0, relatedness: matched };
}
