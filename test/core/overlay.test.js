import { describe, expect, it } from "vitest";

import { applyOverlay, parseOverlay } from "../../src/core/overlay.js";
import { parseSeed } from "../../src/core/seed.js";

const givenSeed = () => parseSeed("Harvey\nLudeo (formerly Edge)");

describe("parseOverlay", () => {
  it("accepts an entry with every field", () => {
    const overlay = parseOverlay({
      Harvey: {
        descriptor: "Legal AI startup",
        queryTerms: ["AI", "legal"],
        aliases: [],
      },
    });

    expect(overlay.get("Harvey")).toEqual({
      descriptor: "Legal AI startup",
      queryTerms: ["AI", "legal"],
      aliases: [],
    });
  });

  it("keeps omitted fields absent", () => {
    const overlay = parseOverlay({
      Harvey: { descriptor: "Legal AI startup" },
    });

    expect(overlay.get("Harvey")).toEqual({ descriptor: "Legal AI startup" });
  });
});

describe("parseOverlay rejects", () => {
  it.each([
    {
      name: "an array",
      value: [],
      message: "Overlay must be a JSON object keyed by seed line",
    },
    {
      name: "null",
      // eslint-disable-next-line unicorn/no-null -- JSON can parse to null, so the overlay must reject it.
      value: null,
      message: "Overlay must be a JSON object keyed by seed line",
    },
    {
      name: "a non-object entry",
      value: { Harvey: "legal" },
      message: 'Overlay entry "Harvey" must be an object',
    },
    {
      name: "an unknown field",
      value: { Harvey: { sector: "legal" } },
      message: 'Overlay entry "Harvey" has unknown field "sector"',
    },
    {
      name: "a blank descriptor",
      value: { Harvey: { descriptor: " " } },
      message: 'Overlay field "Harvey.descriptor" must be a non-blank string',
    },
    {
      name: "query terms that are not an array",
      value: { Harvey: { queryTerms: "AI" } },
      message: 'Overlay field "Harvey.queryTerms" must be an array of strings',
    },
    {
      name: "a non-string alias",
      value: { Harvey: { aliases: [7] } },
      message: 'Overlay field "Harvey.aliases[0]" must be a non-blank string',
    },
  ])("$name", ({ value, message }) => {
    expect(() => parseOverlay(value)).toThrow(message);
  });
});

describe("applyOverlay", () => {
  it("leaves a company without an entry with its seed aliases, no descriptor, and no query terms", () => {
    const [, ludeo] = applyOverlay(givenSeed(), new Map());

    expect(ludeo).toEqual({
      id: "ludeo",
      displayName: "Ludeo (formerly Edge)",
      queryName: "Ludeo",
      aliases: ["Edge"],
      descriptor: undefined,
      queryTerms: [],
    });
  });

  it("adds the descriptor and query terms from an entry", () => {
    const [harvey] = applyOverlay(
      givenSeed(),
      parseOverlay({
        Harvey: { descriptor: "Legal AI startup", queryTerms: ["AI", "legal"] },
      }),
    );

    expect(harvey).toEqual({
      id: "harvey",
      displayName: "Harvey",
      queryName: "Harvey",
      aliases: [],
      descriptor: "Legal AI startup",
      queryTerms: ["AI", "legal"],
    });
  });

  it("replaces the seed aliases when the entry gives aliases", () => {
    const [, ludeo] = applyOverlay(
      givenSeed(),
      parseOverlay({ "Ludeo (formerly Edge)": { aliases: [] } }),
    );

    expect(ludeo?.aliases).toEqual([]);
  });

  it("rejects an entry that matches no seed line, so the overlay cannot add a company", () => {
    expect(() =>
      applyOverlay(givenSeed(), parseOverlay({ Ludeo: { aliases: [] } })),
    ).toThrow(
      'Overlay entry "Ludeo" matches no seed line. The overlay cannot add a company',
    );
  });

  it("keeps seed order and count", () => {
    const ids = applyOverlay(givenSeed(), new Map()).map(
      (company) => company.id,
    );

    expect(ids).toEqual(["harvey", "ludeo"]);
  });
});
