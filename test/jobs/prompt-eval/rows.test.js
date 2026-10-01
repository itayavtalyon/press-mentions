import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SqliteDatabase } from "../../../src/infra/database.js";
import { validateCase } from "../../../src/jobs/prompt-eval/rows.js";
import { EvaluationStore } from "../../../src/jobs/prompt-eval/store.js";

/**
 * @returns {string} Fresh database path.
 */
function givenDatabasePath() {
  const directory = mkdtempSync(path.join(tmpdir(), "eval-"));

  return path.join(directory, "evaluation.sqlite");
}

/**
 * @param {string} parametersJson Stored parameters for the first case.
 * @param {string} expectedJson Stored expected result for the first case.
 * @returns {EvaluationStore} Reopened store.
 */
function corrupt(parametersJson, expectedJson) {
  const databasePath = givenDatabasePath();
  const store = new EvaluationStore(new SqliteDatabase(databasePath));
  store.insertCases([
    {
      expected: { Harvey: "positive" },
      id: "harvey-funding",
      parameters: {
        article: "Harvey",
        companies: [{ name: "Harvey" }],
        homepage: "https://techcrunch.com",
        publisher: "TechCrunch",
      },
    },
  ]);
  store.close();
  const database = new SqliteDatabase(databasePath);
  database
    .prepare(
      "UPDATE cases SET parameters_json = @parametersJson, expected_json = @expectedJson WHERE id = @id",
    )
    .run({
      expectedJson,
      id: "harvey-funding",
      parametersJson,
    });
  database.close();
  return new EvaluationStore(new SqliteDatabase(databasePath));
}

describe("stored case rows", () => {
  it("rejects parameters that are not an object", () => {
    const store = corrupt("[]", "{}");

    expect(() => store.listCases()).toThrow(/parameters are not an object/u);
    store.close();
  });

  it("rejects a company that is not an object", () => {
    const store = corrupt(
      JSON.stringify({
        article: "Harvey",
        companies: [1],
        homepage: "https://techcrunch.com",
        publisher: "TechCrunch",
      }),
      JSON.stringify({ Harvey: "positive" }),
    );

    expect(() => store.listCases()).toThrow(/not an object/u);
    store.close();
  });

  it("rejects an expected verdict that is not text", () => {
    const store = corrupt(
      JSON.stringify({
        article: "Harvey",
        companies: [{ name: "Harvey" }],
        homepage: "https://techcrunch.com",
        publisher: "TechCrunch",
      }),
      JSON.stringify({ Harvey: 1 }),
    );

    expect(() => store.listCases()).toThrow(/is not text/u);
    store.close();
  });

  it("rejects an expected result that is not an object", () => {
    const store = corrupt(
      JSON.stringify({
        article: "Harvey",
        companies: [{ name: "Harvey" }],
        homepage: "https://techcrunch.com",
        publisher: "TechCrunch",
      }),
      "[]",
    );

    expect(() => store.listCases()).toThrow(
      /expected result is not an object/u,
    );
    store.close();
  });
});

describe("stored case fields", () => {
  it("rejects a company name that is not text", () => {
    const store = corrupt(
      JSON.stringify({
        article: "Harvey",
        companies: [{ name: 1 }],
        homepage: "https://techcrunch.com",
        publisher: "TechCrunch",
      }),
      "{}",
    );

    expect(() => store.listCases()).toThrow(/name that is not text/u);
    store.close();
  });

  it("rejects extra text that is not text", () => {
    const store = corrupt(
      JSON.stringify({
        article: "Harvey",
        companies: [{ extra: 1, name: "Harvey" }],
        homepage: "https://techcrunch.com",
        publisher: "TechCrunch",
      }),
      JSON.stringify({ Harvey: "positive" }),
    );

    expect(() => store.listCases()).toThrow(/extra text that is not text/u);
    store.close();
  });

  it("rejects parameters that are not text", () => {
    const store = corrupt(
      JSON.stringify({
        article: 1,
        companies: [],
        homepage: "https://techcrunch.com",
        publisher: "TechCrunch",
      }),
      "{}",
    );

    expect(() => store.listCases()).toThrow(/parameters are not text/u);
    store.close();
  });
});

describe("validateCase names", () => {
  it("rejects a homepage that is not https", () => {
    expect(() =>
      validateCase({
        expected: { Wave: "unrelated" },
        id: "wave-sea",
        parameters: {
          article: "A wave.",
          companies: [{ name: "Wave" }],
          homepage: "www.bbc.com",
          publisher: "BBC",
        },
      }),
    ).toThrow(/https/u);
  });

  it("rejects a company name that would break the prompt line", () => {
    expect(() =>
      validateCase({
        expected: { "Wave\nNext": "unrelated" },
        id: "wave-sea",
        parameters: {
          article: "A wave.",
          companies: [{ name: "Wave\nNext" }],
          homepage: "https://www.bbc.com",
          publisher: "BBC",
        },
      }),
    ).toThrow(/cannot be rendered/u);
  });

  it("rejects extra text that contains a placeholder", () => {
    expect(() =>
      validateCase({
        expected: { Wave: "unrelated" },
        id: "wave-sea",
        parameters: {
          article: "A wave.",
          companies: [{ extra: "see {{article}}", name: "Wave" }],
          homepage: "https://www.bbc.com",
          publisher: "BBC",
        },
      }),
    ).toThrow(/extra text/u);
  });
});

describe("validateCase results", () => {
  it("rejects an expected verdict that cannot be scored", () => {
    expect(() =>
      validateCase({
        expected: { Wave: "uncertain" },
        id: "wave-sea",
        parameters: {
          article: "A wave.",
          companies: [{ name: "Wave" }],
          homepage: "https://www.bbc.com",
          publisher: "BBC",
        },
      }),
    ).toThrow(/cannot be scored/u);
  });

  it("rejects a repeated company", () => {
    expect(() =>
      validateCase({
        expected: { Wave: "unrelated" },
        id: "wave-sea",
        parameters: {
          article: "A wave.",
          companies: [{ name: "Wave" }, { name: "Wave" }],
          homepage: "https://www.bbc.com",
          publisher: "BBC",
        },
      }),
    ).toThrow(/repeats Wave/u);
  });
});

/**
 * @param {string} article Article text.
 * @param {string} id Case id.
 * @param {import("../../../src/core/classifier.js").Company[]} companies Companies.
 * @param {Record<string, string>} expected Gold verdicts.
 * @returns {import("../../../src/jobs/prompt-eval/rows.js").EvalCase} Case.
 */
function waveCase(article, id, companies, expected) {
  return {
    expected,
    id,
    parameters: {
      article,
      companies,
      homepage: "https://www.bbc.com",
      publisher: "BBC",
    },
  };
}

describe("validateCase shape", () => {
  it("rejects an empty article", () => {
    expect(() =>
      validateCase(
        waveCase("", "wave-sea", [{ name: "Wave" }], { Wave: "unrelated" }),
      ),
    ).toThrow(/missing an id or article/u);
  });

  it("rejects an empty id", () => {
    expect(() =>
      validateCase(
        waveCase("A wave.", "", [{ name: "Wave" }], { Wave: "unrelated" }),
      ),
    ).toThrow(/missing an id or article/u);
  });

  it("rejects a case with no companies", () => {
    expect(() => validateCase(waveCase("A wave.", "wave-sea", [], {}))).toThrow(
      /no companies/u,
    );
  });

  it("rejects an expected result for a company that was not asked", () => {
    expect(() =>
      validateCase(
        waveCase("A wave.", "wave-sea", [{ name: "Wave" }], {
          Peak: "unrelated",
          Wave: "unrelated",
        }),
      ),
    ).toThrow(/does not match/u);
  });
});
