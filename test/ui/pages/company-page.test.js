import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";

import { parseFilters } from "../../../src/core/filters.js";
import { companyPage } from "../../../src/ui/pages/company-page.js";

const NOW = new Date("2026-10-05T12:00:00.000Z");
const JULY = new Date("2026-07-01T00:00:00.000Z");

/**
 * @typedef {import("../../../src/infra/coverage-read.js").MentionRow} MentionRow
 * @typedef {import("../../../src/ui/pages/company-page.js").CompanyView} CompanyView
 * @typedef {ReturnType<typeof parseHTML>["document"]} Page
 */

/**
 * @param {{ textContent: string | null } | null | undefined} node Rendered node.
 * @returns {string} Its text with whitespace collapsed, as a browser shows it.
 */
const text = (node) =>
  (node?.textContent ?? "").replaceAll(/\s+/gu, " ").trim();

/**
 * @param {string} guid Article id.
 * @param {string} verdict Visible verdict.
 * @param {Partial<MentionRow>} [fields] Overrides.
 * @returns {MentionRow} One mention.
 */
const mention = (guid, verdict, fields = {}) => ({
  excerpt: undefined,
  ownSite: false,
  googleUrl: `https://news.google.com/rss/articles/${guid}`,
  guid,
  publishedAt: "2026-09-01T10:00:00.000Z",
  publisherName: "The Ledger",
  publisherUrl: `https://ledger.example/${guid}`,
  textSource: "body",
  title: `Title ${guid}`,
  verdict,
  ...fields,
});

const MENTIONS = [
  mention("p1", "positive", { publishedAt: "2026-09-20T10:00:00.000Z" }),
  mention("n1", "negative", { publishedAt: "2026-09-10T10:00:00.000Z" }),
  mention("p2", "positive"),
  mention("u1", "unranked", { textSource: "title" }),
];

/**
 * @param {string} search Query string.
 * @param {Partial<CompanyView> & { collection?: Date | "not-run" }} [overrides] Page state.
 * @returns {Page} The rendered company page.
 */
const render = (search, overrides = {}) => {
  const result = parseFilters(new URLSearchParams(search), NOW);
  const { collection = JULY, ...view } = overrides;
  return parseHTML(
    String(
      companyPage(
        { collection, flagged: 0, now: NOW },
        {
          company: {
            aliases: ["Acme AI", "AcmeQ"],
            counts: { negative: 1, neutral: 0, positive: 2, unranked: 1 },
            descriptor: "Warehouse robotics",
            displayName: "Acme <Labs>",
            id: "acme",
            lastMentionedAt: "2026-10-02T09:00:00.000Z",
          },
          filters: "filters" in result ? result.filters : undefined,
          form: result.form,
          mentions: MENTIONS,
          problems: "problems" in result ? result.problems : [],
          subscription: { state: "idle" },
          ...view,
        },
      ),
    ),
  ).document;
};

describe("company page timeline", () => {
  it("charts counted mentions per week across the window, with a title per week", () => {
    const document = render("window=last");
    const columns = [...document.querySelectorAll(".timeline__chart g")];

    expect(columns).toHaveLength(14);
    expect(
      [...document.querySelectorAll(".timeline__axis span")].map((day) =>
        text(day),
      ),
    ).toEqual(["1 Jul 2026", "30 Sep 2026"]);
    expect(text(columns[11]?.querySelector("title"))).toBe(
      "Week of 16 Sep 2026: 1 mention (1 positive)",
    );
  });
});

describe("company page head and summary", () => {
  it("names the company, its aliases and descriptor, and links back with the filters", () => {
    const document = render("verdict=all");

    expect(document.title).toBe("Acme <Labs> · Press Monitor");
    expect(text(document.querySelector("h1"))).toBe("Acme <Labs>");
    expect(text(document.querySelector(".company-head__aliases"))).toBe(
      "Also known as Acme AI, AcmeQ",
    );
    expect(text(document.querySelector(".company-head__descriptor"))).toBe(
      "Warehouse robotics",
    );
    expect(document.querySelector("a.back-link")?.getAttribute("href")).toBe(
      "/?window=last&verdict=all",
    );
  });

  it("shows last mentioned, the window tally, and what each covers", () => {
    const document = render("");

    expect(text(document.querySelector(".summary__status"))).toBe(
      "Last mentioned 3 days ago",
    );
    expect(text(document.querySelector(".summary__tally .tally"))).toBe(
      "4 mentions, 3 rated",
    );
    expect(text(document.querySelector(".summary__note"))).toBe(
      "Counts cover the selected window. “Last mentioned” covers all collected data. Posts on the company’s own site are listed but not counted.",
    );
    expect(
      document.querySelector("form[data-filters]")?.getAttribute("action"),
    ).toBe("/companies/acme");
  });

  it.each([
    [JULY, "No coverage found since 1 Jul 2026"],
    ["not-run", "Collection has not run yet"],
  ])("says when a company was never mentioned (%s)", (collection, status) => {
    const company = {
      aliases: [],
      counts: { negative: 0, neutral: 0, positive: 0, unranked: 0 },
      descriptor: undefined,
      displayName: "Quiet",
      id: "quiet",
      lastMentionedAt: undefined,
    };
    const document = render("", {
      collection: collection === "not-run" ? "not-run" : JULY,
      company,
      mentions: [],
    });

    expect(text(document.querySelector(".summary__status"))).toBe(status);
    expect(text(document.querySelector(".summary__tally .tally"))).toBe(
      "0 mentions, 0 rated",
    );
    expect(document.querySelector(".company-head__aliases")).toBeNull();
    expect(document.querySelector(".company-head__descriptor")).toBeNull();
  });
});

describe("company page empty window", () => {
  it("names the window and offers wider views", () => {
    const document = render("window=this&verdict=negative", { mentions: [] });
    const links = [...document.querySelectorAll(".empty-state__actions a")];

    expect(text(document.querySelector(".empty-state__title"))).toBe(
      "No negative mentions of Acme <Labs> in This quarter (1 Oct – 5 Oct 2026, UTC).",
    );
    expect(
      links.map((link) => [text(link), link.getAttribute("href")]),
    ).toEqual([
      ["Show last quarter", "/companies/acme?window=last&verdict=negative"],
      [
        "Show all coverage since 1 Jul 2026",
        "/companies/acme?window=custom&verdict=negative&from=2026-07-01&to=2026-10-05",
      ],
      ["Show all verdicts", "/companies/acme?window=this&verdict=all"],
    ]);
  });

  it("offers no action that would show the same thing", () => {
    const document = render("", { collection: "not-run", mentions: [] });

    expect(text(document.querySelector(".empty-state__title"))).toBe(
      "No mentions of Acme <Labs> in Last quarter (1 Jul – 30 Sep 2026, UTC).",
    );
    expect(document.querySelector(".empty-state__actions a")).toBeNull();
  });
});

describe("company page outcomes", () => {
  it("keeps last mentioned but shows no results for bad filters", () => {
    const document = render("window=custom&from=x&to=2026-08-01");

    expect(document.title).toBe("Error: Acme <Labs> · Press Monitor");
    expect(text(document.querySelector(".summary__status"))).toBe(
      "Last mentioned 3 days ago",
    );
    expect(document.querySelector(".summary__tally")).toBeNull();
    expect(text(document.querySelector(".error-summary h2"))).toBe(
      "Check the dates",
    );
    expect(document.querySelector(".window-sentence")).toBeNull();
    expect(document.querySelector(".verdict-section")).toBeNull();
    expect(document.querySelector("a.back-link")?.getAttribute("href")).toBe(
      "/",
    );
  });

  it("puts the subscribe banner first in main", () => {
    const document = render("", {
      subscription: { email: "a@b.co", state: "created" },
    });

    expect(document.title).toBe("Subscribed: Acme <Labs> · Press Monitor");
    expect(document.querySelector("main > .banner")?.getAttribute("role")).toBe(
      "status",
    );
    expect(document.querySelector("dialog#subscribe")).not.toBeNull();
  });

  it("opens the form in the page for a refused address, without the dialog or the button", () => {
    const document = render("", {
      subscription: { problem: "empty", state: "invalid", value: "" },
    });

    expect(document.title).toBe("Error: Acme <Labs> · Press Monitor");
    expect(
      document.querySelector(".company-intro .subscribe-inline"),
    ).not.toBeNull();
    expect(document.querySelector("dialog")).toBeNull();
    expect(document.querySelector('[command="show-modal"]')).toBeNull();
  });
});
