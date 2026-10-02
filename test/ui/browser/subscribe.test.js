import { describe, expect, it, vi } from "vitest";

import {
  FAILURE_TEXT,
  initSubscribe,
  isOutcome,
  submitSubscription,
} from "../../../src/ui/browser/subscribe.js";
import {
  subscribeDialog,
  subscribeInline,
} from "../../../src/ui/pages/subscribe-form.js";

const ACME = { displayName: "Acme", id: "acme" };

/**
 * @param {unknown} body JSON body.
 * @param {number} [httpStatus] HTTP status.
 * @returns {Response} A JSON reply like the server's.
 */
const json = (body, httpStatus = 200) =>
  Response.json(body, { status: httpStatus });

/**
 * Renders the real dialog markup into the page.
 * @param {(input: string, init: RequestInit) => Promise<Response>} send Network port.
 * @returns {{ dialog: HTMLDialogElement, form: HTMLFormElement, input: HTMLInputElement }} The parts.
 */
const givenDialog = (send) => {
  document.body.innerHTML = String(subscribeDialog(ACME));
  initSubscribe(document, send);
  const dialog = document.querySelector("dialog");
  const form = document.querySelector("form");
  const input = document.querySelector("input");
  if (dialog === null || form === null || input === null) {
    throw new TypeError("the dialog markup changed");
  }
  dialog.showModal();
  return { dialog, form, input };
};

/**
 * @param {HTMLFormElement} form The dialog's form.
 * @returns {Promise<void>} Settles after the submit handler's request.
 */
const submit = async (form) => {
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  await vi.waitFor(() => {
    expect(
      form.querySelector("button[type=submit]")?.hasAttribute("disabled"),
    ).toBe(false);
  });
};

describe("subscribe in the dialog", () => {
  it("posts the address as a form body and asks for JSON", async () => {
    const send = vi.fn(async () => json({ message: "ok", outcome: "created" }));
    const { form, input } = givenDialog(send);
    input.value = "a@b.co";

    await submit(form);

    expect(send).toHaveBeenCalledWith(form.action, {
      body: new URLSearchParams({ email: "a@b.co" }),
      headers: { Accept: "application/json" },
      method: "POST",
    });
    expect(form.action.endsWith("/companies/acme/subscriptions")).toBe(true);
  });

  it("replaces the form with the outcome and a Close button that has focus", async () => {
    const { form } = givenDialog(async () =>
      json({ message: "Subscribed a@b.co to Acme.", outcome: "created" }),
    );

    await submit(form);

    expect(form.hidden).toBe(true);
    expect(document.querySelector('dialog [role="status"]')?.textContent).toBe(
      "Subscribed a@b.co to Acme.",
    );
    expect(document.activeElement?.textContent).toBe("Close");
  });

  it("closes from Close and starts fresh next time", async () => {
    const { dialog, form, input } = givenDialog(async () =>
      json({ message: "a@b.co is already subscribed.", outcome: "exists" }),
    );
    input.value = "a@b.co";
    await submit(form);

    document
      .querySelector("dialog [data-subscribe-done] button")
      ?.dispatchEvent(new Event("click"));
    dialog.dispatchEvent(new Event("close"));

    expect(dialog.open).toBe(false);
    expect(form.hidden).toBe(false);
    expect(input.value).toBe("");
    expect(dialog.querySelector("[data-subscribe-done]")).toBeNull();
  });
});

describe("subscribe errors in the dialog", () => {
  it("marks the field with the server's message and keeps focus there", async () => {
    const { form, input } = givenDialog(async () =>
      json(
        {
          field: "email",
          message: "Email address: enter your email address.",
          outcome: "invalid",
        },
        400,
      ),
    );

    await submit(form);

    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(
      "subscribe-email-error",
    );
    expect(document.querySelector("#subscribe-email-error")?.textContent).toBe(
      "Email address: enter your email address.",
    );
    expect(document.activeElement).toBe(input);
    expect(form.hidden).toBe(false);
  });
});

describe("subscribe failures in the dialog", () => {
  it("clears the last error before the next try", async () => {
    const replies = [
      json(
        {
          message: "Email address: enter your email address.",
          outcome: "invalid",
        },
        400,
      ),
      json({ message: "Subscribed a@b.co to Acme.", outcome: "created" }),
    ];
    const { form, input } = givenDialog(
      async () => replies.shift() ?? json({}),
    );
    await submit(form);

    await submit(form);

    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(document.querySelector("#subscribe-email-error")).toBeNull();
  });

  it.each([
    [
      "a page instead of JSON",
      async () =>
        new Response("<html>", {
          headers: { "content-type": "text/html" },
          status: 403,
        }),
    ],
    ["no content type", async () => new Response("", { status: 500 })],
    ["JSON that is not an outcome", async () => json({ error: "nope" })],
    [
      "a network failure",
      async () => {
        throw new TypeError("offline");
      },
    ],
    [
      "broken JSON",
      async () =>
        new Response("{", { headers: { "content-type": "application/json" } }),
    ],
  ])("asks to try again after %s, keeping the form", async (_name, send) => {
    const { form, input } = givenDialog(send);
    input.value = "a@b.co";

    await submit(form);

    expect(form.querySelector('[role="alert"]')?.textContent).toBe(
      FAILURE_TEXT,
    );
    expect(input.value).toBe("a@b.co");
    expect(document.activeElement).toBe(input);
  });
});

describe("subscribe setup", () => {
  it("leaves the inline form after a refused address to post the plain way", () => {
    document.body.innerHTML = String(
      subscribeInline(ACME, { problem: "empty", value: "" }),
    );
    const send = vi.fn();
    initSubscribe(document, send);
    const submitted = new Event("submit", { cancelable: true });

    document.querySelector("form")?.dispatchEvent(submitted);

    expect(submitted.defaultPrevented).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("does nothing on a page without the subscribe form", () => {
    document.body.innerHTML = "<form></form>";

    expect(() => {
      initSubscribe(document, vi.fn());
    }).not.toThrow();
  });

  it("does nothing for a form without an email field or a submit button", async () => {
    document.body.innerHTML =
      "<dialog><form data-subscribe><input name='other'></form></dialog>";
    const send = vi.fn();
    const form = document.querySelector("form");
    const dialog = document.querySelector("dialog");
    if (form === null || dialog === null) {
      throw new TypeError("fixture missing");
    }
    initSubscribe(document, send);

    await submitSubscription(form, dialog, send);
    dialog.dispatchEvent(new Event("close"));

    expect(send).not.toHaveBeenCalled();
  });
});

describe("isOutcome", () => {
  it.each([
    [{ message: "m", outcome: "created" }, true],
    [{ message: "m", outcome: "exists" }, true],
    [{ field: "email", message: "m", outcome: "invalid" }, true],
    [{ message: "m", outcome: "other" }, false],
    [{ message: 3, outcome: "created" }, false],
    [{ outcome: "created" }, false],
    [{ message: "m" }, false],
    ["created", false],
    [undefined, false],
  ])("reads %j as %s", (value, expected) => {
    expect(isOutcome(value)).toBe(expected);
  });

  it("refuses null", () => {
    expect(isOutcome(JSON.parse("null"))).toBe(false);
  });
});
