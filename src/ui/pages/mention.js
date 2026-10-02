import { VISIBLE_VERDICTS } from "../../core/filters.js";

import { html } from "./markup.js";
import { timeUtc } from "./page.js";
import { articleLink, capitalized, chip } from "./parts.js";

/**
 * Mention list (`docs/ui-design.md` §6.2): verdict sections in digest order, each mention with its link,
 * source, verdict, text source, and excerpt.
 */

/**
 * @typedef {ReturnType<typeof html>} Html
 * @typedef {import("../../infra/coverage-read.js").MentionRow} MentionRow
 */

const EXCERPT_LIMIT = 300;

/**
 * @param {MentionRow[]} mentions Visible mentions, newest first.
 * @returns {Html} One section per verdict that has mentions, negative first. Each keeps newest first.
 */
export function mentionSections(mentions) {
  return html`${VISIBLE_VERDICTS.map((verdict) => {
    const group = mentions.filter((mention) => mention.verdict === verdict);
    return group.length > 0 && verdictSection(verdict, group, mentions);
  })}`;
}

/**
 * @param {string} text Extracted article text.
 * @returns {string} Whitespace collapsed, cut at the last word boundary at or before 300 characters, with `…`
 *   only when cut.
 */
export function excerptText(text) {
  const collapsed = text.replaceAll(/\s+/gu, " ").trim();
  if (collapsed.length <= EXCERPT_LIMIT) {
    return collapsed;
  }
  const boundary = collapsed.lastIndexOf(" ", EXCERPT_LIMIT);
  return `${collapsed.slice(0, boundary > 0 ? boundary : EXCERPT_LIMIT)}…`;
}

/**
 * @param {string} verdict One visible verdict.
 * @param {MentionRow[]} group Its mentions, newest first.
 * @param {MentionRow[]} all Every mention on the page, for unique heading ids.
 * @returns {Html} One section.
 */
function verdictSection(verdict, group, all) {
  return html`<section
    class="verdict-section"
    data-verdict="${verdict}"
    aria-labelledby="section-${verdict}"
  >
    <h2 id="section-${verdict}">
      <span class="dot" aria-hidden="true"></span>${capitalized(verdict)}
      <span class="count">· ${group.length}</span>
    </h2>
    <ol class="mentions">
      ${group.map((mention) => mentionItem(mention, all.indexOf(mention)))}
    </ol>
  </section>`;
}

/**
 * @param {MentionRow} mention One mention.
 * @param {number} index Its position on the page.
 * @returns {Html} The mention: linked title, source and time, verdict, text source, and excerpt.
 */
function mentionItem(mention, index) {
  const titleId = `m-${index}-title`;
  const publisher =
    mention.publisherName !== undefined && `${mention.publisherName} · `;
  const headline =
    mention.textSource === "title" &&
    html`<span
      class="tag"
      title="Classified from the headline; no article text was extracted"
      >Headline only</span
    >`;
  const excerpt =
    mention.excerpt !== undefined &&
    html`<details>
      <summary>Excerpt</summary>
      <p class="excerpt">${excerptText(mention.excerpt)}</p>
    </details>`;
  return html`<li>
    <article class="mention" aria-labelledby="${titleId}">
      <h3 id="${titleId}">${articleLink(mention)}</h3>
      <p class="mention__meta">
        <span class="mention__source"
          >${publisher}${timeUtc(mention.publishedAt)}</span
        >${chip(mention.verdict)}${headline}
      </p>
      ${excerpt}
    </article>
  </li>`;
}
