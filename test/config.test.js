import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

const COVERAGE = { COVERAGE_DB: "coverage.sqlite" };

describe("loadConfig defaults", () => {
  it("uses the local database and the local Ollama host", () => {
    const config = loadConfig(COVERAGE, "/work");

    expect(config.coverageDatabase).toBe("coverage.sqlite");
    expect(config.databasePath).toBe("/work/data/evaluation.sqlite");
    expect(config.googleIntervalMs).toBe(1000);
    expect(config.publisherIntervalMs).toBe(2000);
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

describe("loadConfig port", () => {
  it("defaults the dashboard port to 3000", () => {
    expect(loadConfig(COVERAGE, "/work").port).toBe(3000);
  });

  it.each([
    ["1", 1],
    ["8080", 8080],
    ["65535", 65_535],
    [" 80 ", 80],
  ])("reads PORT=%j", (value, expected) => {
    expect(loadConfig({ ...COVERAGE, PORT: value }, "/work").port).toBe(
      expected,
    );
  });

  it.each(["", "0", "65536", "abc", "3000.5", "03000"])(
    "rejects PORT=%j",
    (value) => {
      expect(() => loadConfig({ ...COVERAGE, PORT: value }, "/work")).toThrow(
        /PORT must be a whole number from 1 to 65535/u,
      );
    },
  );
});

describe("loadConfig alerts store", () => {
  it("defaults to data/alerts.sqlite", () => {
    expect(loadConfig(COVERAGE, "/work").alertsDatabase).toBe(
      "data/alerts.sqlite",
    );
  });

  it("reads ALERTS_DB", () => {
    expect(
      loadConfig({ ...COVERAGE, ALERTS_DB: "data/live-alerts.sqlite" }, "/work")
        .alertsDatabase,
    ).toBe("data/live-alerts.sqlite");
  });

  it("rejects an empty ALERTS_DB", () => {
    expect(() => loadConfig({ ...COVERAGE, ALERTS_DB: "" }, "/work")).toThrow(
      /ALERTS_DB is empty/u,
    );
  });
});
