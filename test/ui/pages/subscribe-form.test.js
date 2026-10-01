import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";

import {
  subscribeBanner,
  subscribeButton,
  subscribeDialog,
  subscribeInline,
  subscriptionMessage,
} from "../../../src/ui/pages/subscribe-form.js";

const ACME = { displayName: "Acme <Labs>", id: "acme" };

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

describe("subscribeButton and subscribeDialog", () => {
  it("opens the dialog through invoker commands", () => {
    const button = dom(subscribeButton()).querySelector("button");

    expect(button?.getAttribute("type")).toBe("button");
    expect(button?.getAttribute("commandfor")).toBe("subscribe");
    expect(button?.getAttribute("command")).toBe("show-modal");
    expect(text(button)).toBe("Get email alerts");
  });

  it("holds a labeled POST form the page script can find", () => {
    const document = dom(subscribeDialog(ACME));

    expect(
      document
        .querySelector("dialog#subscribe")
        ?.getAttribute("aria-labelledby"),
    ).toBe("subscribe-title");
    expect(text(document.querySelector("#subscribe-title"))).toBe(
      "Email alerts for Acme <Labs>",
    );
    expect(text(document.querySelector(".dialog__intro"))).toBe(
      "Get an email when the daily check finds new coverage of Acme <Labs>.",
    );
    expect(
      document.querySelector("form[data-subscribe]")?.getAttribute("action"),
    ).toBe("/companies/acme/subscriptions");
    expect(
      document.querySelector("form[data-subscribe]")?.getAttribute("method"),
    ).toBe("post");
    expect(
      document
        .querySelector("form[data-subscribe]")
        ?.hasAttribute("novalidate"),
    ).toBe(true);
  });

  it("asks for an address and offers Cancel and Subscribe", () => {
    const document = dom(subscribeDialog(ACME));
    const input = document.querySelector("#subscribe-email");

    expect(input?.getAttribute("type")).toBe("email");
    expect(input?.getAttribute("name")).toBe("email");
    expect(input?.getAttribute("autocomplete")).toBe("email");
    expect(input?.getAttribute("maxlength")).toBe("254");
    expect(input?.hasAttribute("autofocus")).toBe(false);
    expect(
      document.querySelector('[command="close"]')?.getAttribute("commandfor"),
    ).toBe("subscribe");
    expect(text(document.querySelector('button[type="submit"]'))).toBe(
      "Subscribe",
    );
  });
});

describe("subscribeInline", () => {
  it("keeps the typed address, marks the field, and drops Cancel", () => {
    const document = dom(
      subscribeInline(ACME, { problem: "invalid", value: "itay@example" }),
    );
    const input = document.querySelector("#subscribe-email");

    expect(
      document
        .querySelector("section.subscribe-inline")
        ?.getAttribute("aria-labelledby"),
    ).toBe("subscribe-title");
    expect(input?.getAttribute("value")).toBe("itay@example");
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    expect(input?.hasAttribute("autofocus")).toBe(true);
    expect(text(document.querySelector("#subscribe-email-error"))).toBe(
      "Email address: enter an address like name@example.com.",
    );
    expect(document.querySelector('[command="close"]')).toBeNull();
  });
});

/**
 * @type {[Parameters<typeof subscriptionMessage>[1], string][]}
 */
const MESSAGES = [
  [{ email: "a@b.co", state: "created" }, "Subscribed a@b.co to Acme <Labs>."],
  [{ email: "a@b.co", state: "exists" }, "a@b.co is already subscribed."],
  [
    { problem: "empty", state: "invalid", value: "" },
    "Email address: enter your email address.",
  ],
  [
    { problem: "invalid", state: "invalid", value: "x" },
    "Email address: enter an address like name@example.com.",
  ],
  [
    { problem: "long", state: "invalid", value: "x" },
    "Email address: use 254 characters or fewer.",
  ],
];

describe("subscription messages", () => {
  it.each(MESSAGES)("says %j", (subscription, expected) => {
    expect(subscriptionMessage(ACME, subscription)).toBe(expected);
  });

  it.each([
    ["created", "positive", "✓"],
    ["exists", "neutral", "i"],
  ])("shows a %s banner as %s", (state, tone, icon) => {
    const document = dom(
      subscribeBanner(ACME, {
        email: "a@b.co",
        state: state === "created" ? "created" : "exists",
      }),
    );

    expect(
      document.querySelector('.banner[role="status"]')?.dataset.verdict,
    ).toBe(tone);
    expect(text(document.querySelector(".banner__icon"))).toBe(icon);
  });
});
