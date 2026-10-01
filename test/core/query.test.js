import { describe, expect, it } from "vitest";

import { buildQuery } from "../../src/core/query.js";
import { givenCompany } from "../helpers/fakes.js";

const WINDOW = {
  from: new Date("2026-07-01T00:00:00Z"),
  to: new Date("2026-10-05T09:30:00Z"),
};

describe("buildQuery", () => {
  it("quotes a single name and widens the dates by a day on each side", () => {
    expect(buildQuery(givenCompany(), WINDOW)).toBe(
      '"Harvey" after:2026-06-30 before:2026-10-06',
    );
  });

  it("joins the name and its aliases with OR", () => {
    const company = givenCompany({
      queryName: "SSI",
      aliases: ["Safe Superintelligence"],
    });

    expect(buildQuery(company, WINDOW)).toBe(
      '("SSI" OR "Safe Superintelligence") after:2026-06-30 before:2026-10-06',
    );
  });

  it("narrows with the overlay query terms", () => {
    const company = givenCompany({ queryTerms: ["AI", "legal tech"] });

    expect(buildQuery(company, WINDOW)).toBe(
      '"Harvey" ("AI" OR "legal tech") after:2026-06-30 before:2026-10-06',
    );
  });

  it("narrows with a single query term without parentheses", () => {
    const company = givenCompany({ queryTerms: ["AI"] });

    expect(buildQuery(company, WINDOW)).toBe(
      '"Harvey" "AI" after:2026-06-30 before:2026-10-06',
    );
  });

  it("rejects a term with a double quote", () => {
    const company = givenCompany({ queryTerms: ['say "hi"'] });

    expect(() => buildQuery(company, WINDOW)).toThrow(
      'Query term say "hi" contains a double quote',
    );
  });
});
