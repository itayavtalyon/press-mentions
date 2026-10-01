import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runPromptEval } from "../../../src/jobs/prompt-eval/run.js";

/**
 * @type {import("../../../src/jobs/prompt-eval/rows.js").EvalCase[]}
 */
const CASES = [
  {
    expected: { Harvey: "positive" },
    id: "harvey-note",
    parameters: {
      article: "Harvey raised funds.",
      companies: [{ extra: "legal AI startup", name: "Harvey" }],
      homepage: "https://techcrunch.com",
      publisher: "TechCrunch",
    },
  },
];

const PROMPTS = [
  {
    body: "v000 {{article}} {{publisher}} {{homepage}} {{candidates}}",
    id: "v000",
    version: 0,
  },
  {
    body: "v002 {{article}} {{publisher}} {{homepage}} {{candidates}}",
    id: "v002",
    version: 2,
  },
];

/**
 * @param {import("../../../src/core/classifier.js").ClassifierRequest} request Built call.
 * @param {string[]} calls Recorded model and prompt prefix.
 * @returns {Promise<string>} Unrelated verdicts for every asked company.
 */
function unrelatedReply(request, calls) {
  calls.push(`${request.model} ${request.prompt.slice(0, 4)}`);
  /**
   * @type {Record<string, string>}
   */
  const body = {};

  for (const name of request.format.required) {
    Object.defineProperty(body, name, {
      enumerable: true,
      value: "unrelated",
    });
  }

  return Promise.resolve(JSON.stringify(body));
}

/**
 * @param {import("../../../src/jobs/prompt-eval/rows.js").EvalCase[]} cases Stored cases.
 * @returns {{ calls: string[], errors: string[], output: string[], ports: import("../../../src/jobs/prompt-eval/run.js").PromptEvalPorts }} Harness.
 */
function givenPorts(cases) {
  /**
   * @type {string[]}
   */
  const calls = [];
  /**
   * @type {string[]}
   */
  const output = [];
  /**
   * @type {string[]}
   */
  const errors = [];
  const directory = mkdtempSync(path.join(tmpdir(), "eval-"));

  return {
    calls,
    errors,
    output,
    ports:
      /** @type {import("../../../src/jobs/prompt-eval/run.js").PromptEvalPorts} */ (
        /** @type {unknown} */ ({
          cwd: directory,
          env: { EVAL_DB: path.join(directory, "evaluation.sqlite") },
          loadPrompts: () => PROMPTS,
          monotonicMs: () => {
            return calls.length * 1000;
          },
          now: () => new Date("2026-09-30T12:00:00.000Z"),
          ollama: {
            chat: (
              /** @type {import("../../../src/core/classifier.js").ClassifierRequest} */ request,
            ) => unrelatedReply(request, calls),
            list: async () =>
              "NAME ID\nqwen2.5:14b a\nnomic-embed-text:latest b\n",
          },
          openStore: () => ({
            caseCount: () => cases.length,
            close: () => {},
            insertScores: () => {},
            listCases: () => cases,
          }),
          stderr: (/** @type {string} */ text) => {
            errors.push(text);
          },
          stdout: (/** @type {string} */ text) => {
            output.push(text);
          },
        })
      ),
  };
}

describe("runPromptEval", () => {
  it("loops models, then prompts, and prints the newer prompt when scores tie", async () => {
    const harness = givenPorts(CASES);
    const status = await runPromptEval(harness.ports);

    expect(status).toBe(0);
    expect(harness.calls).toEqual(["qwen2.5:14b v000", "qwen2.5:14b v002"]);
    expect(harness.output[0]).toContain(
      "skipped_embedding nomic-embed-text:latest",
    );
    expect(harness.output[0]).toContain("winner qwen2.5:14b v002");
  });

  it("returns 1 when the model call throws", async () => {
    const harness = givenPorts(CASES);
    harness.ports.ollama.chat = async () => {
      throw new Error("connection refused");
    };

    const status = await runPromptEval(harness.ports);

    expect(status).toBe(1);
    expect(harness.errors).toEqual(["connection refused"]);
  });

  it("prints a failure that is not an Error", async () => {
    const harness = givenPorts(CASES);
    harness.ports.ollama.chat = async () => {
      throw "connection refused";
    };

    const status = await runPromptEval(harness.ports);

    expect(status).toBe(1);
    expect(harness.errors).toEqual(["connection refused"]);
  });
});

describe("runPromptEval failures", () => {
  it("returns 1 when there are no cases", async () => {
    const harness = givenPorts([]);

    const status = await runPromptEval(harness.ports);

    expect(status).toBe(1);
    expect(harness.errors).toEqual(["no evaluation cases"]);
  });

  it("returns 1 when there are no prompts", async () => {
    const harness = givenPorts(CASES);
    harness.ports.loadPrompts = () => [];

    const status = await runPromptEval(harness.ports);

    expect(status).toBe(1);
    expect(harness.errors).toEqual(["no classifier prompts"]);
  });

  it("returns 1 when the lock file already exists", async () => {
    const harness = givenPorts(CASES);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- The lock sits next to this test's database path.
    writeFileSync(`${harness.ports.env.EVAL_DB}.lock`, "");

    const status = await runPromptEval(harness.ports);

    expect(status).toBe(1);
    expect(harness.errors[0]).toMatch(/eval lock is held/u);
  });
});
