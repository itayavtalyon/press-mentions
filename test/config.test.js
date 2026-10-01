import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

const COVERAGE = { COVERAGE_DB: "coverage.sqlite" };

describe("loadConfig defaults", () => {
  it("uses the local database, host, model, and prompt version", () => {
    const config = loadConfig(COVERAGE, "/work");

    expect(config.coverageDatabase).toBe("coverage.sqlite");
    expect(config.databasePath).toBe("/work/data/evaluation.sqlite");
    expect(config.googleIntervalMs).toBe(1000);
    expect(config.model).toBe("gemma4:12b");
    expect(config.ollamaHost).toBe("http://127.0.0.1:11434");
    expect(config.promptVersion).toBe("v002");
    expect(config.seedPath.endsWith("/seed/companies.txt")).toBe(true);
    expect(config.overlayPath.endsWith("/seed/overlay.json")).toBe(true);
  });

  it("keeps an absolute database path and a configured model", () => {
    const config = loadConfig(
      {
        ...COVERAGE,
        EVAL_DB: "/var/lib/evaluation.sqlite",
        MODEL: "qwen2.5:14b",
        PROMPT_VERSION: "v000",
      },
      "/work",
    );

    expect(config.databasePath).toBe("/var/lib/evaluation.sqlite");
    expect(config.model).toBe("qwen2.5:14b");
    expect(config.promptVersion).toBe("v000");
  });
});

describe("loadConfig checks", () => {
  it("rejects an empty database path", () => {
    expect(() => loadConfig({ ...COVERAGE, EVAL_DB: "" }, "/work")).toThrow(
      /EVAL_DB is empty/u,
    );
  });

  it("rejects an empty Ollama host", () => {
    expect(() => loadConfig({ ...COVERAGE, OLLAMA_HOST: "" }, "/work")).toThrow(
      /OLLAMA_HOST is empty/u,
    );
  });

  it("rejects an empty model name", () => {
    expect(() => loadConfig({ ...COVERAGE, MODEL: "" }, "/work")).toThrow(
      /MODEL is empty/u,
    );
  });

  it("rejects a prompt version that is not vNNN", () => {
    expect(() =>
      loadConfig({ ...COVERAGE, PROMPT_VERSION: "" }, "/work"),
    ).toThrow(/PROMPT_VERSION is empty/u);
    expect(() =>
      loadConfig({ ...COVERAGE, PROMPT_VERSION: "2" }, "/work"),
    ).toThrow(/not a prompt version/u);
  });
});
