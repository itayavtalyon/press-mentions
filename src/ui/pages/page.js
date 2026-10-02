import { html } from "./markup.js";

/**
 * Page shell (`docs/ui-design.md` §3, §8): the UTC format helpers and the layout around every page.
 * Shared components are `parts.js`. Escaping is `markup.js`.
 */

/**
 * @typedef {ReturnType<typeof html>} Html
 * @typedef {Date | "not-run" | "unknown"} Collection When collection started, that it has not run, or unknown
 *   (the 500 page does not read the store).
 * @typedef {{ now: Date, flagged: number, collection: Collection }} Shell What every page shows around its body.
 * @typedef {object} PageContent
 * @property {string} title Page name, before ` · Press Monitor`.
 * @property {"companies" | "review" | undefined} current Nav item to mark.
 * @property {Html} body Main content.
 * @typedef {Shell & PageContent} LayoutOptions
 */

export const APP_NAME = "Press Monitor";
const MONTHS = "JanFebMarAprMayJunJulAugSepOctNovDec";

/**
 * @param {Date} date Instant.
 * @returns {string} Its UTC day, such as `1 Jul 2026`.
 */
export function formatDay(date) {
  return `${dayAndMonth(date)} ${date.getUTCFullYear()}`;
}

/**
 * @param {Date} from First day.
 * @param {Date} to Last day, inclusive.
 * @returns {string} `1 Jul – 30 Sep 2026`, `15 Dec 2025 – 10 Jan 2026`, or `1 Oct 2026` for one day.
 */
export function formatRange(from, to) {
  const end = formatDay(to);
  if (formatDay(from) === end) {
    return end;
  }
  const start =
    from.getUTCFullYear() === to.getUTCFullYear()
      ? dayAndMonth(from)
      : formatDay(from);
  return `${start} – ${end}`;
}

/**
 * @param {string} iso Instant as ISO text.
 * @returns {string} `28 Sep 2026, 08:15 UTC`.
 */
export function formatUtcStamp(iso) {
  const date = new Date(iso);
  return `${formatDay(date)}, ${date.toISOString().slice(11, 16)} UTC`;
}

/**
 * @param {number} count How many.
 * @param {string} one Singular noun.
 * @param {string} many Plural noun.
 * @returns {string} `1 mention` or `18 mentions`.
 */
export function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * @param {LayoutOptions} page Page content and shell state.
 * @returns {Html} The whole document.
 */
export function layout(page) {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${page.title} · ${APP_NAME}</title>
        <link rel="stylesheet" href="/app.css" />
        <script type="module" src="/app.js"></script>
      </head>
      <body>
        <a class="skip-link" href="#main">Skip to main content</a>
        <header class="site-header">
          <div class="container">
            <a class="brand" href="/">${APP_NAME}</a>
            <nav class="site-nav" aria-label="Main">
              <ul>
                <li>
                  <a
                    href="/"
                    ${page.current === "companies" && html` aria-current="page"`}
                    >Companies</a
                  >
                </li>
                <li>
                  <a
                    href="/review"
                    ${page.current === "review" && html` aria-current="page"`}
                    >${reviewLabel(page.flagged)}</a
                  >
                </li>
              </ul>
            </nav>
          </div>
        </header>
        <main id="main" class="page container" tabindex="-1">${page.body}</main>
        <footer class="site-footer">
          <div class="container">
            <p>
              Data as of
              ${timeUtc(page.now.toISOString())}${collectionNote(page.collection)}
            </p>
          </div>
        </footer>
      </body>
    </html> `;
}

/**
 * @param {string} iso Instant as ISO text.
 * @returns {Html} A `<time>` in UTC that the page script localizes.
 */
export function timeUtc(iso) {
  return html`<time datetime="${iso}" data-local>${formatUtcStamp(iso)}</time>`;
}

/**
 * @param {Date} date Instant.
 * @returns {string} `1 Jul` in UTC.
 */
function dayAndMonth(date) {
  const month = date.getUTCMonth() * 3;
  return `${date.getUTCDate()} ${MONTHS.slice(month, month + 3)}`;
}

/**
 * @param {number} flagged Rows on `/review`.
 * @returns {Html} `Review`, with a count badge when there is something to review.
 */
function reviewLabel(flagged) {
  return flagged === 0
    ? html`Review`
    : html`Review <span class="badge" aria-hidden="true">${flagged}</span
        ><span class="visually-hidden">, ${flagged} flagged</span>`;
}

/**
 * @param {Collection} collection When collection started.
 * @returns {string} The footer's collection note after the render time, or nothing when unknown.
 */
function collectionNote(collection) {
  if (collection === "unknown") {
    return "";
  }
  return collection === "not-run"
    ? " · Collection has not run yet"
    : ` · Collecting since ${formatDay(collection)}`;
}
