import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { isRecord, ownValue } from "../../../src/core/common.js";
import { SqliteDatabase } from "../../../src/infra/database.js";
import { caseFromRow } from "../../../src/jobs/prompt-eval/rows.js";
import { EvaluationStore } from "../../../src/jobs/prompt-eval/store.js";

/**
 * @param {Record<string, unknown>} overlay Parsed overlay.
 * @param {string} name Company name on the case.
 * @returns {string | undefined} Overlay descriptor for that name.
 */
function descriptorFor(overlay, name) {
  let descriptor;

  for (const key of Object.keys(overlay)) {
    const bareKey = key.replace(/ \([^)]*\)$/u, "");

    if (key !== name && bareKey !== name) {
      continue;
    }

    const value = ownValue(overlay, key);

    if (!isRecord(value)) {
      continue;
    }

    const text = ownValue(value, "descriptor");

    if (typeof text === "string") {
      descriptor = text;
    }
  }

  return descriptor;
}

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

describe("repository labeled set", () => {
  it("uses each overlay descriptor, word for word, as the company note", () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const parsed = JSON.parse(
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- The overlay file is the repository seed.
      readFileSync(path.join(root, "seed/overlay.json"), "utf8"),
    );

    if (!isRecord(parsed)) {
      throw new TypeError("overlay is not an object");
    }

    const store = new EvaluationStore(
      new SqliteDatabase(path.join(root, "data/evaluation.sqlite")),
    );

    try {
      for (const evalCase of store.listCases()) {
        for (const company of evalCase.parameters.companies) {
          expect(company.extra).toBe(descriptorFor(parsed, company.name));
        }
      }
    } finally {
      store.close();
    }
  });
});
