import { initNameFilter } from "./name-filter.js";
import { initSubscribe } from "./subscribe.js";

/**
 * Page script (`docs/ui-design.md` §7, §9). Every page works without it. It localizes times, submits
 * filter radios on change, restores focus after that reload, filters index rows by name, opens the
 * dialog where invoker commands are missing, and subscribes from the dialog without a reload.
 */

/**
 * @typedef {object} Dependencies Everything the script reaches outside the page, so tests can inject it.
 * @property {Storage} storage Session storage for focus restore.
 * @property {Intl.DateTimeFormat} formatter The reader's date and time format.
 * @property {import("./subscribe.js").Fetch} send Network port for the subscribe dialog.
 * @property {object | undefined} buttonPrototype `HTMLButtonElement.prototype`, to detect invoker commands.
 */

const FOCUS_KEY = "pm:focus";

/**
 * Runs once when the page has loaded.
 * @param {Document} page The page.
 * @param {Dependencies} dependencies Storage, formatter, network, and button support.
 * @returns {void}
 */
export function main(page, dependencies) {
  page.documentElement.classList.add("js");
  initLocalTimes(page, dependencies.formatter);
  initAutoSubmit(page, dependencies.storage);
  restoreFocus(page, dependencies.storage);
  initNameFilter(page);
  initCommandFallback(page, dependencies.buttonPrototype);
  initSubscribe(page, dependencies.send);
}

/**
 * Shows each `<time data-local>` in the reader's time zone and keeps the UTC text as its title.
 * @param {ParentNode} root Page or fragment.
 * @param {Intl.DateTimeFormat} formatter The reader's format.
 * @returns {void}
 */
export function initLocalTimes(root, formatter) {
  for (const time of root.querySelectorAll("time")) {
    const local =
      time.dataset.local === undefined
        ? undefined
        : formatLocal(time.dateTime, formatter);
    if (local === undefined) {
      continue;
    }
    time.title = time.textContent;
    time.textContent = local;
  }
}

/**
 * @param {string} iso An instant.
 * @param {Intl.DateTimeFormat} formatter The reader's format.
 * @returns {string | undefined} The local text, or undefined for an invalid instant.
 */
export function formatLocal(iso, formatter) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : formatter.format(date);
}

/**
 * Submits the filter form when a radio changes, except Custom, which only reveals the dates (spec §7.3).
 * @param {ParentNode} root Page or fragment.
 * @param {Storage} storage Where the changed radio is remembered.
 * @returns {void}
 */
export function initAutoSubmit(root, storage) {
  const form = filterForm(root);
  form?.addEventListener("change", ({ target }) => {
    if (!(target instanceof HTMLInputElement) || !shouldAutoSubmit(target)) {
      return;
    }
    rememberFocus(storage, target);
    form.requestSubmit();
  });
}

/**
 * @param {HTMLInputElement} input The changed control.
 * @returns {boolean} True for a radio other than Custom. Date inputs never submit on change.
 */
export function shouldAutoSubmit(input) {
  return (
    input.type === "radio" &&
    !(input.name === "window" && input.value === "custom")
  );
}

/**
 * Focuses the radio that caused the last reload, then forgets it.
 * @param {ParentNode} root Page or fragment.
 * @param {Storage} storage Where the radio was remembered.
 * @returns {void}
 */
export function restoreFocus(root, storage) {
  const saved = readAndForget(storage);
  const wanted = saved === undefined ? undefined : parseFocus(saved);
  const form = filterForm(root);
  if (wanted === undefined || form === undefined) {
    return;
  }
  const input = [...form.querySelectorAll("input")].find(
    (candidate) =>
      candidate.name === wanted.name && candidate.value === wanted.value,
  );
  input?.focus();
}

/**
 * Opens and closes dialogs from `commandfor` buttons in browsers without invoker commands.
 * @param {ParentNode} root Page or fragment.
 * @param {object | undefined} buttonPrototype `HTMLButtonElement.prototype`.
 * @returns {void}
 */
export function initCommandFallback(root, buttonPrototype) {
  if (buttonPrototype === undefined || "command" in buttonPrototype) {
    return;
  }
  for (const button of root.querySelectorAll("button")) {
    const targetId = button.getAttribute("commandfor");
    const command = button.getAttribute("command");
    if (targetId !== null && command !== null) {
      button.addEventListener("click", () => {
        const dialog = [
          ...button.ownerDocument.querySelectorAll("dialog"),
        ].find((candidate) => candidate.id === targetId);
        runCommand(dialog, command);
      });
    }
  }
}

/**
 * @param {HTMLDialogElement | undefined} dialog The `commandfor` dialog, or undefined when no dialog has that id.
 * @param {string} command `show-modal` or `close`. Others are ignored.
 * @returns {void}
 */
function runCommand(dialog, command) {
  if (command === "show-modal" && dialog?.open === false) {
    dialog.showModal();
  } else if (command === "close") {
    dialog?.close();
  }
}

/**
 * @param {ParentNode} root Page or fragment.
 * @returns {HTMLFormElement | undefined} The filter form, when the page has one.
 */
function filterForm(root) {
  return [...root.querySelectorAll("form")].find(
    (form) => form.dataset.filters !== undefined,
  );
}

/**
 * @param {Storage} storage Session storage.
 * @param {HTMLInputElement} input The radio that is about to reload the page.
 * @returns {void}
 */
function rememberFocus(storage, input) {
  try {
    storage.setItem(
      FOCUS_KEY,
      JSON.stringify({ name: input.name, value: input.value }),
    );
  } catch {
    // Storage is blocked (Safari private mode). The filter still submits; focus just is not restored.
  }
}

/**
 * @param {Storage} storage Session storage.
 * @returns {string | undefined} The remembered radio, removed from storage, or undefined.
 */
function readAndForget(storage) {
  let saved;
  try {
    saved = storage.getItem(FOCUS_KEY) ?? undefined;
    storage.removeItem(FOCUS_KEY);
  } catch {
    // Storage is blocked. Nothing to restore.
  }
  return saved;
}

/**
 * @param {string} saved Stored JSON.
 * @returns {{ name: string, value: string } | undefined} The radio, or undefined for anything else.
 */
function parseFocus(saved) {
  /**
   * @type {unknown}
   */
  let value;
  try {
    value = JSON.parse(saved);
  } catch {
    // Not JSON. Ignore it.
  }
  return typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "value" in value
    ? { name: String(value.name), value: String(value.value) }
    : undefined;
}

// The entry: this module is the page's one script, so starting on load is its job.
// eslint-disable-next-line unicorn/no-top-level-side-effects -- The browser runs this file as the page script.
document.addEventListener("DOMContentLoaded", () => {
  main(document, {
    buttonPrototype: HTMLButtonElement.prototype,
    formatter: new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
    send: (input, init) => fetch(input, init),
    storage: sessionStorage,
  });
});
