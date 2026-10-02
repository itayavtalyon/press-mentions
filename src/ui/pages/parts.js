import { html, safeHref } from "./markup.js";
import { plural } from "./page.js";

/**
 * Shared parts (`docs/ui-design.md` §4): the components more than one page uses. The frame around every
 * page is `page.js`.
 */

/**
 * @typedef {ReturnType<typeof html>} Html
 * @typedef {import("../../core/dashboard.js").Tally} Tally
 */

/**
 * @param {string} verdict A visible verdict.
 * @returns {Html} Dot and word, colored by `data-verdict`.
 */
export function chip(verdict) {
  return html`<span class="chip" data-verdict="${verdict}"
    >${dot()}${capitalized(verdict)}</span
  >`;
}

/**
 * @param {string} word Lowercase word.
 * @returns {string} The word with a capital first letter.
 */
export function capitalized(word) {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

/**
 * The article link rule (ADR 0008): the publisher URL, else the Google URL, and only when it is http(s).
 * @param {{ title: string, publisherUrl: string | undefined, googleUrl: string }} article One stored article.
 * @returns {Html | string} The title as an external link, or as text when no URL may be linked.
 */
export function articleLink({ title, publisherUrl, googleUrl }) {
  const href = safeHref(publisherUrl ?? googleUrl);
  return href === undefined
    ? title
    : html`<a class="external" href="${href}" rel="noopener noreferrer"
        >${title}</a
      >`;
}
/**
 * @param {number} days Whole elapsed days since the last mention.
 * @returns {string} `today`, `1 day ago`, or `3 days ago`.
 */
export function ago(days) {
  return days === 0 ? "today" : plural(days, "day ago", "days ago");
}

/**
 * @param {Tally} tally Window counts.
 * @returns {string} `18 mentions, 11 rated`.
 */
export function tallyText(tally) {
  return `${plural(tally.mentions, "mention", "mentions")}, ${tally.rated} rated`;
}
/**
 * @param {Tally} tally Window counts.
 * @returns {Html} Positive, negative, and neutral counts. A zero is muted.
 */
export function tones(tally) {
  return html`<span class="tones"
    >${tone("positive", tally.positive)}${tone("negative", tally.negative)}${tone("neutral", tally.neutral)}</span
  >`;
}
/**
 * @param {{ title: string, body?: string, actions?: Html }} state What is empty, why, and what to do.
 * @returns {Html} The one empty-state block.
 */
export function emptyState({ title, body, actions }) {
  return html`<div class="empty-state">
    <p class="empty-state__title">${title}</p>
    ${body !== undefined && html`<p class="empty-state__body">${body}</p>`}
    ${actions !== undefined && html`<p class="empty-state__actions">${actions}</p>`}
  </div>`;
}
/**
 * @typedef {object} FieldOptions One labeled input (`docs/ui-design.md` §4).
 * @property {string} id Input id. The error paragraph is `<id>-error`.
 * @property {string} name Form field name.
 * @property {string} type Input type.
 * @property {string} label Visible label.
 * @property {string} value Current value.
 * @property {string | undefined} error Message naming the field, or undefined when it is fine.
 * @property {boolean} focus Whether the input takes focus on load.
 * @property {Html} [attributes] Extra input attributes, each with a leading space.
 */
/**
 * @param {FieldOptions} options The input and its state.
 * @returns {Html} Label, input, and the error the input points to.
 */
export function formField(options) {
  const { id, error } = options;
  const invalid =
    error !== undefined &&
    html` aria-invalid="true" aria-describedby="${id}-error"`;
  const message =
    error !== undefined &&
    html`<p class="field-error" id="${id}-error">${error}</p>`;
  const focus = options.focus && html` autofocus`;
  return html`<div class="field">
    <label for="${id}">${options.label}</label>
    <input
      class="input"
      type="${options.type}"
      id="${id}"
      name="${options.name}"
      value="${options.value}"
      ${options.attributes}${invalid}${focus}
    />
    ${message}
  </div>`;
}
/**
 * @param {"positive" | "neutral"} kind Success, or a neutral notice.
 * @param {string} text The outcome.
 * @returns {Html} A status banner, announced to screen readers.
 */
export function statusBanner(kind, text) {
  const icon = kind === "positive" ? "✓" : "i";
  return html`<div class="banner" data-verdict="${kind}" role="status">
    <span class="banner__icon" aria-hidden="true">${icon}</span>
    <p>${text}</p>
  </div>`;
}
/**
 * @param {"positive" | "negative" | "neutral"} verdict Tone.
 * @param {number} count Mentions with that tone.
 * @returns {Html} One tone count.
 */
function tone(verdict, count) {
  return html`<span
    class="tone${count === 0 && " is-zero"}"
    data-verdict="${verdict}"
    >${dot()}${count} ${verdict}</span
  >`;
}
/**
 * @returns {Html} The decorative verdict dot.
 */
function dot() {
  return html`<span class="dot" aria-hidden="true"></span>`;
}
