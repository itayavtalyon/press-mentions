import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";

import { html } from "../../../src/ui/pages/markup.js";
import {
  APP_NAME,
  chip,
  emptyState,
  formatDay,
  formatRange,
  formatUtcStamp,
  layout,
  plural,
  tallyText,
  timeUtc,
  tones,
} from "../../../src/ui/pages/page.js";

const NOW = new Date("2026-10-05T12:38:00.000Z");

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

describe("format helpers", () => {
  it.each([
    ["2026-07-01T00:00:00.000Z", "1 Jul 2026"],
    ["2026-09-30T23:59:59.999Z", "30 Sep 2026"],
    ["2026-12-31T12:00:00.000Z", "31 Dec 2026"],
  ])("formats %s as %s", (iso, expected) => {
    expect(formatDay(new Date(iso))).toBe(expected);
  });

  it.each([
    ["2026-07-01", "2026-09-30", "1 Jul – 30 Sep 2026"],
    ["2025-12-15", "2026-01-10", "15 Dec 2025 – 10 Jan 2026"],
    ["2026-10-01", "2026-10-01", "1 Oct 2026"],
  ])("formats the range %s to %s", (from, to, expected) => {
    expect(formatRange(new Date(from), new Date(to))).toBe(expected);
  });

  it("formats an instant in UTC to the minute", () => {
    expect(formatUtcStamp("2026-09-28T08:15:59.000Z")).toBe(
      "28 Sep 2026, 08:15 UTC",
    );
  });

  it.each([
    [0, "0 mentions"],
    [1, "1 mention"],
    [18, "18 mentions"],
  ])("pluralizes %i", (count, expected) => {
    expect(plural(count, "mention", "mentions")).toBe(expected);
  });
});

describe("components", () => {
  it("marks a verdict chip with a word and a hidden dot", () => {
    const document = dom(chip("negative"));

    expect(document.querySelector(".chip")?.dataset.verdict).toBe("negative");
    expect(text(document.querySelector(".chip"))).toBe("Negative");
    expect(
      document.querySelector(".chip .dot")?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("writes the tally line and marks zero tones", () => {
    const tally = {
      mentions: 3,
      negative: 0,
      neutral: 1,
      positive: 2,
      rated: 3,
    };
    const spans = [...dom(tones(tally)).querySelectorAll(".tone")];

    expect(tallyText(tally)).toBe("3 mentions, 3 rated");
    expect(tallyText({ ...tally, mentions: 1, rated: 0 })).toBe(
      "1 mention, 0 rated",
    );
    expect(
      spans.map((span) => [text(span), span.classList.contains("is-zero")]),
    ).toEqual([
      ["2 positive", false],
      ["0 negative", true],
      ["1 neutral", false],
    ]);
  });
});

describe("time and empty state", () => {
  it("prints a UTC time the page script can localize", () => {
    const time = dom(timeUtc("2026-09-29T14:05:00.000Z")).querySelector("time");

    expect(time?.getAttribute("datetime")).toBe("2026-09-29T14:05:00.000Z");
    expect(time?.hasAttribute("data-local")).toBe(true);
    expect(text(time)).toBe("29 Sep 2026, 14:05 UTC");
  });

  it("renders an empty state without the parts it is not given", () => {
    const document = dom(emptyState({ title: "Nothing is flagged." }));

    expect(text(document.querySelector(".empty-state__title"))).toBe(
      "Nothing is flagged.",
    );
    expect(document.querySelector(".empty-state__body")).toBeNull();
    expect(document.querySelector(".empty-state__actions")).toBeNull();
  });

  it("renders an empty state's body as text and its actions as markup", () => {
    const document = dom(
      emptyState({
        actions: html`<a href="/">Show all</a>`,
        body: "Fix <it>.",
        title: "No results to show.",
      }),
    );

    expect(text(document.querySelector(".empty-state__body"))).toBe(
      "Fix <it>.",
    );
    expect(text(document.querySelector(".empty-state__actions a"))).toBe(
      "Show all",
    );
  });
});

/**
 * @param {Partial<Parameters<typeof layout>[0]>} [overrides] Layout options.
 * @returns {Page} The whole page.
 */
const page = (overrides = {}) => {
  const rendered = layout({
    body: html`<h1>Body</h1>`,
    collection: new Date("2026-07-01T00:00:00.000Z"),
    current: "companies",
    flagged: 3,
    now: NOW,
    title: "Portfolio <coverage>",
    ...overrides,
  });
  return parseHTML(String(rendered)).document;
};

describe("layout head and shell", () => {
  it("titles the page and loads the stylesheet and script from this server", () => {
    const document = page();

    expect(document.title).toBe(`Portfolio <coverage> · ${APP_NAME}`);
    expect(
      document.querySelector('link[rel="stylesheet"]')?.getAttribute("href"),
    ).toBe("/app.css");
    expect(
      document.querySelector('script[type="module"]')?.getAttribute("src"),
    ).toBe("/app.js");
  });

  it("names the app Press Monitor", () => {
    expect(APP_NAME).toBe("Press Monitor");
  });

  it("starts with a skip link to main", () => {
    const document = page();

    expect(
      document.querySelector("body > a.skip-link")?.getAttribute("href"),
    ).toBe("#main");
    expect(document.querySelector("main#main")?.getAttribute("tabindex")).toBe(
      "-1",
    );
    expect(text(document.querySelector("main h1"))).toBe("Body");
  });
});

describe("layout nav and footer", () => {
  it.each(
    /** @type {const} */ ([
      { current: "companies", expected: ["page", "none"] },
      { current: "review", expected: ["none", "page"] },
      { current: undefined, expected: ["none", "none"] },
    ]),
  )("marks $current as the current nav item", ({ current, expected }) => {
    const document = page({ current });
    const links = [...document.querySelectorAll(".site-nav a")];

    expect(
      links.map((link) => link.getAttribute("aria-current") ?? "none"),
    ).toEqual(expected);
  });

  it("counts flagged rows in the nav", () => {
    const document = page();

    expect(
      text(document.querySelector('.site-nav a[href="/review"] .badge')),
    ).toBe("3");
    expect(
      text(
        document.querySelector('.site-nav a[href="/review"] .visually-hidden'),
      ),
    ).toBe(", 3 flagged");
  });

  it("drops the badge when nothing is flagged", () => {
    const document = page({ flagged: 0 });

    expect(text(document.querySelector('.site-nav a[href="/review"]'))).toBe(
      "Review",
    );
    expect(
      document.querySelector('.site-nav a[href="/review"] .badge'),
    ).toBeNull();
  });
});

describe("layout footer", () => {
  it("says when the data was read and when collection started", () => {
    const document = page();

    expect(text(document.querySelector(".site-footer p"))).toBe(
      "Data as of 5 Oct 2026, 12:38 UTC · Collecting since 1 Jul 2026",
    );
    expect(
      document.querySelector(".site-footer time")?.getAttribute("datetime"),
    ).toBe(NOW.toISOString());
  });

  it("says collection has not run when nothing is stored", () => {
    const document = page({ collection: "not-run" });

    expect(text(document.querySelector(".site-footer p"))).toBe(
      "Data as of 5 Oct 2026, 12:38 UTC · Collection has not run yet",
    );
  });

  it("leaves the collection note out when it is unknown", () => {
    const document = page({ collection: "unknown" });

    expect(text(document.querySelector(".site-footer p"))).toBe(
      "Data as of 5 Oct 2026, 12:38 UTC",
    );
  });
});
