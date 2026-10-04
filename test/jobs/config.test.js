import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config.js";
import { readText } from "../helpers/files.js";

/**
 * @param {Record<string, string | undefined>} environment Process environment.
 * @returns {ReturnType<typeof loadConfig>} Settings.
 */
function readConfig(environment) {
  return loadConfig(environment, "/work");
}

describe("coverage settings", () => {
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

describe("alert email", () => {
  it("defaults ALERT_EMAIL to an example.com address", () => {
    expect(readConfig({ COVERAGE_DB: "coverage.sqlite" }).alertEmail).toBe(
      "alerts@example.com",
    );
  });

  it("reads ALERT_EMAIL", () => {
    expect(
      readConfig({
        ALERT_EMAIL: "person@example.com",
        COVERAGE_DB: "coverage.sqlite",
      }).alertEmail,
    ).toBe("person@example.com");
  });
});

describe("publisher interval", () => {
  it("defaults the publisher interval to two seconds", () => {
    expect(
      readConfig({ COVERAGE_DB: "coverage.sqlite" }).publisherIntervalMs,
    ).toBe(2000);
  });

  it("reads PUBLISHER_TOKEN_MS", () => {
    expect(
      readConfig({
        COVERAGE_DB: "coverage.sqlite",
        PUBLISHER_TOKEN_MS: " 4000 ",
      }).publisherIntervalMs,
    ).toBe(4000);
  });

  it.each(["0", "-5", "1.5", "fast"])(
    "rejects PUBLISHER_TOKEN_MS=%s",
    (value) => {
      expect(() =>
        readConfig({
          COVERAGE_DB: "coverage.sqlite",
          PUBLISHER_TOKEN_MS: value,
        }),
      ).toThrow(
        `PUBLISHER_TOKEN_MS must be a positive whole number of milliseconds, got "${value}"`,
      );
    },
  );
});
