import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadCompanies } from "../../src/infra/seed-file.js";
import { givenFile, givenTemporaryDirectory } from "../helpers/files.js";

describe("loadCompanies", () => {
  it("merges the seed file with the overlay file", () => {
    const directory = givenTemporaryDirectory();
    const seed = givenFile(directory, "companies.txt", "Harvey");
    const overlay = givenFile(
      directory,
      "overlay.json",
      '{"Harvey": {"descriptor": "Legal AI startup"}}',
    );

    expect(loadCompanies(seed, overlay)).toEqual([
      {
        id: "harvey",
        displayName: "Harvey",
        queryName: "Harvey",
        aliases: [],
        descriptor: "Legal AI startup",
        queryTerms: [],
      },
    ]);
  });

  it("names the overlay file when it is not valid JSON", () => {
    const directory = givenTemporaryDirectory();
    const seed = givenFile(directory, "companies.txt", "Harvey");
    const overlay = givenFile(directory, "overlay.json", "{");

    expect(() => loadCompanies(seed, overlay)).toThrow(
      `${overlay} is not valid JSON`,
    );
  });

  it("throws when the seed file is missing", () => {
    const directory = givenTemporaryDirectory();
    const overlay = givenFile(directory, "overlay.json", "{}");

    expect(() =>
      loadCompanies(path.join(directory, "companies.txt"), overlay),
    ).toThrow("ENOENT");
  });
});

describe("the committed overlay file", () => {
  it("applies to the committed seed", () => {
    const companies = loadCompanies(
      fileURLToPath(new URL("../../seed/companies.txt", import.meta.url)),
      fileURLToPath(new URL("../../seed/overlay.json", import.meta.url)),
    );

    expect(companies).toHaveLength(258);
  });
});
