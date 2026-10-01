import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";

import { html } from "../../../src/ui/pages/markup.js";
import {
  ago,
  chip,
  emptyState,
  formField,
  statusBanner,
  tallyText,
  tones,
} from "../../../src/ui/pages/parts.js";

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

describe("emptyState", () => {
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

describe("formField", () => {
  it("labels the input and keeps the value as text", () => {
    const document = dom(
      formField({
        attributes: html` required`,
        error: undefined,
        focus: false,
        id: "subscribe-email",
        label: "Email address",
        name: "email",
        type: "email",
        value: '"><b>',
      }),
    );
    const input = document.querySelector("#subscribe-email");

    expect(text(document.querySelector('label[for="subscribe-email"]'))).toBe(
      "Email address",
    );
    expect(input?.getAttribute("value")).toBe('"><b>');
    expect(input?.hasAttribute("required")).toBe(true);
    expect(input?.hasAttribute("aria-invalid")).toBe(false);
    expect(input?.hasAttribute("autofocus")).toBe(false);
    expect(document.querySelector(".field-error")).toBeNull();
  });

  it("marks, describes, and focuses an input with an error", () => {
    const document = dom(
      formField({
        error: "Email address: enter your email address.",
        focus: true,
        id: "e",
        label: "Email",
        name: "email",
        type: "email",
        value: "",
      }),
    );
    const input = document.querySelector("#e");

    expect(input?.getAttribute("aria-invalid")).toBe("true");
    expect(input?.getAttribute("aria-describedby")).toBe("e-error");
    expect(input?.hasAttribute("autofocus")).toBe(true);
    expect(text(document.querySelector("#e-error"))).toBe(
      "Email address: enter your email address.",
    );
  });
});

describe("statusBanner", () => {
  it.each([
    ["positive", "✓"],
    ["neutral", "i"],
  ])("announces a %s outcome with its icon", (tone, icon) => {
    const document = dom(
      statusBanner(tone === "positive" ? "positive" : "neutral", "Done <now>."),
    );

    expect(
      document.querySelector('.banner[role="status"]')?.dataset.verdict,
    ).toBe(tone);
    expect(text(document.querySelector(".banner__icon"))).toBe(icon);
    expect(text(document.querySelector(".banner p"))).toBe("Done <now>.");
  });
});

describe("ago", () => {
  it.each([
    [0, "today"],
    [1, "1 day ago"],
    [3, "3 days ago"],
  ])("reads %i days as %s", (days, expected) => {
    expect(ago(days)).toBe(expected);
  });
});
