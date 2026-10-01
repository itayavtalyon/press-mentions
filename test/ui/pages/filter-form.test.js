import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";

import { parseFilters } from "../../../src/core/filters.js";
import {
  filterForm,
  problemSummary,
  windowPhrase,
  windowSentence,
} from "../../../src/ui/pages/filter-form.js";

const NOW = new Date("2026-10-05T12:00:00.000Z");

/**
 * @typedef {ReturnType<typeof parseHTML>["document"]} Page
 */

/**
 * @param {{ toString(): string }} fragment Rendered markup.
 * @returns {Page} A document whose body holds it.
 */
const dom = (fragment) =>
  parseHTML(`<!doctype html><html><body>${String(fragment)}</body></html>`)
    .document;

/**
 * @param {{ textContent: string | null } | null | undefined} node Rendered node.
 * @returns {string} Its text with whitespace collapsed, as a browser shows it.
 */
const text = (node) =>
  (node?.textContent ?? "").replaceAll(/\s+/gu, " ").trim();

/**
 * @param {string} search Query string.
 * @param {Date} [now] Read time.
 * @returns {import("../../../src/core/filters.js").FilterResult} Parsed request.
 */
const parse = (search, now = NOW) =>
  parseFilters(new URLSearchParams(search), now);

/**
 * @param {string} search Query string.
 * @returns {import("../../../src/core/filters.js").Problem[]} Its problems, or none.
 */
const problemsOf = (search) => {
  const result = parse(search);
  return "problems" in result ? result.problems : [];
};

/**
 * @param {string} search Query string.
 * @returns {Page} The rendered form for that request.
 */
const formFor = (search) =>
  dom(
    filterForm({
      action: "/companies/acme",
      form: parse(search).form,
      problems: problemsOf(search),
    }),
  );

/**
 * @param {string} search Query string that must parse.
 * @param {Date} [now] Read time.
 * @returns {import("../../../src/core/filters.js").Filters} The filters.
 */
const filtersOf = (search, now = NOW) => {
  const result = parse(search, now);
  if (!("filters" in result)) {
    throw new Error(`expected filters for "${search}"`);
  }
  return result.filters;
};

/**
 * @param {Page} document Rendered form.
 * @param {string} name Radio group.
 * @returns {string[]} Values of the checked radios.
 */
const checked = (document, name) =>
  [...document.querySelectorAll("input[checked]")]
    .filter((input) => input.getAttribute("name") === name)
    .map((input) => input.getAttribute("value") ?? "");

/**
 * @param {Page} document Rendered summary.
 * @returns {string[][]} Each link's target and text.
 */
const summaryLinks = (document) =>
  [...document.querySelectorAll(".error-summary a")].map((link) => [
    link.getAttribute("href") ?? "",
    text(link),
  ]);

describe("filterForm values", () => {
  it("is a GET form to the page it sits on, with the hint for script users", () => {
    const document = formFor("");

    expect(
      document.querySelector("form[data-filters]")?.getAttribute("method"),
    ).toBe("get");
    expect(document.querySelector("form")?.getAttribute("action")).toBe(
      "/companies/acme",
    );
    expect(document.querySelector("form")?.getAttribute("aria-label")).toBe(
      "Filters",
    );
    expect(text(document.querySelector(".filters__hint"))).toBe(
      "Results update as you change filters.",
    );
  });

  it("checks the defaults and prefills the last 90 days", () => {
    const document = formFor("");

    expect(checked(document, "window")).toEqual(["last"]);
    expect(checked(document, "verdict")).toEqual(["all"]);
    expect(document.querySelector("#from")?.getAttribute("value")).toBe(
      "2026-07-08",
    );
    expect(document.querySelector("#to")?.getAttribute("value")).toBe(
      "2026-10-05",
    );
  });

  it("reflects the request", () => {
    const document = formFor(
      "window=custom&from=2026-08-01&to=2026-08-31&verdict=negative",
    );

    expect(checked(document, "window")).toEqual(["custom"]);
    expect(checked(document, "verdict")).toEqual(["negative"]);
    expect(document.querySelector("#from")?.getAttribute("value")).toBe(
      "2026-08-01",
    );
    expect(document.querySelector("#to")?.getAttribute("value")).toBe(
      "2026-08-31",
    );
  });
});

describe("filterForm options", () => {
  it("offers every window and verdict, with summary targets on the first of each group", () => {
    const document = formFor("");

    expect(
      [...document.querySelectorAll(".segmented label")].map((label) =>
        text(label),
      ),
    ).toEqual(["Last quarter", "This quarter", "Custom"]);
    expect(
      [...document.querySelectorAll(".pill")].map((pill) => [
        text(pill),
        pill.dataset.verdict ?? "none",
      ]),
    ).toEqual([
      ["All visible", "none"],
      ["Positive", "positive"],
      ["Negative", "negative"],
      ["Neutral", "neutral"],
      ["Unranked", "unranked"],
    ]);
    expect(document.querySelector("#window-last")?.getAttribute("value")).toBe(
      "last",
    );
    expect(document.querySelector("#verdict-all")?.getAttribute("value")).toBe(
      "all",
    );
  });

  it("keeps a typed value as text", () => {
    const document = formFor('window=custom&from="><script>&to=2026-08-31');

    expect(document.querySelector("#from")?.getAttribute("value")).toBe(
      '"><script>',
    );
    expect(document.querySelector("script")).toBeNull();
  });
});

describe("filterForm problems", () => {
  it("marks a bad date, describes it, and focuses it", () => {
    const document = formFor("window=custom&from=2026-09-30&to=2026-07-01");
    const from = document.querySelector("#from");

    expect(from?.getAttribute("aria-invalid")).toBe("true");
    expect(from?.getAttribute("aria-describedby")).toBe("from-error");
    expect(from?.hasAttribute("autofocus")).toBe(true);
    expect(text(document.querySelector("#from-error"))).toBe(
      "From date must be on or before To date.",
    );
    expect(document.querySelector("#to")?.hasAttribute("aria-invalid")).toBe(
      false,
    );
  });

  it.each([
    { focused: ["from"], search: "window=custom&from=x&to=y" },
    { focused: ["to"], search: "window=custom&from=2026-08-01&to=y" },
  ])("focuses only the first bad date for $search", ({ focused, search }) => {
    const document = formFor(search);

    expect(
      [...document.querySelectorAll("[autofocus]")].map((input) => input.id),
    ).toEqual(focused);
  });
});

describe("problemSummary", () => {
  it("asks to check the dates and links each message to its field", () => {
    const document = dom(
      problemSummary(problemsOf("window=custom&from=x&to=y")),
    );

    expect(text(document.querySelector(".error-summary h2"))).toBe(
      "Check the dates",
    );
    expect(summaryLinks(document)).toEqual([
      ["#from", "From date: enter a date like 2026-07-01."],
      ["#to", "To date: enter a date like 2026-09-30."],
    ]);
  });

  it("asks to check the filters for an unknown window or verdict", () => {
    const document = dom(
      problemSummary(problemsOf("window=week&verdict=bogus")),
    );

    expect(text(document.querySelector(".error-summary h2"))).toBe(
      "Check the filters",
    );
    expect(summaryLinks(document)).toEqual([
      [
        "#window-last",
        "Time window: choose Last quarter, This quarter, or Custom.",
      ],
      [
        "#verdict-all",
        "Verdict: choose All visible, Positive, Negative, Neutral, or Unranked.",
      ],
    ]);
  });

  it("renders nothing without problems", () => {
    expect(String(problemSummary([]))).toBe("");
  });
});

describe("window sentence", () => {
  it.each([
    {
      expected: "Last quarter: 1 Jul – 30 Sep 2026 (UTC)",
      now: NOW,
      search: "",
    },
    {
      expected: "This quarter: 1 Oct – 5 Oct 2026 (UTC)",
      now: NOW,
      search: "window=this",
    },
    {
      expected: "This quarter: 1 Oct 2026 so far (UTC)",
      now: new Date("2026-10-01T09:00:00.000Z"),
      search: "window=this",
    },
    {
      expected: "This quarter: 1 Oct 2026 so far (UTC)",
      now: new Date("2026-10-01T00:00:00.000Z"),
      search: "window=this",
    },
    {
      expected: "Custom range: 15 Dec 2025 – 10 Jan 2026 (UTC)",
      now: NOW,
      search: "window=custom&from=2025-12-15&to=2026-01-10",
    },
    {
      expected: "Custom range: 1 Aug 2026 (UTC)",
      now: NOW,
      search: "window=custom&from=2026-08-01&to=2026-08-01",
    },
  ])("reads $expected", ({ expected, now, search }) => {
    expect(windowSentence(filtersOf(search, now))).toBe(expected);
  });

  it("has a phrase form for captions and empty states", () => {
    expect(windowPhrase(filtersOf(""))).toBe(
      "Last quarter (1 Jul – 30 Sep 2026, UTC)",
    );
  });
});
