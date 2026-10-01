import { describe, expect, it } from "vitest";

import { caseFromRow } from "../../../src/jobs/prompt-eval/rows.js";

describe("stored case shape", () => {
  it("rejects a row that is not an object", () => {
    expect(() => caseFromRow(1)).toThrow(/not an object/u);
  });

  it("rejects a row field that is not text", () => {
    expect(() =>
      caseFromRow({
        expected_json: "{}",
        id: 1,
        parameters_json: "{}",
      }),
    ).toThrow(/not text/u);
  });
});
