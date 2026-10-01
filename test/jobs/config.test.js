import { describe, expect, it } from "vitest";

import { readConfig } from "../../src/jobs/config.js";
import { readText } from "../helpers/files.js";

describe("readConfig", () => {
  it("reads COVERAGE_DB, trimmed", () => {
    expect(
      readConfig({ COVERAGE_DB: " coverage.sqlite " }).coverageDatabase,
    ).toBe("coverage.sqlite");
  });

  it("points at the committed seed file", () => {
    const { seedPath } = readConfig({ COVERAGE_DB: "coverage.sqlite" });

    expect(readText(seedPath)).toBe(
      readText(new URL("../../seed/companies.txt", import.meta.url)),
    );
  });

  it("points at the committed overlay file", () => {
    const { overlayPath } = readConfig({ COVERAGE_DB: "coverage.sqlite" });

    expect(readText(overlayPath)).toBe(
      readText(new URL("../../seed/overlay.json", import.meta.url)),
    );
  });

  it.each([
    { name: "missing", env: {} },
    { name: "blank", env: { COVERAGE_DB: "  " } },
  ])("rejects a $name COVERAGE_DB", ({ env }) => {
    expect(() => readConfig(env)).toThrow(
      "COVERAGE_DB is not set. Copy .env.example to .env",
    );
  });

  it("defaults the Google interval to one second", () => {
    expect(
      readConfig({ COVERAGE_DB: "coverage.sqlite" }).googleIntervalMs,
    ).toBe(1000);
  });

  it("reads GOOGLE_TOKEN_MS", () => {
    expect(
      readConfig({ COVERAGE_DB: "coverage.sqlite", GOOGLE_TOKEN_MS: " 2500 " })
        .googleIntervalMs,
    ).toBe(2500);
  });

  it.each(["0", "-5", "1.5", "fast"])("rejects GOOGLE_TOKEN_MS=%s", (value) => {
    expect(() =>
      readConfig({ COVERAGE_DB: "coverage.sqlite", GOOGLE_TOKEN_MS: value }),
    ).toThrow(
      `GOOGLE_TOKEN_MS must be a positive whole number of milliseconds, got "${value}"`,
    );
  });
});
