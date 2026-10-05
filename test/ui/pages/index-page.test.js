import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";

import { parseFilters } from "../../../src/core/filters.js";
import { indexPage } from "../../../src/ui/pages/index-page.js";

const NOW = new Date("2026-10-05T12:00:00.000Z");
const JULY = new Date("2026-07-01T00:00:00.000Z");

/**
 * @typedef {ReturnType<typeof parseHTML>["document"]} Page
 * @typedef {import("../../../src/core/dashboard.js").CompanyCoverage} CompanyCoverage
 */

/**
 * @param {{ textContent: string | null } | null | undefined} node Rendered node.
 * @returns {string} Its text with whitespace collapsed, as a browser shows it.
 */
const text = (node) =>
  (node?.textContent ?? "").replaceAll(/\s+/gu, " ").trim();

/**
 * @param {string} id Slug.
 * @param {Partial<CompanyCoverage>} [fields] Overrides.
 * @returns {CompanyCoverage} One index row.
 */
const row = (id, fields = {}) => ({
  aliases: [],
  counts: { negative: 0, neutral: 0, positive: 0, unranked: 0 },
  descriptor: undefined,
  displayName: id,
  id,
  lastMentionedAt: undefined,
  ...fields,
});

const ACME = row("acme", {
  aliases: ["Acme AI", "AcmeQ"],
  counts: { negative: 3, neutral: 2, positive: 6, unranked: 7 },
  displayName: "Acme <Quantum>",
  lastMentionedAt: "2026-10-05T08:00:00.000Z",
});
const KESTREL = row("kestrel", { lastMentionedAt: "2026-10-04T11:00:00.000Z" });
const SALTMARSH = row("saltmarsh", {
  lastMentionedAt: "2026-09-23T00:00:00.000Z",
});
const ASTER = row("aster");

/**
 * @param {string} search Query string.
 * @param {{ rows?: CompanyCoverage[], anyMention?: boolean, collection?: Date | "not-run" }} [data] Store state.
 * @returns {Page} The rendered index.
 */
const render = (search, data = {}) => {
  const result = parseFilters(new URLSearchParams(search), NOW);
  const shell = { collection: data.collection ?? JULY, flagged: 0, now: NOW };
  const view =
    "filters" in result
      ? {
          anyMention: data.anyMention ?? true,
          filters: result.filters,
          form: result.form,
          rows: data.rows ?? [ACME, KESTREL, SALTMARSH, ASTER],
        }
      : result;
  return parseHTML(String(indexPage(shell, view))).document;
};

describe("index page frame", () => {
  it("titles the page, marks Companies, and names the window", () => {
    const document = render("");

    expect(document.title).toBe("Portfolio coverage · Press Monitor");
    expect(text(document.querySelector("h1"))).toBe("Portfolio coverage");
    expect(
      document
        .querySelector('.site-nav a[href="/"]')
        ?.getAttribute("aria-current"),
    ).toBe("page");
    expect(text(document.querySelector(".window-sentence"))).toBe(
      "Last quarter: 1 Jul – 30 Sep 2026 (UTC)",
    );
    expect(
      document.querySelector("form[data-filters]")?.getAttribute("action"),
    ).toBe("/");
  });

  it("captions the table with the verdict and the window", () => {
    expect(text(render("").querySelector("caption"))).toBe(
      "All visible mentions, Last quarter (1 Jul – 30 Sep 2026, UTC)",
    );
    expect(text(render("verdict=negative").querySelector("caption"))).toBe(
      "Negative mentions, Last quarter (1 Jul – 30 Sep 2026, UTC)",
    );
  });

  it("offers the name filter to script users only", () => {
    const document = render("");

    expect(
      document.querySelector("[data-name-filter]")?.hasAttribute("hidden"),
    ).toBe(true);
    expect(document.querySelector('label[for="name-filter"]')).not.toBeNull();
    expect(text(document.querySelector("#name-filter-count"))).toBe(
      "Showing 4 of 4 companies",
    );
    expect(
      document.querySelector("#name-filter-empty")?.hasAttribute("hidden"),
    ).toBe(true);
    expect(
      document.querySelector("#name-filter-empty [data-clear-filter]"),
    ).not.toBeNull();
  });
});

describe("index page rows", () => {
  it("lists rows in the given order with a link that keeps the filters", () => {
    const document = render("");
    const links = [...document.querySelectorAll("tbody th a")];

    expect(
      links.map((link) => [text(link), link.getAttribute("href")]),
    ).toEqual([
      ["Acme <Quantum>", "/companies/acme?window=last&verdict=all"],
      ["kestrel", "/companies/kestrel?window=last&verdict=all"],
      ["saltmarsh", "/companies/saltmarsh?window=last&verdict=all"],
      ["aster", "/companies/aster?window=last&verdict=all"],
    ]);
  });

  it("keeps custom dates in the company link", () => {
    const document = render("window=custom&from=2026-08-01&to=2026-08-31");

    expect(document.querySelector("tbody th a")?.getAttribute("href")).toBe(
      "/companies/acme?window=custom&verdict=all&from=2026-08-01&to=2026-08-31",
    );
  });

  it("shows aliases and lowercases name and aliases for the name filter", () => {
    const document = render("");

    expect(text(document.querySelector("tbody tr .company-aliases"))).toBe(
      "Also Acme AI, AcmeQ",
    );
    expect(document.querySelector("tbody tr")?.dataset.search).toBe(
      "acme <quantum> acme ai acmeq",
    );
  });

  it("says how long ago each company was last mentioned", () => {
    const document = render("");
    const cells = "tbody tr td:nth-of-type(1)";

    expect(
      [...document.querySelectorAll(`${cells} .cell-label`)].map((label) =>
        text(label),
      ),
    ).toEqual(Array.from({ length: 4 }, () => "Last mentioned"));
    expect(
      [...document.querySelectorAll(`${cells} time, ${cells} .muted`)].map(
        (value) => text(value),
      ),
    ).toEqual(["Today", "1 day ago", "12 days ago", "No coverage"]);
    expect(
      document.querySelector(`${cells} time`)?.getAttribute("datetime"),
    ).toBe("2026-10-05T08:00:00.000Z");
  });
});

describe("index page coverage cells", () => {
  it("shows the tally and tones, or that the window is empty", () => {
    const document = render("");
    const first = "tbody tr:first-child td:nth-of-type(2)";

    expect(text(document.querySelector(`${first} .tally`))).toBe(
      "18 mentions, 11 rated",
    );
    expect(
      [...document.querySelectorAll(`${first} .tone`)].map((tone) =>
        text(tone),
      ),
    ).toEqual(["6 positive", "3 negative", "2 neutral"]);
    expect(
      text(
        document.querySelector(
          "tbody tr:nth-child(2) td:nth-of-type(2) .muted",
        ),
      ),
    ).toBe("No mentions in this window");
  });

  it("draws the rated tone share as a bar, and none without a rated mention", () => {
    const bars = render("").querySelectorAll(".tone-bar");
    const rects = [...(bars[0]?.querySelectorAll("rect") ?? [])];

    expect(bars).toHaveLength(1);
    expect(bars[0]?.getAttribute("viewBox")).toBe("0 0 11 1");
    expect(rects.map((rect) => rect.getAttribute("width"))).toEqual([
      "6",
      "2",
      "3",
    ]);
  });
});

describe("index page states", () => {
  it("explains No coverage under the table when a row has none", () => {
    expect(text(render("").querySelector(".table-footnote"))).toBe(
      "“No coverage” means nothing found since 1 Jul 2026, when collection started.",
    );
    expect(
      render("", { rows: [ACME] }).querySelector(".table-footnote"),
    ).toBeNull();
  });

  it("replaces the table when a verdict leaves no company", () => {
    const document = render("verdict=negative", { rows: [] });

    expect(document.querySelector("table")).toBeNull();
    expect(document.querySelector("[data-name-filter]")).toBeNull();
    expect(text(document.querySelector(".empty-state__title"))).toBe(
      "No negative mentions in Last quarter (1 Jul – 30 Sep 2026, UTC).",
    );
    expect(
      document.querySelector(".empty-state__actions a")?.getAttribute("href"),
    ).toBe("/?window=last&verdict=all");
  });

  it("says no mentions exist yet before classification, without the footnote", () => {
    const document = render("", { anyMention: false, rows: [ASTER] });

    expect(
      document.querySelector('.banner[role="note"]')?.dataset.verdict,
    ).toBe("neutral");
    expect(text(document.querySelector(".banner"))).toBe(
      "i No mentions yet. Articles are being collected, and companies fill in here as they're classified.",
    );
    expect(document.querySelector(".table-footnote")).toBeNull();
  });

  it("says collection has not run when nothing is stored", () => {
    const document = render("", {
      anyMention: false,
      collection: "not-run",
      rows: [],
    });

    expect(text(document.querySelector(".banner"))).toBe(
      "i Collection has not run yet. Companies fill in here after the first collection and classification run.",
    );
    expect(document.querySelector(".table-footnote")).toBeNull();
  });

  it("shows only the panel when the store has no company yet", () => {
    const document = render("", {
      anyMention: false,
      collection: "not-run",
      rows: [],
    });

    expect(document.querySelector("[data-name-filter]")).toBeNull();
    expect(document.querySelector("table")).toBeNull();
    expect(document.querySelector("[data-name-filter-empty]")).toBeNull();
  });
});

describe("index page with bad filters", () => {
  it("names the problem, keeps the typed values, and shows no results", () => {
    const document = render("window=custom&from=2026-09-30&to=2026-07-01");

    expect(document.title).toBe("Error: Portfolio coverage · Press Monitor");
    expect(text(document.querySelector(".error-summary h2"))).toBe(
      "Check the dates",
    );
    expect(document.querySelector("#from")?.getAttribute("value")).toBe(
      "2026-09-30",
    );
    expect(document.querySelector("table")).toBeNull();
    expect(document.querySelector(".window-sentence")).toBeNull();
    expect(text(document.querySelector(".empty-state"))).toBe(
      "No results to show. Fix the date range above, then apply it to see coverage.",
    );
  });

  it("asks to fix the filters for an unknown verdict", () => {
    const document = render("verdict=bogus");

    expect(text(document.querySelector(".error-summary h2"))).toBe(
      "Check the filters",
    );
    expect(text(document.querySelector(".empty-state__body"))).toBe(
      "Fix the filters above, then apply them to see coverage.",
    );
  });
});
