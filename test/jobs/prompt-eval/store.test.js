import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SqliteDatabase } from "../../../src/infra/database.js";
import { EvaluationStore } from "../../../src/jobs/prompt-eval/store.js";

/**
 * @returns {string} Fresh database path.
 */
function givenDatabasePath() {
  const directory = mkdtempSync(path.join(tmpdir(), "eval-"));

  return path.join(directory, "evaluation.sqlite");
}

/**
 * @param {string} databasePath SQLite path.
 * @returns {EvaluationStore} Store for that file.
 */
function openStore(databasePath) {
  return new EvaluationStore(new SqliteDatabase(databasePath));
}

const HARVEY = {
  expected: { Harvey: "positive" },
  id: "harvey-funding",
  parameters: {
    article: "Harvey raised funds.",
    companies: [{ name: "Harvey" }],
    homepage: "https://techcrunch.com",
    publisher: "TechCrunch",
  },
};

const HARVEY_NOTE = {
  expected: { Harvey: "positive" },
  id: "harvey-note",
  parameters: {
    article: "Harvey raised funds.",
    companies: [{ extra: "legal AI startup", name: "Harvey" }],
    homepage: "https://techcrunch.com",
    publisher: "TechCrunch",
  },
};

describe("evaluation cases", () => {
  it("writes parameters and the expected result in separate columns", () => {
    const databasePath = givenDatabasePath();
    const store = openStore(databasePath);
    store.insertCases([HARVEY]);
    store.close();
    const database = new SqliteDatabase(databasePath);
    const row = database
      .prepare(
        "SELECT parameters_json, expected_json FROM cases WHERE id = @id",
      )
      .get({ id: "harvey-funding" });
    database.close();

    expect(row).toMatchObject({
      expected_json: JSON.stringify({ Harvey: "positive" }),
    });
    const parameters = JSON.parse(
      /** @type {{ parameters_json: string }} */ (row).parameters_json,
    );
    expect(parameters.companies).toEqual([{ name: "Harvey" }]);
    expect(parameters.expected).toBeUndefined();
  });

  it("appends a case that carries a company note", () => {
    const store = openStore(givenDatabasePath());
    store.insertCases([HARVEY]);
    store.insertCases([HARVEY_NOTE]);

    expect(store.caseCount()).toBe(2);
    expect(store.listCases()[1]?.parameters.companies).toEqual([
      { extra: "legal AI startup", name: "Harvey" },
    ]);
    store.close();
  });
});

describe("evaluation score rows", () => {
  it("stores a score row", () => {
    const databasePath = givenDatabasePath();
    const store = openStore(databasePath);
    store.insertScores(
      [
        {
          modelId: "qwen2.5:14b",
          promptId: "v000",
          promptVersion: 0,
          relatedness: 1,
          score: 1,
          secondsPerCase: 1.25,
        },
      ],
      "2026-09-30T12:00:00.000Z",
    );
    store.close();
    const database = new SqliteDatabase(databasePath);
    const row = database.prepare("SELECT model_id, score FROM scores").get();
    database.close();

    expect(row).toEqual({ model_id: "qwen2.5:14b", score: 1 });
  });
});

describe("evaluation score checks", () => {
  it("rejects a score that is not a whole number", () => {
    const store = openStore(givenDatabasePath());

    expect(() =>
      store.insertScores(
        [
          {
            modelId: "qwen2.5:14b",
            promptId: "v000",
            promptVersion: 0,
            relatedness: 1,
            score: 1.5,
            secondsPerCase: 1,
          },
        ],
        "2026-09-30T12:00:00.000Z",
      ),
    ).toThrow(/whole number/u);
    store.close();
  });

  it("rejects relatedness that is not a whole number", () => {
    const store = openStore(givenDatabasePath());

    expect(() =>
      store.insertScores(
        [
          {
            modelId: "qwen2.5:14b",
            promptId: "v000",
            promptVersion: 0,
            relatedness: -1,
            score: 1,
            secondsPerCase: 1,
          },
        ],
        "2026-09-30T12:00:00.000Z",
      ),
    ).toThrow(/relatedness/u);
    store.close();
  });
});

describe("evaluation score duration", () => {
  it("rejects a duration that is not finite", () => {
    const store = openStore(givenDatabasePath());

    expect(() =>
      store.insertScores(
        [
          {
            modelId: "qwen2.5:14b",
            promptId: "v000",
            promptVersion: 0,
            relatedness: 1,
            score: 1,
            secondsPerCase: Infinity,
          },
        ],
        "2026-09-30T12:00:00.000Z",
      ),
    ).toThrow(/duration/u);
    store.close();
  });
});

/**
 * @param {unknown} [row] Value returned for every read.
 * @returns {SqliteDatabase} Database double.
 */
function givenRead(row) {
  return /** @type {SqliteDatabase} */ (
    /** @type {unknown} */ ({
      close() {},
      exec() {},
      prepare() {
        return {
          all: () => [],
          get: () => row,
          run() {},
        };
      },
      transaction(/** @type {() => void} */ work) {
        work();
      },
    })
  );
}

describe("evaluation count checks", () => {
  it("rejects a missing case count", () => {
    const store = new EvaluationStore(givenRead());

    expect(() => store.caseCount()).toThrow(/case count is missing/u);
  });

  it("rejects a case count that is not a number", () => {
    const store = new EvaluationStore(givenRead({ count: "1" }));

    expect(() => store.caseCount()).toThrow(/case count is missing/u);
  });

  it("rejects a missing case position", () => {
    const store = new EvaluationStore(givenRead());

    expect(() => store.insertCases([])).toThrow(/case position is missing/u);
  });

  it("rejects a case position that is not a number", () => {
    const store = new EvaluationStore(givenRead({ position: "0" }));

    expect(() => store.insertCases([])).toThrow(/case position is missing/u);
  });
});
