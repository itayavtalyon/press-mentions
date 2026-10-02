import { afterEach, describe, expect, it, vi } from "vitest";

import { parseFilters } from "../../../src/core/filters.js";
import {
  formatLocal,
  initAutoSubmit,
  initCommandFallback,
  initLocalTimes,
  main,
  restoreFocus,
  shouldAutoSubmit,
} from "../../../src/ui/browser/app.js";
import { filterForm } from "../../../src/ui/pages/filter-form.js";
import { timeUtc } from "../../../src/ui/pages/page.js";
import {
  subscribeButton,
  subscribeDialog,
} from "../../../src/ui/pages/subscribe-form.js";

const NOW = new Date("2026-10-05T12:00:00.000Z");
const FORMATTER = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jerusalem",
});

/**
 * @returns {never} Always throws, as blocked storage does (Safari private mode).
 */
const blocked = () => {
  throw new Error("blocked");
};

/**
 * @type {Storage}
 */
const BLOCKED = {
  clear: blocked,
  getItem: blocked,
  key: blocked,
  length: 0,
  removeItem: blocked,
  setItem: blocked,
};

/**
 * Renders the real filter form into the page.
 * @param {string} [search] Query string.
 * @returns {HTMLFormElement} The form.
 */
const givenFilterForm = (search = "") => {
  const result = parseFilters(new URLSearchParams(search), NOW);
  document.body.innerHTML = String(
    filterForm({ action: "/", form: result.form, problems: [] }),
  );
  const form = document.querySelector("form");
  if (form === null) {
    throw new TypeError("the filter form markup changed");
  }
  return form;
};

/**
 * @param {string} group Radio group.
 * @param {string} value Radio value.
 * @returns {HTMLInputElement} That radio.
 */
const radio = (group, value) => {
  const input = [...document.querySelectorAll("input")].find(
    (candidate) => candidate.name === group && candidate.value === value,
  );
  if (input === undefined) {
    throw new TypeError(`no ${group}=${value} radio`);
  }
  return input;
};

/**
 * @param {Element | null} element What changed.
 * @returns {void}
 */
const change = (element) => {
  element?.dispatchEvent(new Event("change", { bubbles: true }));
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  document.body.replaceChildren();
});

describe("local times", () => {
  it("shows a data-local time in the reader's zone and keeps the UTC text as its title", () => {
    document.body.innerHTML = String(timeUtc("2026-09-29T14:05:00.000Z"));

    initLocalTimes(document, FORMATTER);

    expect(document.querySelector("time")?.textContent).toBe(
      "29 Sept 2026, 17:05",
    );
    expect(document.querySelector("time")?.title).toBe(
      "29 Sep 2026, 14:05 UTC",
    );
  });

  it("leaves other times and invalid instants alone", () => {
    document.body.innerHTML =
      '<time datetime="2026-09-29T14:05:00.000Z">Today</time><time datetime="nope" data-local>kept</time>';

    initLocalTimes(document, FORMATTER);

    expect(
      [...document.querySelectorAll("time")].map((time) => time.textContent),
    ).toEqual(["Today", "kept"]);
    expect(formatLocal("nope", FORMATTER)).toBeUndefined();
  });
});

describe("auto-submit", () => {
  it.each([
    ["window", "last", true],
    ["window", "custom", false],
    ["verdict", "negative", true],
  ])("submits %s=%s: %s", (group, value, expected) => {
    givenFilterForm();

    expect(shouldAutoSubmit(radio(group, value))).toBe(expected);
  });

  it("submits a radio change and remembers the radio", () => {
    const form = givenFilterForm();
    const submitted = vi
      .spyOn(form, "requestSubmit")
      .mockImplementation(() => {});
    initAutoSubmit(document, sessionStorage);

    change(radio("verdict", "negative"));

    expect(submitted).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem("pm:focus")).toBe(
      '{"name":"verdict","value":"negative"}',
    );
  });

  it("submits even when storage is blocked, and ignores Custom, dates, the form itself, and a page without it", () => {
    expect(() => {
      initAutoSubmit(document, BLOCKED);
    }).not.toThrow();
    const form = givenFilterForm();
    const submitted = vi
      .spyOn(form, "requestSubmit")
      .mockImplementation(() => {});
    initAutoSubmit(document, BLOCKED);

    change(radio("window", "custom"));
    change(document.querySelector("#from"));
    change(form);
    change(radio("window", "this"));

    expect(submitted).toHaveBeenCalledOnce();
  });
});

describe("focus restore", () => {
  it("focuses the remembered radio and forgets it", () => {
    givenFilterForm("window=this");
    sessionStorage.setItem("pm:focus", '{"name":"window","value":"this"}');

    restoreFocus(document, sessionStorage);

    expect(document.activeElement).toBe(radio("window", "this"));
    expect(sessionStorage.getItem("pm:focus")).toBeNull();
  });

  it.each([
    ["bad JSON", "{"],
    ["a JSON number", "3"],
    ["no matching radio", '{"name":"window","value":"week"}'],
  ])("ignores %s", (_case, saved) => {
    givenFilterForm();
    sessionStorage.setItem("pm:focus", saved);

    restoreFocus(document, sessionStorage);

    expect(document.activeElement).toBe(document.body);
  });

  it("ignores nothing stored, blocked storage, and a page without the form", () => {
    givenFilterForm();
    restoreFocus(document, sessionStorage);
    document.body.replaceChildren();
    sessionStorage.setItem("pm:focus", '{"name":"window","value":"this"}');
    restoreFocus(document, sessionStorage);

    expect(() => {
      restoreFocus(document, BLOCKED);
    }).not.toThrow();
    expect(document.activeElement).toBe(document.body);
  });
});

/**
 * Renders the real subscribe button and dialog.
 * @returns {HTMLDialogElement} The dialog.
 */
const givenDialog = () => {
  document.body.innerHTML = `${String(subscribeButton())}${String(subscribeDialog({ displayName: "Acme", id: "acme" }))}`;
  const dialog = document.querySelector("dialog");
  if (dialog === null) {
    throw new TypeError("the dialog markup changed");
  }
  return dialog;
};

/**
 * @param {string} command Value of the button's `command` attribute.
 * @returns {void}
 */
const click = (command) => {
  for (const button of document.querySelectorAll("button")) {
    if (button.getAttribute("command") === command) {
      button.dispatchEvent(new Event("click"));
    }
  }
};

describe("invoker-command fallback", () => {
  it("adds nothing where invoker commands work", () => {
    const opened = vi.spyOn(givenDialog(), "showModal");
    initCommandFallback(document, { command: "" });

    click("show-modal");

    expect(opened).not.toHaveBeenCalled();
  });

  it("opens and closes the dialog where they do not", () => {
    const dialog = givenDialog();
    initCommandFallback(document, {});

    click("show-modal");
    const wasOpen = dialog.open;
    click("show-modal");
    click("close");

    expect(wasOpen).toBe(true);
    expect(dialog.open).toBe(false);
  });

  it("ignores missing targets, other commands, and plain buttons", () => {
    document.body.innerHTML = `<button commandfor="nope" command="show-modal">a</button><button commandfor="nope" command="close">b</button>
      <button commandfor="d" command="toggle">c</button><dialog id="d"></dialog><button>plain</button>`;
    initCommandFallback(document, {});

    for (const button of document.querySelectorAll("button")) {
      button.dispatchEvent(new Event("click"));
    }

    expect(document.querySelector("dialog")?.open).toBe(false);
  });
});

describe("main", () => {
  it("marks the page as scripted and runs each enhancement", () => {
    document.body.innerHTML = String(timeUtc("2026-09-29T14:05:00.000Z"));

    main(document, {
      buttonPrototype: undefined,
      formatter: FORMATTER,
      send: vi.fn(),
      storage: sessionStorage,
    });

    expect(document.documentElement.classList.contains("js")).toBe(true);
    expect(document.querySelector("time")?.textContent).toBe(
      "29 Sept 2026, 17:05",
    );
  });

  it("starts on DOMContentLoaded with the browser's own storage, format, and fetch", async () => {
    const send = vi.fn(async () =>
      Response.json({ message: "ok", outcome: "created" }),
    );
    vi.stubGlobal("fetch", send);
    givenDialog();
    document.documentElement.classList.remove("js");

    document.dispatchEvent(new Event("DOMContentLoaded"));
    document
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { cancelable: true }));

    expect(document.documentElement.classList.contains("js")).toBe(true);
    await vi.waitFor(() => {
      expect(send).toHaveBeenCalledOnce();
    });
  });
});
