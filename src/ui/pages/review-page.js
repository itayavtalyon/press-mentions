import { html } from "./markup.js";
import { layout, plural } from "./page.js";
import { articleLink, emptyState } from "./parts.js";

/**
 * Review page, `GET /review` (ADR 0002, `docs/ui-design.md` §6.5): every `uncertain` row with its raw
 * model reply, read-only, for a person to look at.
 */

/**
 * @typedef {import("./page.js").Shell} Shell
 * @typedef {ReturnType<typeof html>} Html
 * @typedef {import("../../infra/coverage-read.js").FlaggedRow} FlaggedRow
 */

/**
 * @param {Shell} shell Shell state.
 * @param {FlaggedRow[]} rows Flagged rows, newest first.
 * @returns {Html} The whole page.
 */
export function reviewPage(shell, rows) {
  const results =
    rows.length === 0
      ? emptyState({
          body: "Uncertain classifications show up here for a human look.",
          title: "Nothing is flagged.",
        })
      : html`<p class="table-note">
            ${plural(rows.length, "article", "articles")} flagged
          </p>
          <ol class="review-list">
            ${rows.map((row, index) => reviewCard(row, index))}
          </ol>`;
  return layout({
    ...shell,
    body: html`<div class="page-header">
        <h1>Review</h1>
        <p class="page-header__lede">
          Articles the classifier couldn't decide on. Read-only.
        </p>
      </div>
      ${results}`,
    current: "review",
    title: "Review",
  });
}

/**
 * @param {FlaggedRow} row One flagged row.
 * @param {number} index Its position, for unique ids.
 * @returns {Html} One review card.
 */
function reviewCard(row, index) {
  const titleId = `r${index}-title`;
  const replyId = `r${index}-reply`;
  const source = row.textSource === "title" ? "Headline only" : "Full text";
  const labels = `${replyId} ${titleId}`;
  // <pre> keeps whitespace, so the reply must follow the tag with no line break.
  // prettier-ignore
  const reply = row.rawResponse === undefined
    ? html`<p class="muted">No reply was stored.</p>`
    : html`<pre tabindex="0" role="group" aria-labelledby="${labels}">${row.rawResponse}</pre>`;
  return html`<li>
    <article class="review-card card" aria-labelledby="${titleId}">
      <a class="review-card__company" href="/companies/${row.companyId}"
        >${row.companyName}</a
      >
      <h2 id="${titleId}">${articleLink(row)}</h2>
      <p class="review-card__meta">Text source: ${source}</p>
      <figure class="reply">
        <figcaption id="${replyId}">Model reply</figcaption>
        ${reply}
      </figure>
    </article>
  </li>`;
}
