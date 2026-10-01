import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";

import { html, safeHref } from "../../../src/ui/pages/markup.js";

/**
 * @param {{ toString(): string }} fragment Rendered markup.
 * @returns {ReturnType<typeof parseHTML>["document"]} A document whose body holds it.
 */
const dom = (fragment) =>
  parseHTML(`<!doctype html><html><body>${String(fragment)}</body></html>`)
    .document;

describe("html", () => {
  it("escapes every interpolated string", () => {
    expect(String(html`<p>${"<script>&\"'"}</p>`)).toBe(
      "<p>&lt;script&gt;&amp;&quot;&#39;</p>",
    );
  });

  it("escapes inside attributes, so a quote cannot end the value", () => {
    const document = dom(html`<a title="${'" onclick="x'}">t</a>`);

    expect(document.querySelector("a")?.getAttribute("title")).toBe(
      '" onclick="x',
    );
    expect(document.querySelector("[onclick]")).toBeNull();
  });

  it("does not escape a nested fragment twice", () => {
    const inner = html`<b>${"<i>"}</b>`;

    expect(String(html`<div>${inner}</div>`)).toBe(
      "<div><b>&lt;i&gt;</b></div>",
    );
  });

  it("joins lists, prints numbers, and drops undefined and false", () => {
    const items = ["<a>", html`<b></b>`];

    expect(String(html`${items}|${3}|${undefined}|${false}`)).toBe(
      "&lt;a&gt;<b></b>|3||",
    );
  });
});

describe("safeHref", () => {
  it.each([
    ["https://example.com/a?b=1&c=2", "https://example.com/a?b=1&c=2"],
    // eslint-disable-next-line unicorn/prefer-https -- Plain http links from publishers are allowed.
    ["http://example.com", "http://example.com/"],
    [" https://example.com/x", "https://example.com/x"],
  ])("keeps %j", (raw, expected) => {
    expect(safeHref(raw)).toBe(expected);
  });

  it.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>",
    "mailto:a@example.com",
    "/relative/path",
    "example.com",
    "",
  ])("refuses %j", (raw) => {
    expect(safeHref(raw)).toBeUndefined();
  });
});
