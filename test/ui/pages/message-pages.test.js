import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";

import {
  pageNotFound,
  serverError,
} from "../../../src/ui/pages/message-pages.js";

const SHELL = {
  collection: new Date("2026-07-01T00:00:00.000Z"),
  flagged: 2,
  now: new Date("2026-10-05T12:00:00.000Z"),
};

/**
 * @param {{ textContent: string | null } | null | undefined} node Rendered node.
 * @returns {string} Its text with whitespace collapsed, as a browser shows it.
 */
const text = (node) =>
  (node?.textContent ?? "").replaceAll(/\s+/gu, " ").trim();

/**
 * @param {{ toString(): string }} page Rendered page.
 * @returns {ReturnType<typeof parseHTML>["document"]} The document.
 */
const dom = (page) => parseHTML(String(page)).document;

describe("pageNotFound", () => {
  it("names the missing path as text and links back to the index", () => {
    const document = dom(pageNotFound(SHELL, "/nope<b>"));

    expect(document.title).toBe("Page not found · Press Monitor");
    expect(text(document.querySelector(".message-page h1"))).toBe(
      "Page not found",
    );
    expect(text(document.querySelector(".message-page p"))).toBe(
      "There's no page at “/nope<b>”.",
    );
    expect(
      document.querySelector(".message-page a.btn")?.getAttribute("href"),
    ).toBe("/");
    expect(document.querySelector("[aria-current]")).toBeNull();
  });
});

describe("serverError", () => {
  it("points to the server log and does not claim a collection date", () => {
    const document = dom(
      serverError({ ...SHELL, collection: "unknown", flagged: 0 }),
    );

    expect(document.title).toBe("Something went wrong · Press Monitor");
    expect(text(document.querySelector(".message-page p"))).toBe(
      "The error is in the server log.",
    );
    expect(text(document.querySelector(".site-footer"))).not.toContain(
      "Collect",
    );
  });
});
