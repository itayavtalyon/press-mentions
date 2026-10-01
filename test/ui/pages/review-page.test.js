import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";

import { reviewPage } from "../../../src/ui/pages/review-page.js";

const SHELL = {
  collection: new Date("2026-07-01T00:00:00.000Z"),
  flagged: 2,
  now: new Date("2026-10-05T12:00:00.000Z"),
};

/**
 * @typedef {import("../../../src/infra/coverage-read.js").FlaggedRow} FlaggedRow
 */

/**
 * @param {string} guid Article id.
 * @param {Partial<FlaggedRow>} [fields] Overrides.
 * @returns {FlaggedRow} One flagged row.
 */
const flagged = (guid, fields = {}) => ({
  companyId: "parcel",
  companyName: "Parcel <Mesh>",
  googleUrl: `https://news.google.com/rss/articles/${guid}`,
  guid,
  publishedAt: "2026-09-01T00:00:00.000Z",
  publisherUrl: `https://ledger.example/${guid}`,
  rawResponse: '{"Parcel Mesh": "maybe"} <script>',
  textSource: "body",
  title: `Title ${guid}`,
  ...fields,
});

/**
 * @param {{ textContent: string | null } | null | undefined} node Rendered node.
 * @returns {string} Its text with whitespace collapsed, as a browser shows it.
 */
const text = (node) =>
  (node?.textContent ?? "").replaceAll(/\s+/gu, " ").trim();

/**
 * @param {FlaggedRow[]} rows Flagged rows.
 * @returns {ReturnType<typeof parseHTML>["document"]} The rendered page.
 */
const render = (rows) => parseHTML(String(reviewPage(SHELL, rows))).document;

describe("review page", () => {
  it("titles the page, marks Review in the nav, and counts the rows", () => {
    const document = render([flagged("a"), flagged("b")]);

    expect(document.title).toBe("Review · Press Monitor");
    expect(text(document.querySelector("h1"))).toBe("Review");
    expect(text(document.querySelector(".page-header__lede"))).toBe(
      "Articles the classifier couldn't decide on. Read-only.",
    );
    expect(
      document
        .querySelector('.site-nav a[href="/review"]')
        ?.getAttribute("aria-current"),
    ).toBe("page");
    expect(text(document.querySelector(".table-note"))).toBe(
      "2 articles flagged",
    );
  });

  it("shows each row's company, title link, text source, and raw reply as text", () => {
    const document = render([flagged("a")]);

    expect(
      document.querySelector(".review-card__company")?.getAttribute("href"),
    ).toBe("/companies/parcel");
    expect(text(document.querySelector(".review-card__company"))).toBe(
      "Parcel <Mesh>",
    );
    expect(document.querySelector("#r0-title a")?.getAttribute("href")).toBe(
      "https://ledger.example/a",
    );
    expect(text(document.querySelector(".review-card__meta"))).toBe(
      "Text source: Full text",
    );
    expect(text(document.querySelector("#r0-reply"))).toBe("Model reply");
    expect(document.querySelector(".reply pre")?.textContent).toBe(
      '{"Parcel Mesh": "maybe"} <script>',
    );
    expect(
      document.querySelector(".reply pre")?.getAttribute("aria-labelledby"),
    ).toBe("r0-reply r0-title");
    expect(document.querySelector(".reply pre")?.getAttribute("tabindex")).toBe(
      "0",
    );
    expect(document.querySelector("main script")).toBeNull();
  });
});

describe("review cards", () => {
  it("falls back to the Google link, prints an unsafe link as text, and marks a headline judgment", () => {
    const document = render([
      flagged("g", { publisherUrl: undefined, textSource: "title" }),
      flagged("bad", { publisherUrl: "javascript:alert(1)" }),
    ]);

    expect(document.querySelector("#r0-title a")?.getAttribute("href")).toBe(
      "https://news.google.com/rss/articles/g",
    );
    expect(
      text(
        document.querySelector("[aria-labelledby=r0-title] .review-card__meta"),
      ),
    ).toBe("Text source: Headline only");
    expect(document.querySelector("#r1-title a")).toBeNull();
    expect(text(document.querySelector("#r1-title"))).toBe("Title bad");
  });

  it("says so when no reply was stored", () => {
    const document = render([flagged("a", { rawResponse: undefined })]);

    expect(document.querySelector(".reply pre")).toBeNull();
    expect(text(document.querySelector(".reply p"))).toBe(
      "No reply was stored.",
    );
  });

  it("counts one article in the singular", () => {
    const document = render([flagged("a")]);

    expect(text(document.querySelector(".table-note"))).toBe(
      "1 article flagged",
    );
  });

  it("shows the empty state when nothing is flagged", () => {
    const document = render([]);

    expect(document.querySelector(".review-list")).toBeNull();
    expect(document.querySelector(".table-note")).toBeNull();
    expect(text(document.querySelector(".empty-state"))).toBe(
      "Nothing is flagged. Uncertain classifications show up here for a human look.",
    );
  });
});
