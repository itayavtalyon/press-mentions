import { describe, expect, it } from "vitest";

import { parseSeed } from "../../src/core/seed.js";
import { readText } from "../helpers/files.js";

describe("parseSeed", () => {
  it("parses a plain name as its own query name with no aliases", () => {
    expect(parseSeed("ZutaCore")).toEqual([
      {
        id: "zutacore",
        displayName: "ZutaCore",
        queryName: "ZutaCore",
        aliases: [],
      },
    ]);
  });

  it("parses '(formerly X)' as alias X", () => {
    expect(parseSeed("Ludeo (formerly Edge)")).toEqual([
      {
        id: "ludeo",
        displayName: "Ludeo (formerly Edge)",
        queryName: "Ludeo",
        aliases: ["Edge"],
      },
    ]);
  });

  it("parses '(formerly known as X)' as alias X", () => {
    expect(parseSeed("Lifeward (formerly known as ReWalk)")).toEqual([
      {
        id: "lifeward",
        displayName: "Lifeward (formerly known as ReWalk)",
        queryName: "Lifeward",
        aliases: ["ReWalk"],
      },
    ]);
  });

  it("parses any other parenthetical as an alias", () => {
    expect(parseSeed("Lambda (lambda.ai)")).toEqual([
      {
        id: "lambda",
        displayName: "Lambda (lambda.ai)",
        queryName: "Lambda",
        aliases: ["lambda.ai"],
      },
    ]);
  });
});

describe("parseSeed ids and lines", () => {
  it("matches 'formerly' in any case and collapses spaces in the alias", () => {
    const [company] = parseSeed("Ludeo (Formerly  Edge   Games)");

    expect(company?.aliases).toEqual(["Edge Games"]);
  });

  it("slugs punctuation and spaces into single dashes", () => {
    const [company] = parseSeed("One Zero Digital Bank Ltd.");

    expect(company?.id).toBe("one-zero-digital-bank-ltd");
  });

  it("ignores blank lines, surrounding spaces, and CRLF endings", () => {
    const names = parseSeed("  Wave \r\n\r\nPeak\n").map(
      (company) => company.displayName,
    );

    expect(names).toEqual(["Wave", "Peak"]);
  });
});

describe("parseSeed rejects", () => {
  it("a seed with no companies", () => {
    expect(() => parseSeed(" \n\n")).toThrow("Seed has no companies");
  });

  it("two lines that slug to the same id", () => {
    expect(() => parseSeed("Spot AI\nSpot-AI")).toThrow(
      'Seed lines "Spot AI" and "Spot-AI" share the id "spot-ai"',
    );
  });

  it("a line with no letters or digits", () => {
    expect(() => parseSeed("!!!")).toThrow(
      'Seed line "!!!" has no letters or digits',
    );
  });

  it("a closing parenthesis without an opening one", () => {
    expect(() => parseSeed("Wave)")).toThrow(
      'Seed line "Wave)" has ")" without "("',
    );
  });

  it.each([
    { name: "no name before the parenthetical", line: "(lambda.ai)" },
    { name: "an empty parenthetical", line: "Lambda ()" },
    { name: "'formerly' with no name", line: "Ludeo (formerly)" },
    {
      name: "'formerly known as' with no name",
      line: "Ludeo (formerly known as)",
    },
    {
      name: "text after the parenthetical",
      line: "Ludeo (formerly Edge) Games",
    },
    { name: "a nested parenthetical", line: "Ludeo (formerly (Edge))" },
  ])("$name", ({ line }) => {
    expect(() => parseSeed(line)).toThrow(
      `Seed line "${line}" must be "Name" or "Name (alias)"`,
    );
  });
});

describe("the committed seed file", () => {
  const companies = parseSeed(
    readText(new URL("../../seed/companies.txt", import.meta.url)),
  );

  it("has 258 companies", () => {
    expect(companies).toHaveLength(258);
  });

  it("turns all 12 parentheticals into aliases", () => {
    const aliased = Object.fromEntries(
      companies
        .filter((company) => company.aliases.length > 0)
        .map((company) => [company.queryName, company.aliases]),
    );

    expect(aliased).toEqual({
      Lambda: ["lambda.ai"],
      SSI: ["Safe Superintelligence"],
      Ludeo: ["Edge"],
      Oshi: ["Plantish"],
      Cycuity: ["Tortuga Logic"],
      "HEQA Security": ["QuantLR"],
      BlueCircle: ["Trellis"],
      "Momentis Surgical": ["Memic"],
      "Firefly Neuroscience": ["ElMindA"],
      Lifeward: ["ReWalk"],
      Xsense: ["BT9"],
      Incredo: ["DouxMatok"],
    });
  });
});
