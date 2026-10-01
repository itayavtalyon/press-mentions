import { html } from "./markup.js";
import { layout } from "./page.js";

/**
 * Message pages (`docs/ui-design.md` §6.7): a page that says one thing and links back to the index.
 */

/**
 * @typedef {import("./page.js").Shell} Shell
 * @typedef {ReturnType<typeof html>} Html
 */

/**
 * @param {Shell} shell Shell state.
 * @param {string} path The path that has no page.
 * @returns {Html} The 404 page.
 */
export function pageNotFound(shell, path) {
  return messagePage(shell, "Page not found", `There's no page at “${path}”.`);
}

/**
 * @param {Shell} shell Shell state that does not depend on the store, which may be what failed.
 * @returns {Html} The 500 page.
 */
export function serverError(shell) {
  return messagePage(
    shell,
    "Something went wrong",
    "The error is in the server log.",
  );
}

/**
 * @param {Shell} shell Shell state.
 * @param {string} title Heading and page title.
 * @param {string} text The one sentence.
 * @returns {Html} A full page with no nav item marked.
 */
function messagePage(shell, title, text) {
  return layout({
    ...shell,
    body: html`<div class="message-page">
      <h1>${title}</h1>
      <p>${text}</p>
      <a class="btn" href="/">Back to all companies</a>
    </div>`,
    current: undefined,
    title,
  });
}
