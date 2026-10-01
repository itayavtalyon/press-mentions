import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";

import { excerptText, mentionSections } from "../../../src/ui/pages/mention.js";

/**
 * @typedef {import("../../../src/infra/coverage-read.js").MentionRow} MentionRow
 */

/**
 * @param {{ toString(): string }} fragment Rendered markup.
 * @returns {ReturnType<typeof parseHTML>["document"]} A document whose body holds it.
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
 * @param {string} guid Article id.
 * @param {string} verdict Visible verdict.
 * @param {Partial<MentionRow>} [fields] Overrides.
 * @returns {MentionRow} One mention.
 */
const mention = (guid, verdict, fields = {}) => ({
  excerpt: undefined,
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

describe("mentionSections", () => {
  it("groups by verdict in digest order, keeps newest first, and omits empty sections", () => {
    const document = dom(mentionSections(MENTIONS));

    expect(
      [...document.querySelectorAll(".verdict-section h2")].map((heading) =>
        text(heading),
      ),
    ).toEqual(["Negative · 1", "Positive · 2", "Unranked · 1"]);
    expect(
      [...document.querySelectorAll("[data-verdict=positive] h3")].map(
        (heading) => text(heading),
      ),
    ).toEqual(["Title p1", "Title p2"]);
    expect(
      document
        .querySelector("[data-verdict=negative]")
        ?.getAttribute("aria-labelledby"),
    ).toBe("section-negative");
  });

  it("links the title to the publisher, marks a headline judgment, and dates it in UTC", () => {
    const document = dom(mentionSections(MENTIONS));

    expect(document.querySelector("#m-0-title a")?.getAttribute("href")).toBe(
      "https://ledger.example/p1",
    );
    expect(document.querySelector("#m-0-title a")?.getAttribute("rel")).toBe(
      "noopener noreferrer",
    );
    expect(
      text(document.querySelector("[data-verdict=unranked] .mention__source")),
    ).toBe("The Ledger · 1 Sep 2026, 10:00 UTC");
    expect(text(document.querySelector("[data-verdict=unranked] .tag"))).toBe(
      "Headline only",
    );
    expect(document.querySelector("[data-verdict=negative] .tag")).toBeNull();
    expect(text(document.querySelector("[data-verdict=negative] .chip"))).toBe(
      "Negative",
    );
  });
});

describe("mentionSections links and excerpts", () => {
  it("falls back to the Google link, and prints an unsafe link as text", () => {
    const document = dom(
      mentionSections([
        mention("g", "neutral", {
          publisherName: undefined,
          publisherUrl: undefined,
        }),
        mention("bad", "neutral", { publisherUrl: "javascript:alert(1)" }),
      ]),
    );

    expect(document.querySelector("#m-0-title a")?.getAttribute("href")).toBe(
      "https://news.google.com/rss/articles/g",
    );
    expect(
      text(
        document.querySelector("[aria-labelledby=m-0-title] .mention__source"),
      ),
    ).toBe("1 Sep 2026, 10:00 UTC");
    expect(document.querySelector("#m-1-title a")).toBeNull();
    expect(text(document.querySelector("#m-1-title"))).toBe("Title bad");
  });

  it("shows an excerpt only when there is text", () => {
    const document = dom(
      mentionSections([mention("x", "positive", { excerpt: "Body   text" })]),
    );

    expect(text(document.querySelector("details .excerpt"))).toBe("Body text");
  });

  it("leaves the excerpt out when there is no text", () => {
    const document = dom(mentionSections(MENTIONS));

    expect(document.querySelector("details")).toBeNull();
  });
});

describe("excerptText", () => {
  it("keeps short text, with whitespace collapsed", () => {
    expect(excerptText("  A\n\tshort   text ")).toBe("A short text");
  });

  it("cuts long text at the last word boundary at or before 300 characters", () => {
    const cut = excerptText(`${"word ".repeat(70)}tail`);

    expect(cut.endsWith("word…")).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(301);
  });

  it("cuts one long word at 300 characters", () => {
    expect(excerptText("x".repeat(400))).toBe(`${"x".repeat(300)}…`);
  });
});
