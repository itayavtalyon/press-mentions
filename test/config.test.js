import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

const COVERAGE = { COVERAGE_DB: "coverage.sqlite" };

describe("loadConfig defaults", () => {
  it("uses the local database and the local Ollama host", () => {
    const config = loadConfig(COVERAGE, "/work");

    expect(config.coverageDatabase).toBe("coverage.sqlite");
    expect(config.databasePath).toBe("/work/data/evaluation.sqlite");
    expect(config.googleIntervalMs).toBe(1000);
    expect(config.ollamaHost).toBe("http://127.0.0.1:11434");
    expect(config.seedPath.endsWith("/seed/companies.txt")).toBe(true);
    expect(config.overlayPath.endsWith("/seed/overlay.json")).toBe(true);
  });

  it("keeps an absolute evaluation database path", () => {
    const config = loadConfig(
      { ...COVERAGE, EVAL_DB: "/var/lib/evaluation.sqlite" },
      "/work",
    );

    expect(config.databasePath).toBe("/var/lib/evaluation.sqlite");
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
});
