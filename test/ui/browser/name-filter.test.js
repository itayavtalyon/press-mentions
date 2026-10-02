import { afterEach, describe, expect, it, vi } from "vitest";

import { parseFilters } from "../../../src/core/filters.js";
import {
  countText,
  initNameFilter,
  matches,
} from "../../../src/ui/browser/name-filter.js";
import { indexPage } from "../../../src/ui/pages/index-page.js";

const NOW = new Date("2026-10-05T12:00:00.000Z");

/**
 * @param {string} id Slug.
 * @param {string} displayName Name.
 * @param {string[]} [aliases] Aliases.
 * @returns {import("../../../src/core/dashboard.js").CompanyCoverage} One index row.
 */
const company = (id, displayName, aliases = []) => ({
  aliases,
  counts: { negative: 0, neutral: 0, positive: 0, unranked: 0 },
  descriptor: undefined,
  displayName,
  id,
  lastMentionedAt: undefined,
});

/**
 * Renders the real index into the page and starts the name filter.
 * @returns {{ input: HTMLInputElement, count: () => string, visible: () => string[] }} The field and readers.
 */
const givenIndex = () => {
  const result = parseFilters(new URLSearchParams(""), NOW);
  if (!("filters" in result)) {
    throw new TypeError("default filters must parse");
  }
  const rows = [
    company("acme", "Acme Quantum", ["AcmeQ"]),
    company("harvey", "Harvey"),
    company("wave", "Wave"),
  ];
  const page = indexPage(
    { collection: NOW, flagged: 0, now: NOW },
    { anyMention: true, filters: result.filters, form: result.form, rows },
  );
  const markup = String(page);
  // Only the main content: the head's stylesheet and script would make happy-dom fetch them.
  document.body.innerHTML = markup.slice(
    markup.indexOf("<main"),
    markup.indexOf("</main>") + "</main>".length,
  );
  initNameFilter(document, { delay: 150 });
  const input = document.querySelector("#name-filter");
  if (!(input instanceof HTMLInputElement)) {
    throw new TypeError("the index markup changed");
  }
  return {
    count: () =>
      document.querySelector("#name-filter-count")?.textContent?.trim() ?? "",
    input,
    visible: () =>
      [...document.querySelectorAll("tr")].flatMap((row) =>
        row.dataset.search === undefined || row.hidden
          ? []
          : [row.dataset.search],
      ),
  };
};

/**
 * Types into the name field, as a reader would.
 * @param {string} value Text to type.
 * @returns {void}
 */
const type = (value) => {
  const field = document.querySelector("#name-filter");
  if (!(field instanceof HTMLInputElement)) {
    throw new TypeError("no name field");
  }
  field.value = value;
  field.dispatchEvent(new Event("input"));
};

afterEach(() => {
  vi.useRealTimers();
});

describe("name filter", () => {
  it("shows the tools that are hidden without script", () => {
    givenIndex();

    expect(
      document.querySelector("[data-name-filter]")?.hasAttribute("hidden"),
    ).toBe(false);
  });

  it("filters rows by name and alias, ignoring case and outer spaces", () => {
    const { visible } = givenIndex();

    type("  ACMEQ ");

    expect(visible()).toEqual(["acme quantum acmeq"]);
    type(" ".repeat(3));
    expect(visible()).toHaveLength(3);
  });

  it("updates the count once typing pauses", () => {
    vi.useFakeTimers();
    const { count } = givenIndex();

    type("h");
    type("ha");
    vi.advanceTimersByTime(149);
    const early = count();
    vi.advanceTimersByTime(1);

    expect(early).toBe("Showing 3 of 3 companies");
    expect(count()).toBe("Showing 1 of 3 companies");
  });
});

describe("name filter misses", () => {
  it("hides the table and repeats the query as text when nothing matches", () => {
    givenIndex();

    type("<b>zzz</b>");

    expect(document.querySelector("#companies")?.hasAttribute("hidden")).toBe(
      true,
    );
    expect(
      document.querySelector("#name-filter-empty")?.hasAttribute("hidden"),
    ).toBe(false);
    expect(document.querySelector("[data-query]")?.textContent).toBe(
      "<b>zzz</b>",
    );
    expect(document.querySelector("[data-query] b")).toBeNull();
  });

  it("clears the filter, the count, and puts focus back in the field", () => {
    vi.useFakeTimers();
    const { input, count, visible } = givenIndex();
    type("zzz");

    document
      .querySelector("[data-clear-filter]")
      ?.dispatchEvent(new Event("click"));

    expect(input.value).toBe("");
    expect(visible()).toHaveLength(3);
    expect(count()).toBe("Showing 3 of 3 companies");
    expect(document.activeElement).toBe(input);
  });

  it.each([
    ["no tools", ""],
    [
      "tools without a field",
      '<div data-name-filter></div><div data-name-filter-empty></div><table id="companies"></table>',
    ],
  ])("does nothing on a page with %s", (_name, markup) => {
    document.body.innerHTML = markup;

    expect(() => {
      initNameFilter(document);
    }).not.toThrow();
  });
});

describe("name filter text", () => {
  it.each([
    ["acme quantum", "", true],
    ["acme quantum", "quant", true],
    ["acme quantum", "wave", false],
  ])("matches %j against %j: %s", (text, needle, expected) => {
    expect(matches(text, needle)).toBe(expected);
  });

  it.each([
    [0, 1, "Showing 0 of 1 company"],
    [12, 40, "Showing 12 of 40 companies"],
  ])("counts %i of %i", (shown, total, expected) => {
    expect(countText(shown, total)).toBe(expected);
  });
});
