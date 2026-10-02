# Dashboard UI design

Status: design closed 2026-10-01. Approver: Itay. Supersedes the requirements list of the same day. Amends ADR 0008 (see its amendment section).
Audience: the coding agent that implements `src/ui/pages`, `src/ui/browser/app.css`, and `src/ui/browser/app.js`. The build order is the Dashboard stages in `docs/BUILD-PLAN.md`.

Written by the interface agent from the grilled requirements, then reviewed and decided with Itay. The mockups, screenshots, and mockup generator stayed out of the repo. Their mock data breaks real rules (a 1 Oct article under last quarter, "118 days ago" before collection started, numeric company ids where real ids are slugs), so do not copy it into fixtures.

| Path                                                     | What it is                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `docs/ui-design.md`                                      | This spec.                                                                                                   |
| `src/ui/browser/app.css`                                 | The complete stylesheet, copied from the handoff and formatted by Prettier. Change only with a reason.       |
| `tools/contrast.mjs`, `tools/shoot.mjs`, `tools/axe.mjs` | Contrast check, overflow check, and axe run. They join the repo in stage D7 and run against the live server. |

## Decisions (grill Q&A, 2026-10-01)

| Question                      | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendering                     | Server-rendered HTML from `node:http`. No framework, no SPA, no JSON API. Every page works with JS off.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Templating                    | An `html` tagged template that escapes every interpolation. Nested fragments pass as marked safe HTML.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Browser JS                    | Superseded by Browser modules below. One module, `src/ui/browser/app.js`: local times, auto-submit (§7.3), name filter, invoker-command fallback. Under the 100% gate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Read path                     | `src/core/filters.js` turns the query string into `{ range, verdicts }` or field problems. `src/core/dashboard.js` owns sort, tallies, last mentioned, collection start, and the address rule. `src/infra/coverage-read.js` filters and groups in SQL. Nothing loads every row into memory.                                                                                                                                                                                                                                                                                                                                                                                       |
| Index row                     | Name and aliases, last mentioned, tally with tone counts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `verdict` on the index        | Counts only that verdict. Companies with zero such mentions in the window are omitted. `verdict=all`, empty, and missing mean every visible verdict.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Custom range                  | `<input type="date">` read as UTC days. `to` is inclusive in the UI. The query is `[from 00:00Z, to + 1 day 00:00Z)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Collection start              | Derived from data: start of the backfill window of the earliest `backfilled_at`; else the earliest stored `published_at` day; else "Collection has not run yet".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Cross-site POST               | 403 when `Sec-Fetch-Site` is `cross-site` or `Origin` does not match the host. CSP header from §10.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Styling                       | This spec's tokens and `src/ui/browser/app.css`. Name "Press Monitor" in one `APP_NAME` constant. Neutral, no OurCrowd brand.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Company page                  | Aliases and descriptor, `<details>` excerpt, sections in digest order.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Review link                   | Nav link with count.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Dev data                      | The real coverage DB. Empty states are designed screens.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| UI folder                     | `src/ui/pages` renders HTML on the server (Node, pure functions from data to text). `src/ui/browser` holds `app.css` and `app.js`, which the server serves. `src/server` is only HTTP. Tests mirror it in `test/ui/pages` and `test/ui/browser`. Decided 2026-10-01 at the start of D2.                                                                                                                                                                                                                                                                                                                                                                                           |
| Server behavior               | `node:http`. `GET` and `HEAD` on pages and static files. Other methods on a known path: 405 with `Allow`. Unknown path: 404 page `Page not found` / `There's no page at “{path}”.`. Unexpected error: 500 page `Something went wrong` / `The error is in the server log.`, with no collection note in the footer. Static files are read once at startup. Headers: CSP, `nosniff`, `Referrer-Policy: same-origin` (`no-referrer` made browsers send `Origin: null` on our own form posts, which the guard refuses). Bad filters on the index: empty-state body `Fix the filters above, then apply them to see coverage.` when the problem is not a date. Decided 2026-10-01 in D3. |
| Subscribe with script         | Decided 2026-10-01 in D4. The form still POSTs without script. With script, `app.js` (D6) intercepts submit, sends the same form body with `fetch` and `Accept: application/json`, and gets `{ outcome: created                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | exists | invalid, message, field? }` from the same route. The outcome shows inside the dialog: an error marks the field and keeps focus and value. Success replaces the form with the message (`role=status`) and a Close button that returns focus to Get email alerts. Any other reply (403, 404, 413, 415, 500) shows a generic message in the dialog. |
| Subscribe limits              | The body must be form-encoded (else 415) and at most 4 KiB (else 413). `ALERTS_DB` defaults to `alerts.sqlite`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Browser modules               | Decided 2026-10-01 in D6. `src/ui/browser/app.js` (entry: §9.1, §9.2, §9.4) imports `name-filter.js` (§9.3) and `subscribe.js` (the dialog submit). All three are served from memory as `text/javascript`. Any non-outcome reply in the dialog shows `Couldn't subscribe right now. Try again in a moment.` (`role=alert`), keeps the value, and focuses the field. The tools hint and no-match block carry `data-name-filter` and `data-name-filter-empty` for the script.                                                                                                                                                                                                       |
| View files                    | One model per page in `src/ui/pages`: `markup.js` (the `html` tag, escaping, `safeHref`), `page.js` (format helpers, layout, shared components), `filter-form.js` (the form, its error copy, the window sentence), `index-page.js`, `company-page.js`, `review-page.js`, `message-pages.js`. `src/server/app.js` handles HTTP, `src/server/pages.js` builds each page's reply from the stores, and `src/server/subscription.js` handles the subscribe POST. §10.                                                                                                                                                                                                                  |
| "N days ago"                  | ADR 0001 stands: whole elapsed 24-hour periods from `daysSince` in `src/core/mention-status.js`, future clamped to today. Not calendar days.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Auto-submit                   | The §7.3 deviation is approved and is the behavior.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| "This quarter" sentence       | Through today: `This quarter: 1 Oct – 15 Nov 2026 (UTC)`; on the first day `This quarter: 1 Oct 2026 so far (UTC)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Bad `window` or `verdict`     | 400, "Check the filters", names the field.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| UI tooling                    | Contrast, overflow, and axe tools join the repo with `playwright-core` and `axe-core` as devDependencies. `just ui-check` runs them against a server reading the real coverage DB. Decided 2026-10-02 in D7: playwright's own Chromium; the recipe starts the server on port 3999; contrast reads tokens from `app.css`; `tools/pages.mjs` is the shared page list; viewport screenshots committed in `docs/shots/`; pure parts tested at 100%, browser drivers excluded like entry shims; with no company stored, the index shows only the not-run panel.                                                                                                                        |
| Other handoff recommendations | Accepted: short cell wording, `tsconfig.web.json`, rendered-row denominator for the name filter, §14 #3 option (a) with a README note, 90-day prefill inclusive of today.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Deep review D0–D7             | Decided 2026-10-02. The server answers 421 unless the `Host` name is `127.0.0.1` or `localhost`, so a DNS-rebinding page cannot read pages or post a subscribe whose `Origin` matches its own `Host`. A custom `to` whose next day is past year 9999 is an invalid `to`. Recorded as accepted: an address needs text before its `@`; `/review` says `No reply was stored.` when a row has no reply; the dialog's success state has a `Close` button.                                                                                                                                                                                                                              |

---

## 1. Goals and visual direction

- **Calm, editorial, data-dense but airy.** Think of a well-made internal analytics tool with Linear/Stripe-dashboard restraint, not a marketing page. _Why: reviewers scan 258 rows; quiet chrome keeps attention on the data._
- **Neutral palette, one blue accent.** Accent is used only for links, the primary button, selected filter state and the focus ring. _Why: a single accent means "interactive" with no ambiguity._
- **The only strong colors are the four verdict colors.** _Why: color then always carries meaning, and the meaning is always repeated in a word._
- **No OurCrowd logo or brand colors.** _Why: brand use is unconfirmed (open question §13); neutral is safe and easy to re-skin through tokens._
- **Working app name: "Press Monitor".** Keep it in **one constant** (e.g. `APP_NAME` in the layout module). _Why: open question; a rename should be a one-line change._
- **Server-rendered first, script second.** Every screen in the mockups works with JS off. JS only localizes times, auto-submits filters, filters by name and backfills invoker commands. _Why: locked requirement, and it keeps the browser JS small enough for 100% coverage._
- **Every empty state is a designed state.** The dev DB has no mentions until classification runs, so "nothing here" must look intentional, never broken. _Why: locked requirement; it's also the first thing a reviewer sees._

---

## 2. Tokens

All tokens live on `:root` in `app.reference.css` §1. Dark values swap in via `@media (prefers-color-scheme: dark)`. `color-scheme: light dark` on `:root` makes native controls (date inputs, dialog, scrollbars, search clear button) follow the theme. _Why: no custom date-picker styling needed._

### 2.1 Color

| Token             | Light                | Dark              | Use                                                                                                                                    |
| ----------------- | -------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `--bg`            | `#F6F7F9`            | `#0E1116`         | page background                                                                                                                        |
| `--surface`       | `#FFFFFF`            | `#161A21`         | cards, table, header, dialog                                                                                                           |
| `--surface-hover` | `#F1F4F8`            | `#1C212A`         | row hover, button hover (added; contrast verified)                                                                                     |
| `--text`          | `#151A22`            | `#E6E9EF`         | body text                                                                                                                              |
| `--muted`         | `#545E6E`            | `#A0A9B8`         | secondary text, legends, labels                                                                                                        |
| `--border`        | `#D5DAE1`            | `#303744`         | **decorative** edges only (cards, dividers)                                                                                            |
| `--border-strong` | `#7A8494`            | `#6B7587`         | control outlines: inputs, buttons, radios-as-pills, segmented track (added: `--border` is 1.4:1, which fails WCAG 1.4.11 for controls) |
| `--accent`        | `#1D4ED8`            | `#8DB4FF`         | links, primary button, focus ring, selected filter                                                                                     |
| `--accent-soft`   | `#E8EEFC`            | `#1A2741`         | selected segment / selected "All visible" pill fill (added)                                                                            |
| `--on-accent`     | `#FFFFFF`            | `#0E1116`         | text on accent                                                                                                                         |
| `--badge-bg`      | `#E3E7ED`            | `#2A303B`         | nav count pill (added)                                                                                                                 |
| `--backdrop`      | `rgb(14 17 22 / .5)` | `rgb(0 0 0 / .6)` | `dialog::backdrop`                                                                                                                     |

Verdict tokens: chip background / chip text / decorative dot.

| Verdict  | Light bg / text / dot             | Dark bg / text / dot              |
| -------- | --------------------------------- | --------------------------------- |
| positive | `#E2F3E8` / `#13502B` / `#2E8B57` | `#11301E` / `#8CDDAA` / `#3FB872` |
| negative | `#FBE6E6` / `#8B1A1A` / `#D14343` | `#3B1517` / `#FFA3A3` / `#F06464` |
| neutral  | `#E5EDF8` / `#1F3B66` / `#4A78B5` | `#172943` / `#A8C6F4` / `#6A9BE0` |
| unranked | `#F1EAFB` / `#5A2D8A` / `#8A5CC7` | `#2A1C42` / `#D2B6FF` / `#A57DE8` |

**Verdict scoping.** Any element with `data-verdict="positive|negative|neutral|unranked"` gets `--v-bg`, `--v-text` and `--v-dot`. Chips, pills, tone counts, section borders and banners all read those three variables. _Why: one attribute drives color everywhere, and templates never pick hex values._

Status colors reuse verdict pairs. Success banner: positive bg + text. "Already subscribed" banner and the pre-classification info panel: neutral pair. Error text: `--negative-text`. Invalid field border: `--negative-dot`, 2px. _Why: no extra hues._

### 2.2 Spacing, radius, shadow, type

| Token          | Value                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `--space-1..7` | 4 / 8 / 12 / 16 / 24 / 32 / 48 px (written in rem so they scale with user font size)                                                |
| `--radius`     | 6px; chips/pills use `--radius-pill` 999px; the "Headline only" tag uses 4px so it doesn't read as a verdict chip                   |
| `--shadow`     | one subtle two-layer shadow, used on cards, table, sections and dialog                                                              |
| `--font`       | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`                                                                          |
| `--font-mono`  | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` (only for the model reply `<pre>`)                                       |
| Type scale     | h1 1.75rem (1.5rem under 640px), h2 1.25rem, body 1rem/1.5, small 0.875rem, xs 0.8125rem, xxs 0.75rem (uppercase micro-labels only) |
| Numbers        | `font-variant-numeric: tabular-nums` on `time`, `.num`, `.tally`, `.tones`, `.badge`                                                |
| Content width  | `--content-max: 72rem`, centered; side padding `--gutter` 16px mobile / 24px desktop                                                |

Two deliberate size exceptions, both documented in CSS: verdict section h2 is 1.125rem, and review-card h2 (an article title) is 1.0625rem. _Why: they head dense lists, and 1.25rem made them shout. The heading levels themselves are unchanged._

### 2.3 Focus, motion, forced colors

- `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }` everywhere. For the visually hidden radios, the ring is drawn on the adjacent `span` (`input:focus-visible + span`). _Why: one consistent ring that meets 3:1 in both themes._
- `prefers-reduced-motion: reduce` turns off the only animation, a 120ms opacity fade on `dialog[open]`.
- `forced-colors: active`: chips, tags, badge, buttons, banners and segments keep a `CanvasText` border. Checked radios use `Highlight`/`HighlightText`. Focus uses `Highlight`. Dots and the brand mark are drawn with `border`, not `background`, so they survive forced colors. See `mockup/shots/*--forced-colors.png`.

### 2.4 Contrast table (printed by `node tools/contrast.mjs` from `app.css`, WCAG 2.x relative luminance, sRGB)

All 72 checked pairs pass. Chip words meet AAA (≥7:1, lowest 7.77:1). Control outlines and the focus ring meet 1.4.11 (≥3:1). The `--border` row is listed for information only; it's decorative and has no minimum.

| Theme | Foreground              | Background              | Ratio   | Min   | Result | Used for                                              |
| ----- | ----------------------- | ----------------------- | ------- | ----- | ------ | ----------------------------------------------------- |
| light | text `#151a22`          | bg `#f6f7f9`            | 16.29:1 | 4.5:1 | pass   | body text                                             |
| light | text `#151a22`          | surface `#ffffff`       | 17.46:1 | 4.5:1 | pass   | text in cards/table                                   |
| light | muted `#545e6e`         | bg `#f6f7f9`            | 6.12:1  | 4.5:1 | pass   | secondary text on page                                |
| light | muted `#545e6e`         | surface `#ffffff`       | 6.56:1  | 4.5:1 | pass   | secondary text in cards                               |
| light | accent `#1d4ed8`        | bg `#f6f7f9`            | 6.25:1  | 4.5:1 | pass   | links on page                                         |
| light | accent `#1d4ed8`        | surface `#ffffff`       | 6.70:1  | 4.5:1 | pass   | links in cards/table                                  |
| light | on-accent `#ffffff`     | accent `#1d4ed8`        | 6.70:1  | 4.5:1 | pass   | primary button / selected segment text                |
| light | accent `#1d4ed8`        | bg `#f6f7f9`            | 6.25:1  | 3:1   | pass   | focus ring vs page (1.4.11)                           |
| light | accent `#1d4ed8`        | surface `#ffffff`       | 6.70:1  | 3:1   | pass   | focus ring vs card (1.4.11)                           |
| light | accent `#1d4ed8`        | accent-soft `#e8eefc`   | 5.77:1  | 4.5:1 | pass   | selected segment / selected All pill text             |
| light | accent `#1d4ed8`        | bg `#f6f7f9`            | 6.25:1  | 3:1   | pass   | selected segment inner border vs track (1.4.11)       |
| light | text `#151a22`          | surface-hover `#f1f4f8` | 15.83:1 | 4.5:1 | pass   | row hover: text                                       |
| light | muted `#545e6e`         | surface-hover `#f1f4f8` | 5.94:1  | 4.5:1 | pass   | row hover: muted text                                 |
| light | accent `#1d4ed8`        | surface-hover `#f1f4f8` | 6.07:1  | 4.5:1 | pass   | row hover: link                                       |
| light | text `#151a22`          | badge-bg `#e3e7ed`      | 14.07:1 | 4.5:1 | pass   | Review count pill                                     |
| light | muted `#545e6e`         | bg `#f6f7f9`            | 6.12:1  | 4.5:1 | pass   | pre (model reply) uses bg inside card                 |
| light | border `#d5dae1`        | surface `#ffffff`       | 1.41:1  | 1:1   | pass   | card/divider edge (decorative, no minimum; info only) |
| light | border-strong `#7a8494` | surface `#ffffff`       | 3.78:1  | 3:1   | pass   | input/radio/button outline (1.4.11)                   |
| light | border-strong `#7a8494` | bg `#f6f7f9`            | 3.53:1  | 3:1   | pass   | control outline on page (1.4.11)                      |
| light | positive-text `#13502b` | positive-bg `#e2f3e8`   | 8.24:1  | 7:1   | pass   | positive chip word (AAA target)                       |
| light | positive-text `#13502b` | surface `#ffffff`       | 9.50:1  | 4.5:1 | pass   | positive text off-chip (error text, counts)           |
| light | positive-dot `#2e8b57`  | surface `#ffffff`       | 4.25:1  | 3:1   | pass   | positive dot / section border (decorative, aim 3:1)   |
| light | negative-text `#8b1a1a` | negative-bg `#fbe6e6`   | 7.77:1  | 7:1   | pass   | negative chip word (AAA target)                       |
| light | negative-text `#8b1a1a` | surface `#ffffff`       | 9.29:1  | 4.5:1 | pass   | negative text off-chip (error text, counts)           |
| light | negative-dot `#d14343`  | surface `#ffffff`       | 4.57:1  | 3:1   | pass   | negative dot / section border (decorative, aim 3:1)   |
| light | neutral-text `#1f3b66`  | neutral-bg `#e5edf8`    | 9.49:1  | 7:1   | pass   | neutral chip word (AAA target)                        |
| light | neutral-text `#1f3b66`  | surface `#ffffff`       | 11.20:1 | 4.5:1 | pass   | neutral text off-chip (error text, counts)            |
| light | neutral-dot `#4a78b5`   | surface `#ffffff`       | 4.52:1  | 3:1   | pass   | neutral dot / section border (decorative, aim 3:1)    |
| light | unranked-text `#5a2d8a` | unranked-bg `#f1eafb`   | 8.22:1  | 7:1   | pass   | unranked chip word (AAA target)                       |
| light | unranked-text `#5a2d8a` | surface `#ffffff`       | 9.65:1  | 4.5:1 | pass   | unranked text off-chip (error text, counts)           |
| light | unranked-dot `#8a5cc7`  | surface `#ffffff`       | 4.73:1  | 3:1   | pass   | unranked dot / section border (decorative, aim 3:1)   |
| light | negative-dot `#d14343`  | surface `#ffffff`       | 4.57:1  | 3:1   | pass   | invalid field border (1.4.11)                         |
| light | text `#151a22`          | positive-bg `#e2f3e8`   | 15.15:1 | 4.5:1 | pass   | success banner body                                   |
| light | text `#151a22`          | neutral-bg `#e5edf8`    | 14.80:1 | 4.5:1 | pass   | info panel / already-subscribed banner                |
| light | text `#151a22`          | negative-bg `#fbe6e6`   | 14.60:1 | 4.5:1 | pass   | error summary box body                                |
| light | accent `#1d4ed8`        | negative-bg `#fbe6e6`   | 5.60:1  | 4.5:1 | pass   | link inside error summary                             |
| dark  | text `#e6e9ef`          | bg `#0e1116`            | 15.55:1 | 4.5:1 | pass   | body text                                             |
| dark  | text `#e6e9ef`          | surface `#161a21`       | 14.34:1 | 4.5:1 | pass   | text in cards/table                                   |
| dark  | muted `#a0a9b8`         | bg `#0e1116`            | 7.98:1  | 4.5:1 | pass   | secondary text on page                                |
| dark  | muted `#a0a9b8`         | surface `#161a21`       | 7.36:1  | 4.5:1 | pass   | secondary text in cards                               |
| dark  | accent `#8db4ff`        | bg `#0e1116`            | 9.10:1  | 4.5:1 | pass   | links on page                                         |
| dark  | accent `#8db4ff`        | surface `#161a21`       | 8.39:1  | 4.5:1 | pass   | links in cards/table                                  |
| dark  | on-accent `#0e1116`     | accent `#8db4ff`        | 9.10:1  | 4.5:1 | pass   | primary button / selected segment text                |
| dark  | accent `#8db4ff`        | bg `#0e1116`            | 9.10:1  | 3:1   | pass   | focus ring vs page (1.4.11)                           |
| dark  | accent `#8db4ff`        | surface `#161a21`       | 8.39:1  | 3:1   | pass   | focus ring vs card (1.4.11)                           |
| dark  | accent `#8db4ff`        | accent-soft `#1a2741`   | 7.16:1  | 4.5:1 | pass   | selected segment / selected All pill text             |
| dark  | accent `#8db4ff`        | bg `#0e1116`            | 9.10:1  | 3:1   | pass   | selected segment inner border vs track (1.4.11)       |
| dark  | text `#e6e9ef`          | surface-hover `#1c212a` | 13.28:1 | 4.5:1 | pass   | row hover: text                                       |
| dark  | muted `#a0a9b8`         | surface-hover `#1c212a` | 6.82:1  | 4.5:1 | pass   | row hover: muted text                                 |
| dark  | accent `#8db4ff`        | surface-hover `#1c212a` | 7.77:1  | 4.5:1 | pass   | row hover: link                                       |
| dark  | text `#e6e9ef`          | badge-bg `#2a303b`      | 10.90:1 | 4.5:1 | pass   | Review count pill                                     |
| dark  | muted `#a0a9b8`         | bg `#0e1116`            | 7.98:1  | 4.5:1 | pass   | pre (model reply) uses bg inside card                 |
| dark  | border `#303744`        | surface `#161a21`       | 1.46:1  | 1:1   | pass   | card/divider edge (decorative, no minimum; info only) |
| dark  | border-strong `#6b7587` | surface `#161a21`       | 3.75:1  | 3:1   | pass   | input/radio/button outline (1.4.11)                   |
| dark  | border-strong `#6b7587` | bg `#0e1116`            | 4.07:1  | 3:1   | pass   | control outline on page (1.4.11)                      |
| dark  | positive-text `#8cddaa` | positive-bg `#11301e`   | 8.90:1  | 7:1   | pass   | positive chip word (AAA target)                       |
| dark  | positive-text `#8cddaa` | surface `#161a21`       | 10.83:1 | 4.5:1 | pass   | positive text off-chip (error text, counts)           |
| dark  | positive-dot `#3fb872`  | surface `#161a21`       | 6.90:1  | 3:1   | pass   | positive dot / section border (decorative, aim 3:1)   |
| dark  | negative-text `#ffa3a3` | negative-bg `#3b1517`   | 8.44:1  | 7:1   | pass   | negative chip word (AAA target)                       |
| dark  | negative-text `#ffa3a3` | surface `#161a21`       | 9.15:1  | 4.5:1 | pass   | negative text off-chip (error text, counts)           |
| dark  | negative-dot `#f06464`  | surface `#161a21`       | 5.58:1  | 3:1   | pass   | negative dot / section border (decorative, aim 3:1)   |
| dark  | neutral-text `#a8c6f4`  | neutral-bg `#172943`    | 8.40:1  | 7:1   | pass   | neutral chip word (AAA target)                        |
| dark  | neutral-text `#a8c6f4`  | surface `#161a21`       | 10.01:1 | 4.5:1 | pass   | neutral text off-chip (error text, counts)            |
| dark  | neutral-dot `#6a9be0`   | surface `#161a21`       | 6.13:1  | 3:1   | pass   | neutral dot / section border (decorative, aim 3:1)    |
| dark  | unranked-text `#d2b6ff` | unranked-bg `#2a1c42`   | 8.84:1  | 7:1   | pass   | unranked chip word (AAA target)                       |
| dark  | unranked-text `#d2b6ff` | surface `#161a21`       | 9.86:1  | 4.5:1 | pass   | unranked text off-chip (error text, counts)           |
| dark  | unranked-dot `#a57de8`  | surface `#161a21`       | 5.56:1  | 3:1   | pass   | unranked dot / section border (decorative, aim 3:1)   |
| dark  | negative-dot `#f06464`  | surface `#161a21`       | 5.58:1  | 3:1   | pass   | invalid field border (1.4.11)                         |
| dark  | text `#e6e9ef`          | positive-bg `#11301e`   | 11.78:1 | 4.5:1 | pass   | success banner body                                   |
| dark  | text `#e6e9ef`          | neutral-bg `#172943`    | 12.04:1 | 4.5:1 | pass   | info panel / already-subscribed banner                |
| dark  | text `#e6e9ef`          | negative-bg `#3b1517`   | 13.23:1 | 4.5:1 | pass   | error summary box body                                |
| dark  | accent `#8db4ff`        | negative-bg `#3b1517`   | 7.74:1  | 4.5:1 | pass   | link inside error summary                             |

---

## 3. Layout shell

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [Skip to main content]  ← only visible on keyboard focus, top-left       │
│ ■ Press Monitor                                   Companies   Review (3) │ header (surface, bottom border)
│                                                   ▔▔▔▔▔▔▔▔▔              │ aria-current bar (2px accent border)
├──────────────────────────────────────────────────────────────────────────┤
│  main.page.container  (max 72rem, centered, padding 32/24 desktop)      │
│  …                                                                       │
├──────────────────────────────────────────────────────────────────────────┤
│ Data as of 1 Oct 2026, 15:38 · Collecting since 1 Jul 2026               │ footer (muted, small)
└──────────────────────────────────────────────────────────────────────────┘
Mobile (390px): brand + nav stay on one row (nav link padding 8px). Below about 340px the nav wraps under the brand, which is fine.
```

```html
<!doctype html>
<html lang="en">
  <!-- app.js adds class="js" -->
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{Page title} · Press Monitor</title>
    <!-- see title patterns in §8 -->
    <link rel="stylesheet" href="/app.css" />
    <script type="module" src="/app.js"></script>
    <!-- module = deferred -->
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to main content</a>
    <header class="site-header">
      <div class="container">
        <a class="brand" href="/">Press Monitor</a>
        <nav class="site-nav" aria-label="Main">
          <ul>
            <li><a href="/" aria-current="page">Companies</a></li>
            <li>
              <a href="/review"
                >Review <span class="badge" aria-hidden="true">3</span
                ><span class="visually-hidden">, 3 flagged</span></a
              >
            </li>
            <!-- N = 0: <a href="/review">Review</a> (no badge, no hidden text) -->
          </ul>
        </nav>
      </div>
    </header>
    <main id="main" class="page container" tabindex="-1">…</main>
    <footer class="site-footer">
      <div class="container">
        <p>
          Data as of
          <time datetime="2026-10-01T12:38:00Z" data-local
            >1 Oct 2026, 12:38 UTC</time
          >
          · Collecting since 1 Jul 2026
        </p>
      </div>
    </footer>
  </body>
</html>
```

- Mark `aria-current="page"` on Companies for `/` and `/companies/:id`, and on Review for `/review`. Mark nothing on 404 and 403 pages. The current item gets text color plus a 2px accent bar on the header's bottom edge. _Why: the state is shown by shape, not color alone._
- The header isn't sticky. _Why: the content is long lists, and a sticky bar costs vertical space on mobile and complicates zoom._
- `main` has `tabindex="-1"` so the skip link moves focus in every browser. Its focus outline is suppressed (`.page:focus { outline: none }`) because main is never a tab stop.
- Footer "as of" is the render time. It's localized by JS like article times. "Collecting since" is a UTC date and isn't localized. With nothing stored, the footer reads `Data as of … · Collection has not run yet`.

---

## 4. Components

Each component lists its classes. The CSS is in `app.reference.css` §5–§9.

| Component                 | Markup                                                                                                                                                              | Notes                                                                                                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Button**                | `<button class="btn">` / `<a class="btn">`; primary: `.btn btn--primary`                                                                                            | min-height 40px, 1px `--border-strong` outline. Primary is accent fill with `--on-accent` text; hover mixes 15% `--text` into the accent (still passes). Only Apply and Subscribe are primary.                                                                              |
| **Link button**           | `<button type="button" class="link-button">`                                                                                                                        | Looks like a link and acts like a button ("Clear filter").                                                                                                                                                                                                                  |
| **Verdict chip**          | `<span class="chip" data-verdict="negative"><span class="dot" aria-hidden="true"></span>Negative</span>`                                                            | Always dot + word. 1px border in `color-mix(in srgb, var(--v-text) 35%, transparent)`, so the edge reads on the surface.                                                                                                                                                    |
| **Dot**                   | `<span class="dot" aria-hidden="true"></span>` inside any `[data-verdict]`                                                                                          | 8px circle drawn as a 4px border. On zero counts (`.tone.is-zero`) it becomes a hollow ring.                                                                                                                                                                                |
| **Tone counts**           | `<span class="tones"><span class="tone" data-verdict="positive"><span class="dot" aria-hidden="true"></span>6 positive</span>…</span>`                              | Order: positive, negative, neutral. Zero counts get `.is-zero` (muted text, hollow dot). The colored dot is the visual separator; no "·" glyph, which looked broken when it wrapped to a line start on narrow cards. Screen readers hear "6 positive 3 negative 2 neutral". |
| **Tag** ("Headline only") | `<span class="tag" title="Classified from the headline; no article text was extracted">Headline only</span>`                                                        | Outlined, muted, 4px radius, so it can't be mistaken for a verdict. The `title` is a bonus for mouse users; the visible words carry the meaning.                                                                                                                            |
| **Badge**                 | `<span class="badge" aria-hidden="true">3</span>` plus visually hidden ", 3 flagged"                                                                                | Nav only.                                                                                                                                                                                                                                                                   |
| **Card**                  | `.card`                                                                                                                                                             | surface + border + radius + shadow.                                                                                                                                                                                                                                         |
| **Empty state**           | `<div class="empty-state"><p class="empty-state__title">…</p><p class="empty-state__body">…</p><p class="empty-state__actions"><a href="…">…</a></p></div>`         | One visual for every empty or zero state: no icon, centered, title + optional muted line + optional actions.                                                                                                                                                                |
| **Banner**                | `<div class="banner" data-verdict="positive" role="status"><span class="banner__icon" aria-hidden="true">✓</span><p>…</p></div>`                                    | Success: positive + ✓. Already subscribed: neutral + `i`. Info panel (pre-classification, collection not run): neutral + `i`, with `role="note"` instead of `status`.                                                                                                       |
| **Error summary**         | see §6.6                                                                                                                                                            | Negative bg, 4px left border in `--negative-dot`, h2 + list of links to the fields.                                                                                                                                                                                         |
| **Field + error**         | `<div class="field"><label for=x>…</label><input class="input" id=x aria-invalid="true" aria-describedby="x-error"><p class="field-error" id="x-error">…</p></div>` | The error text starts with the field name. A "!" disc is drawn by CSS (`content: "!" / ""`, so it isn't announced). Invalid input gets a 2px `--negative-dot` border.                                                                                                       |
| **Segmented control**     | §5                                                                                                                                                                  | Three native radios, visually hidden. Each `span` is a segment. Checked: accent-soft fill + 1px inner accent ring + bold.                                                                                                                                                   |
| **Pill radios**           | §5                                                                                                                                                                  | Five native radios. Checked: tinted fill + 2px edge (border + inset ring) + bold. Verdict pills tint with their verdict pair; "All visible" tints with accent-soft.                                                                                                         |
| **Dialog**                | §6.4                                                                                                                                                                | Native `<dialog>`, max width 28rem. No author rule hides `dialog:not([open])`.                                                                                                                                                                                              |
| **Table → cards**         | §6.1                                                                                                                                                                | Real `<table>` with explicit ARIA roles. Cards are the base layout; table layout applies at ≥40em.                                                                                                                                                                          |

---

## 5. Filter form (shared partial)

Used on `/` (action `/`) and `/companies/:id` (action `/companies/:id`). Method GET. Field names: `window`, `from`, `to`, `verdict`.

```html
<form
  class="filters card"
  method="get"
  action="/"
  aria-label="Filters"
  data-filters
>
  <fieldset>
    <legend>Time window</legend>
    <div class="segmented">
      <label
        ><input type="radio" name="window" value="last" checked /><span
          >Last quarter</span
        ></label
      >
      <label
        ><input type="radio" name="window" value="this" /><span
          >This quarter</span
        ></label
      >
      <label
        ><input type="radio" name="window" value="custom" /><span
          >Custom</span
        ></label
      >
    </div>
    <div class="custom-range">
      <div class="field">
        <label for="from">From (UTC)</label>
        <input
          class="input"
          type="date"
          id="from"
          name="from"
          value="2026-07-04"
        />
      </div>
      <div class="field">
        <label for="to">To (UTC)</label>
        <input class="input" type="date" id="to" name="to" value="2026-10-01" />
      </div>
    </div>
  </fieldset>
  <fieldset>
    <legend>Verdict</legend>
    <div class="pills">
      <label class="pill"
        ><input type="radio" name="verdict" value="all" checked /><span
          >All visible</span
        ></label
      >
      <label class="pill" data-verdict="positive"
        ><input type="radio" name="verdict" value="positive" /><span
          ><span class="dot" aria-hidden="true"></span>Positive</span
        ></label
      >
      <label class="pill" data-verdict="negative">…Negative…</label>
      <label class="pill" data-verdict="neutral">…Neutral…</label>
      <label class="pill" data-verdict="unranked">…Unranked…</label>
    </div>
  </fieldset>
  <div class="filters__actions">
    <button class="btn btn--primary" type="submit">Apply</button>
  </div>
</form>
<p class="filters__hint">Results update as you change filters.</p>
<!-- CSS shows it only under html.js -->
<p class="window-sentence">Last quarter: 1 Jul – 30 Sep 2026 (UTC)</p>
```

Rules:

- **Prefill.** Radios reflect the request. `from`/`to` reflect the request when `window=custom`. Otherwise they hold the last 90 days inclusive: `to` = today (UTC), `from` = today − 89 days. On 1 Oct 2026 that's 4 Jul – 1 Oct.
- **`from`/`to` are validated only when `window=custom`.** Otherwise the server ignores them (they're always submitted because they're in the form).
- **Verdict "All visible" uses `value="all"`.** The server treats a missing value, `all` and the empty string identically. _Why: an explicit value is easier to read and test than an empty-string special case (ambiguity noted in §14)._
- **Custom reveal is pure CSS:** `.filters:has(input[name="window"][value="custom"]:checked) .custom-range { display: flex }`. For browsers without `:has()`, `@supports not selector(:has(*))` always shows the range. That's harmless because the values only count when Custom is checked.
- **Layout.** Mobile: fieldsets stack, the segmented control is full width (equal segments, labels may wrap to two lines at 320px), pills wrap, Apply is full width. Desktop: one row that wraps; the range sits under the segmented control inside the window fieldset; Apply aligns bottom-right.
- **The window sentence** sits directly under the form on both pages and is the results' key subheading. Format: `{Label}: {range} (UTC)`. See the copy deck.

---

## 6. Pages

### 6.1 Index `GET /`

**Desktop (1280)** (see `mockup/index.html`, `shots/index--desktop-light.png`)

```
Portfolio coverage                                                   ← h1
Press mentions for each portfolio company, classified by tone.       ← muted lede
┌ Filters card ──────────────────────────────────────────────────────────────┐
│ TIME WINDOW                         VERDICT                                │
│ [Last quarter│This quarter│Custom]  (All visible)(•Positive)(•Negative)    │
│                                     (•Neutral)(•Unranked)       [Apply]*   │
└────────────────────────────────────────────────────────────────────────────┘
Results update as you change filters.                                (JS only)
Last quarter: 1 Jul – 30 Sep 2026 (UTC)                              ← window sentence
[info panel: only when the whole DB has zero visible mentions]
Filter by name                                                       (JS only)
[Name or alias            ]                    Showing 258 of 258 companies
All visible mentions, Last quarter (1 Jul – 30 Sep 2026, UTC)        ← <caption>
┌────────────────────────────────────────────────────────────────────────────┐
│ COMPANY                        LAST MENTIONED   COVERAGE                   │
│ Northwind Robotics             Today            18 mentions, 11 rated      │
│ Also Northwind Robotics Ltd.                    • 6 positive • 3 negative …│
│ Saltmarsh Energy               118 days ago     No mentions in this window │
│ Aster Labs                     No coverage      No mentions in this window │
└────────────────────────────────────────────────────────────────────────────┘
“No coverage” means nothing found since 1 Jul 2026, when collection started.
* Apply: always visible without JS; with JS, only while Custom is selected (§7.3)
```

**Mobile (390)** (`shots/index--mobile-light.png`)

```
■ Press Monitor   Companies  Review 3
Portfolio coverage
Press mentions for each …
┌ TIME WINDOW ───────────────────┐
│ [Last quarter|This quarter|Cus]│  full-width segmented
│ VERDICT                        │
│ (All visible)(•Positive)(•Neg) │  pills wrap
│ (•Neutral)(•Unranked)          │
│ [          Apply           ]   │  (no-JS / Custom)
└────────────────────────────────┘
Last quarter: 1 Jul – 30 Sep 2026 (UTC)
Filter by name [______________]
Showing 258 of 258 companies
All visible mentions, Last quarter …
┌────────────────────────────────┐
│ Northwind Robotics             │  ← th scope=row
│ Also Northwind Robotics Ltd.   │
│ LAST MENTIONED  Today          │  ← label beside value at ≥24em,
│ COVERAGE        18 mentions, … │     above value below 24em (320px)
│                 • 6 pos • 3 neg│
└────────────────────────────────┘
```

**Structure**

```html
<div class="page-header">
  <h1>Portfolio coverage</h1>
  <p class="page-header__lede">
    Press mentions for each portfolio company, classified by tone.
  </p>
</div>
{filter form partial}
<p class="window-sentence">…</p>
<!-- only if zero visible mentions in the whole DB: -->
<div class="banner" data-verdict="neutral" role="note">
  <span class="banner__icon" aria-hidden="true">i</span>
  <div>
    <p class="banner__title">No mentions yet.</p>
    <p class="banner__body">
      Articles are being collected, and companies fill in here as they're
      classified.
    </p>
  </div>
</div>
<div class="table-tools" data-name-filter hidden>
  <!-- app.js removes hidden -->
  <div class="field">
    <label for="name-filter">Filter by name</label>
    <input
      class="input"
      type="search"
      id="name-filter"
      placeholder="Name or alias"
      autocomplete="off"
      aria-controls="companies"
    />
  </div>
  <p
    class="table-tools__count"
    id="name-filter-count"
    role="status"
    aria-live="polite"
  >
    Showing 258 of 258 companies
  </p>
</div>
<table class="companies" id="companies" role="table">
  <caption>
    All visible mentions, Last quarter (1 Jul – 30 Sep 2026, UTC)
  </caption>
  <thead role="rowgroup">
    <tr role="row">
      <th role="columnheader" scope="col" class="col-company">Company</th>
      <th role="columnheader" scope="col" class="col-last">Last mentioned</th>
      <th role="columnheader" scope="col">Coverage</th>
    </tr>
  </thead>
  <tbody role="rowgroup">
    <tr role="row" data-search="northwind robotics northwind robotics ltd.">
      <th role="rowheader" scope="row">
        <a class="company-name" href="/companies/42?window=last&amp;verdict=all"
          >Northwind Robotics</a
        >
        <span class="company-aliases">Also Northwind Robotics Ltd.</span>
        <!-- only when aliases exist -->
      </th>
      <td role="cell">
        <span class="cell-label" aria-hidden="true">Last mentioned</span>
        <time datetime="2026-10-01">Today</time>
      </td>
      <!-- or <span class="muted">No coverage</span> -->
      <td role="cell">
        <span class="cell-label" aria-hidden="true">Coverage</span>
        <div class="coverage">
          <span class="tally">18 mentions, 11 rated</span>{tones}
        </div>
      </td>
      <!-- 0 in window: <span class="muted">No mentions in this window</span> -->
    </tr>
  </tbody>
</table>
<p class="table-footnote">
  “No coverage” means nothing found since 1 Jul 2026, when collection started.
</p>
<!-- only if ≥1 row says No coverage, and not in the pre-classification state -->
<div id="name-filter-empty" hidden>
  <div class="empty-state">
    <p class="empty-state__title">
      No companies match “<span data-query></span>”.
    </p>
    <p class="empty-state__actions">
      <button type="button" class="link-button" data-clear-filter>
        Clear filter
      </button>
    </p>
  </div>
</div>
```

- **Why explicit roles.** `display:block/grid` on table parts strips table semantics in Safari and in Chrome in some versions. Roles restore them. Keep them at desktop too, so the markup is identical at every width.
- **`data-search`** = display name + aliases, lowercased, joined with spaces. It's server-escaped like any attribute.
- **Company links carry the current `window`/`from`/`to`/`verdict` query,** so drilling in keeps the context. The back link on the company page does the same.
- **Rows.** No whole-row click; only the name is a link. Hover tints the row (desktop).
- **Sort** (server): last mentioned newest first, then companies with none, then display name A–Z (`localeCompare` with `sensitivity: 'base'`).
- **States**

| State                                                                       | What renders                                                                                                                                                                        |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Populated                                                                   | as above                                                                                                                                                                            |
| Verdict filter active                                                       | Tally and tones count only that verdict. Companies with 0 such mentions in the window are omitted. Caption: `Negative mentions, Last quarter (…, UTC)`.                             |
| Verdict filter leaves no rows                                               | No table, name filter or footnote. Empty state: **"No negative mentions in Last quarter (1 Jul – 30 Sep 2026, UTC)."** Action **"Show all verdicts"** (same window, `verdict=all`). |
| Zero visible mentions in the whole DB (pre-classification, articles stored) | Info panel "No mentions yet." above the table. Every row: "No coverage" + "No mentions in this window". No footnote. (`mockup/index-empty.html`)                                    |
| Nothing stored at all                                                       | Info panel title **"Collection has not run yet."** body **"Companies fill in here after the first collection and classification run."** Rows as above.                              |
| Name filter matches nothing (JS)                                            | Table hidden; `#name-filter-empty` shown with the query; count says `Showing 0 of 258 companies`.                                                                                   |
| Bad range (400)                                                             | §6.6                                                                                                                                                                                |

### 6.2 Company `GET /companies/:id`

**Desktop** (`mockup/company.html`, `shots/company--desktop-dark.png`)

```
← All companies
Northwind Robotics                                         [Get email alerts]
Also known as Northwind Robotics Ltd., Northwind AI
Warehouse robotics · Fund portfolio company                (overlay descriptor)
┌ summary card ───────────────────────────────────────────────────────────────┐
│ Last mentioned today                                                         │
│ 8 mentions, 7 rated  • 3 positive • 2 negative • 2 neutral                   │
│ Counts cover the selected window. “Last mentioned” covers all collected data.│
└──────────────────────────────────────────────────────────────────────────────┘
{filters card}
Last quarter: 1 Jul – 30 Sep 2026 (UTC)
┃ • Negative · 2                                                ┃ ← 3px left border, verdict dot color
┃ Northwind Robotics recalls 1,200 warehouse arms … ↗           ┃ ← h3 > a
┃ The Example Ledger · 29 Sep 2026, 14:05 UTC  (•Negative)      ┃
┃ ▾ Excerpt                                                     ┃
┃   │ Northwind Robotics said on Tuesday it would recall …      ┃ ← max 65ch
┃ ─────────────────────────────────────────────────────────     ┃
┃ Supplier dispute delays … ↗                                   ┃
┃ Fixture Business Daily · 14 Aug 2026  (•Negative) [Headline only]
┃ • Positive · 3 …  • Neutral · 2 …  • Unranked · 1 …           ┃
```

**Mobile**: same order; "Get email alerts" becomes a full-width button **under** the summary card (CSS grid areas: mobile `head / summary / action`, desktop `head action / summary summary`). DOM order is head → summary → action, so tab order matches what you see on mobile. On desktop it's equivalent, because head and summary contain no focusable elements.

**Structure**

```html
<!-- optional status banner (§6.3) goes first in main -->
<a class="back-link" href="/?window=last&amp;verdict=all"
  ><span aria-hidden="true">←&nbsp;</span>All companies</a
>
<div class="company-intro">
  <div class="company-head">
    <h1>Northwind Robotics</h1>
    <p class="company-head__aliases">
      Also known as Northwind Robotics Ltd., Northwind AI
    </p>
    <!-- if aliases -->
    <p class="company-head__descriptor">
      Warehouse robotics · Fund portfolio company
    </p>
    <!-- if overlay descriptor -->
  </div>
  <div class="summary card">
    <p class="summary__status">Last mentioned today</p>
    <p class="summary__tally">
      <span class="tally">8 mentions, 7 rated</span>{tones}
    </p>
    <p class="summary__note">
      Counts cover the selected window. “Last mentioned” covers all collected
      data.
    </p>
  </div>
  <div class="subscribe-action">
    <button
      type="button"
      class="btn"
      commandfor="subscribe"
      command="show-modal"
    >
      Get email alerts
    </button>
  </div>
</div>
<dialog id="subscribe" class="dialog" aria-labelledby="subscribe-title">
  …§6.4…
</dialog>
{filter form partial, action="/companies/42"}
<p class="window-sentence">Last quarter: 1 Jul – 30 Sep 2026 (UTC)</p>
<section
  class="verdict-section"
  data-verdict="negative"
  aria-labelledby="section-negative"
>
  <h2 id="section-negative">
    <span class="dot" aria-hidden="true"></span>Negative
    <span class="count">· 2</span>
  </h2>
  <ol class="mentions">
    <li>
      <article class="mention" aria-labelledby="m-123-title">
        <h3 id="m-123-title">
          <a
            class="external"
            href="https://publisher.example/…"
            rel="noopener noreferrer"
            >Title</a
          >
        </h3>
        <p class="mention__meta">
          <span class="mention__source"
            >The Example Ledger ·
            <time datetime="2026-09-29T14:05:00Z" data-local
              >29 Sep 2026, 14:05 UTC</time
            ></span
          >
          <span class="chip" data-verdict="negative"
            ><span class="dot" aria-hidden="true"></span>Negative</span
          >
          <span
            class="tag"
            title="Classified from the headline; no article text was extracted"
            >Headline only</span
          >
          <!-- text_source = title -->
        </p>
        <details>
          <summary>Excerpt</summary>
          <p class="excerpt">First ~300 characters…</p>
        </details>
        <!-- only when extracted text exists -->
      </article>
    </li>
  </ol>
</section>
<!-- then positive, neutral, unranked; omit empty sections -->
```

- **Mention link:** publisher URL, else the Google URL when unwrap failed. An `href` is emitted only for `http:`/`https:`; otherwise the title is plain text (no `<a>`, no ↗). Same tab. `rel="noopener noreferrer"`. The ↗ is CSS `content: "\2197" / ""`, so screen readers skip it.
- **Excerpt:** cut at the last word boundary at or before 300 characters, collapse whitespace, append "…" only when truncated.
- **Long titles:** `overflow-wrap: anywhere` on h1, h3 and review titles (see the neutral section's unbroken slug in the mockup).
- **Heading order:** h1 (company) → h2 (dialog title, sections) → h3 (mentions).
- **Section count** is the number of mentions in that section, in the window.
- **States**

| State                 | What renders                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Populated             | as above                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Verdict filter        | Only that section. Tally counts only that verdict.                                                                                                                                                                                                                                                                                                                                                                                                           |
| No mentions in window | Summary still shows Last mentioned. Instead of sections: empty state **"No mentions of Northwind Robotics in Last quarter (1 Jul – 30 Sep 2026, UTC)."** Actions: **"Show last quarter"** (only if the window isn't already `last`), **"Show all coverage since 1 Jul 2026"** (`window=custom&from={collection start}&to={today}`), and **"Show all verdicts"** (only if a verdict filter is active; the title then reads "No negative mentions of … in …"). |
| Never mentioned       | Summary status: **"No coverage found since 1 Jul 2026"** (or **"Collection has not run yet"**) and the tally line `0 mentions, 0 rated` with all tones zero. Sections are replaced by the empty state above.                                                                                                                                                                                                                                                 |
| Unknown id            | 404 page (§6.7)                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Bad range             | §6.6                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### 6.3 Subscribe `POST /companies/:id/subscriptions`

Responds with the company page (same filters as defaults; the POST carries no filter query).

| Outcome                      | Status | Render                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Created                      | 200    | Banner first in main: `<div class="banner" data-verdict="positive" role="status"><span class="banner__icon" aria-hidden="true">✓</span><p>Subscribed name@example.com to Northwind Robotics.</p></div>`. Title `Subscribed: Northwind Robotics · Press Monitor`. (`mockup/company-subscribed.html`)                                                                                                                                                                                  |
| Duplicate (case-insensitive) | 200    | Same banner with `data-verdict="neutral"`, icon `i`: "name@example.com is already subscribed."                                                                                                                                                                                                                                                                                                                                                                                       |
| Invalid address              | 400    | No `<dialog>` and no "Get email alerts" button. In the `action` grid area, `<section class="subscribe-inline card" aria-labelledby="subscribe-title">` holds the **same** heading, intro and form. Input: `value` kept, `aria-invalid="true"`, `aria-describedby="subscribe-email-error"`, `autofocus`. Error: "Email address: enter an address like name@example.com." No Cancel button. Title `Error: Northwind Robotics · Press Monitor`. (`mockup/company-subscribe-error.html`) |
| Cross-site                   | 403    | Generic 403 page (§6.7).                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

- **Address rule** (server): trim; exactly one `@`; no whitespace; the domain part contains a `.` that isn't first or last; length ≤ 254 after trim. Store as typed (trimmed). Compare in lowercase.
- **Why titles change:** content in `role="status"` that exists at page load is not reliably announced (live regions announce _changes_). The `<title>` _is_ announced on load, so the title prefix carries the outcome for screen-reader users with no JS. The banner is first in main, so it's the first thing read after the skip link.
- **Known limitation (no change requested):** 200-on-POST means a reload re-submits (the browser warns). The duplicate path makes that harmless.

### 6.4 Subscribe dialog

```html
<dialog id="subscribe" class="dialog" aria-labelledby="subscribe-title">
  <h2 id="subscribe-title">Email alerts for Northwind Robotics</h2>
  <p class="dialog__intro">
    Get an email when the daily check finds new coverage of Northwind Robotics.
  </p>
  <form method="post" action="/companies/42/subscriptions" novalidate>
    <div class="field">
      <label for="subscribe-email">Email address</label>
      <input
        class="input"
        type="email"
        id="subscribe-email"
        name="email"
        autocomplete="email"
        required
        maxlength="254"
      />
    </div>
    <div class="form-actions">
      <button type="button" class="btn" commandfor="subscribe" command="close">
        Cancel
      </button>
      <button type="submit" class="btn btn--primary">Subscribe</button>
    </div>
  </form>
</dialog>
```

- Opened by `<button type="button" commandfor="subscribe" command="show-modal">`. Focus moves into the dialog (first focusable: the email input). Escape closes. Focus returns to the invoker. All of that is native.
- `novalidate`: the server is the single source of validation messages, so JS-on and JS-off errors read the same.
- **Do not** add CSS that hides `dialog:not([open])`. Where `<dialog>` is unsupported, the element renders inline (styled as a card by `.dialog`) and its form still submits. That's the required fallback.
- `::backdrop` uses `--backdrop`. 120ms opacity fade-in, disabled under reduced motion.
- app.js fallback for browsers with `<dialog>` but without invoker commands: §9.4.

### 6.5 Review `GET /review`

```
Review                                                   ← h1
Articles the classifier couldn't decide on. Read-only.
3 articles flagged
┌ card ───────────────────────────────────────────────────────────┐
│ Parcel Mesh                                     ← company link  │
│ Mesh networks for parcel lockers: a primer ↗    ← h2 (link/text)│
│ Text source: Full text                                          │
│ MODEL REPLY                                     ← figcaption    │
│ ┌ pre (mono, wraps, max-height 16rem, scrolls inside) ────────┐ │
│ │ { "relevant": "uncertain", … }                              │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

```html
<div class="page-header">
  <h1>Review</h1>
  <p class="page-header__lede">
    Articles the classifier couldn't decide on. Read-only.
  </p>
</div>
<p class="table-note">3 articles flagged</p>
<ol class="review-list">
  <li>
    <article class="review-card card" aria-labelledby="r17-title">
      <a class="review-card__company" href="/companies/42">Parcel Mesh</a>
      <h2 id="r17-title">
        <a class="external" href="https://…" rel="noopener noreferrer">Title</a>
      </h2>
      <!-- non-http(s): plain text -->
      <p class="review-card__meta">Text source: Full text</p>
      <!-- or Headline only -->
      <figure class="reply">
        <figcaption id="r17-reply">Model reply</figcaption>
        <pre tabindex="0" role="group" aria-labelledby="r17-reply r17-title">
{escaped raw reply}</pre>
      </figure>
    </article>
  </li>
</ol>
```

- **Cards, not a table:** the `<pre>` is wide and multi-line.
- The `<pre>` scrolls inside its box (`white-space: pre-wrap; overflow-wrap: anywhere; max-height: 16rem; overflow: auto`) and never widens the page. `tabindex="0"` makes it keyboard-scrollable. `role="group"` is there because `aria-label`/`aria-labelledby` is prohibited on a role-less `<pre>`; group allows a name without adding a landmark per card. Its name reads "Model reply, {title}".
- Order: newest first (by article published_at), then company name.
- Empty: empty state **"Nothing is flagged."** / **"Uncertain classifications show up here for a human look."** (`mockup/review-empty.html`)

### 6.6 Bad range (400) on `/` or `/companies/:id`

(`mockup/index-range-error.html`)

```
Portfolio coverage
┌ Check the dates ────────────────────────────────────┐  ← .error-summary, after the page header
│ • From date must be on or before To date.  (link → #from)
└─────────────────────────────────────────────────────┘
{filters: Custom checked, typed values kept}
  From (UTC) [2026-09-30]  ← aria-invalid, aria-describedby, autofocus
  ! From date must be on or before To date.
  To (UTC)   [2026-07-01]
┌ empty state ─────────────────────────────────────────┐
│ No results to show.                                   │
│ Fix the date range above, then apply it to see coverage.│
└──────────────────────────────────────────────────────┘
```

```html
<div class="error-summary" aria-labelledby="error-summary-title">
  <h2 id="error-summary-title">Check the dates</h2>
  <ul>
    <li><a href="#from">From date must be on or before To date.</a></li>
  </ul>
</div>
```

- Status 400. Title `Error: {page title} · Press Monitor`. No window sentence, table or sections. The empty state keeps the page from looking broken.
- The error is attached to the named field. Unparseable from: `from`. Unparseable to: `to`. from after to: `from`. Both unparseable: two errors, autofocus the first.
- `autofocus` on the first invalid input. On the company page, the summary card still renders (it doesn't depend on the window).
- Recommended (not in the locked spec): also 400 an unknown `window` or `verdict` value with the same pattern, heading "Check the filters" (copy in §8). Otherwise a hand-edited URL silently shows defaults.

### 6.7 404 and 403

```html
<div class="message-page">
  <h1>Company not found</h1>
  <p>There's no company with id “{id}”.</p>
  <a class="btn" href="/">Back to all companies</a>
</div>
```

403 (cross-site guard): h1 **"Request blocked"**, p **"This form can only be submitted from Press Monitor itself."**, same back button. Both use the full shell (header/footer), with no `aria-current`. Title = the h1.

---

## 7. Filter behavior

### 7.1 Without JS (the baseline, always works)

- The form submits by the Apply button (GET). URL: `/?window=last&from=…&to=…&verdict=all`.
- The Custom range shows via `:has()` the moment Custom is checked (no reload needed), then Apply submits.
- The name filter block (`[data-name-filter]`) keeps its `hidden` attribute. Times read in UTC with a "UTC" suffix.

### 7.2 With JS: the original locked spec (superseded by §7.3)

- app.js adds `html.js`. **Any** `change` in `[data-filters]` calls `form.requestSubmit()`, including the date inputs. No debounce.
- Apply is hidden: replace the deviation rule in app.css §6 with `.js .filters__actions { display: none; }`.

### 7.3 With JS: approved behavior (deviation approved 2026-10-01)

> **Problem.** Auto-submitting on every change is a WCAG 3.2.2 (On Input) risk: changing a control triggers an unannounced change of context. It also breaks date typing: Chrome fires `change` on `<input type="date">` as soon as the field holds a valid date, so typing a year digit by digit ("2", "20", "202", "2026") submits several times mid-typing.
>
> **Proposal.**
>
> 1. With JS, **radios** auto-submit (`requestSubmit()`). Exception: checking **Custom** doesn't submit; it only reveals the dates and Apply.
> 2. **Date inputs never auto-submit.** Apply stays visible **while Custom is selected** and is hidden otherwise. Pure CSS:
>    `.js .filters:not(:has(input[name="window"][value="custom"]:checked)) .filters__actions { display: none; }`
> 3. A one-line hint under the form, JS only: **"Results update as you change filters."** (3.2.2 allows changes of context the user is told about in advance.)
> 4. **Focus restore** after the reload: before submitting, store `{name, value}` of the changed radio in `sessionStorage` (`pm:focus`). On load, focus `[data-filters] input[name=…][value=…]` and delete the key. Without this, keyboard users land at the top of the page after every choice.
>
> **Residual cost.** Arrow keys move the checked radio inside a group, so each arrow press reloads the page. With focus restore, a keyboard user can keep arrowing, but it's one reload per step. That's acceptable for 3 and 5 options. If it's judged too heavy, the next step down is "radios don't auto-submit either; Apply always visible", which is 100% spec-safe for 3.2.2 but drops the auto-submit requirement.
>
> **Revert to strict spec:** swap the CSS rule as in §7.2, and in `initAutoSubmit` submit on any `change` (delete the Custom and date-input guards). Focus restore and the hint can stay; they help either way.

### 7.4 Name filter (JS only)

Covered in §6.1 and §9.3. It's not in the URL and never submits. It filters whatever rows the server rendered (with a verdict filter, that's fewer than 258; the count's denominator is the rendered row count).

---

## 8. Copy deck

Conventions: sentence case; en dash with spaces for ranges (`1 Jul – 30 Sep 2026`); date format `D Mon YYYY` (year on the start date only when the years differ); curly quotes around user text; no exclamation marks. `{n}` placeholders need plural forms where shown.

**Formatting helpers (put in one pure module and unit-test them)**

| Helper                 | Output                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `formatDay(d)`         | `1 Jul 2026`                                                                                   |
| `formatRange(a,b)`     | `1 Jul – 30 Sep 2026`; across years `15 Dec 2025 – 10 Jan 2026`; same day `1 Oct 2026`         |
| `formatUtcStamp(iso)`  | `28 Sep 2026, 08:15 UTC`                                                                       |
| `plural(n, one, many)` | `1 mention` / `18 mentions`; `1 day ago` / `3 days ago`; `1 article` / `3 articles`            |
| `daysSince` (reused)   | from `src/core/mention-status.js`: whole elapsed 24-hour periods, floored; below 0 reads today |

| Where                       | String                                                                                                                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App name                    | `Press Monitor` (one constant)                                                                                                                                                                                  |
| `<title>`                   | `{Page} · Press Monitor`. Pages: `Portfolio coverage`, `{Company}`, `Review`, `Company not found`, `Request blocked`                                                                                            |
| `<title>` after POST        | `Subscribed: {Company} · Press Monitor` / `Error: {Company} · Press Monitor`                                                                                                                                    |
| `<title>` on 400 range      | `Error: Portfolio coverage · Press Monitor` / `Error: {Company} · Press Monitor`                                                                                                                                |
| Skip link                   | `Skip to main content`                                                                                                                                                                                          |
| Nav                         | `Companies`, `Review` + badge `{N}` + hidden `, {N} flagged`; N = 0 → `Review` only                                                                                                                             |
| Footer                      | `Data as of {local stamp} · Collecting since {D Mon YYYY}`; nothing stored: `Data as of {stamp} · Collection has not run yet`                                                                                   |
| Index h1 / lede             | `Portfolio coverage` / `Press mentions for each portfolio company, classified by tone.`                                                                                                                         |
| Filter legends              | `Time window`, `Verdict` (rendered uppercase by CSS; the DOM text stays sentence case)                                                                                                                          |
| Window options              | `Last quarter`, `This quarter`, `Custom`                                                                                                                                                                        |
| Date labels                 | `From (UTC)`, `To (UTC)`                                                                                                                                                                                        |
| Verdict options             | `All visible`, `Positive`, `Negative`, `Neutral`, `Unranked`                                                                                                                                                    |
| Apply                       | `Apply`                                                                                                                                                                                                         |
| JS hint                     | `Results update as you change filters.`                                                                                                                                                                         |
| Window sentence             | `Last quarter: 1 Jul – 30 Sep 2026 (UTC)` · `This quarter: 1 Oct – 15 Nov 2026 (UTC)` (through today; first day `This quarter: 1 Oct 2026 so far (UTC)`) · `Custom range: 4 Jul – 1 Oct 2026 (UTC)`             |
| Caption                     | `{All visible \| Positive \| Negative \| Neutral \| Unranked} mentions, {Last quarter \| This quarter \| Custom range} ({range}, UTC)`                                                                          |
| Column headers              | `Company`, `Last mentioned`, `Coverage`                                                                                                                                                                         |
| Card labels (mobile)        | `Last mentioned`, `Coverage`                                                                                                                                                                                    |
| Aliases (index)             | `Also {a}, {b}`                                                                                                                                                                                                 |
| Last mentioned (cell)       | `Today` · `1 day ago` · `{n} days ago` · `No coverage` (muted)                                                                                                                                                  |
| Tally                       | `{n} mention(s), {r} rated` (e.g. `1 mention, 0 rated`)                                                                                                                                                         |
| Tones                       | `{p} positive` `{n} negative` `{u} neutral` (zeros muted)                                                                                                                                                       |
| Zero in window (cell)       | `No mentions in this window`                                                                                                                                                                                    |
| Index footnote              | `“No coverage” means nothing found since {D Mon YYYY}, when collection started.`                                                                                                                                |
| Pre-classification panel    | Title `No mentions yet.` Body `Articles are being collected, and companies fill in here as they're classified.`                                                                                                 |
| Not-run panel               | Title `Collection has not run yet.` Body `Companies fill in here after the first collection and classification run.`                                                                                            |
| Verdict empty (index)       | `No {verdict} mentions in {Window label} ({range}, UTC).` Action `Show all verdicts`                                                                                                                            |
| Name filter                 | Label `Filter by name`, placeholder `Name or alias`, status `Showing {shown} of {total} companies` (`Showing 1 of 258 companies`), empty `No companies match “{q}”.` Action `Clear filter`                      |
| Company back link           | `← All companies` (arrow `aria-hidden`)                                                                                                                                                                         |
| Company aliases             | `Also known as {a}, {b}`                                                                                                                                                                                        |
| Last mentioned (company)    | `Last mentioned today` · `Last mentioned 1 day ago` · `Last mentioned {n} days ago` · `No coverage found since {D Mon YYYY}` · `Collection has not run yet`                                                     |
| Summary note                | `Counts cover the selected window. “Last mentioned” covers all collected data.`                                                                                                                                 |
| Section heading             | `{Verdict} · {n}`                                                                                                                                                                                               |
| Mention meta                | `{Publisher} · {time}`; chip `{Verdict}`; tag `Headline only` (title `Classified from the headline; no article text was extracted`)                                                                             |
| Excerpt                     | summary `Excerpt`; text ends with `…` when truncated                                                                                                                                                            |
| Company empty               | `No mentions of {Company} in {Window label} ({range}, UTC).` / with verdict: `No {verdict} mentions of {Company} in …` Actions `Show last quarter`, `Show all coverage since {D Mon YYYY}`, `Show all verdicts` |
| Subscribe button            | `Get email alerts`                                                                                                                                                                                              |
| Dialog                      | Title `Email alerts for {Company}`. Intro `Get an email when the daily check finds new coverage of {Company}.` Label `Email address`. Buttons `Subscribe`, `Cancel`                                             |
| Subscribe success           | `Subscribed {email} to {Company}.`                                                                                                                                                                              |
| Subscribe duplicate         | `{email} is already subscribed.`                                                                                                                                                                                |
| Email errors                | empty: `Email address: enter your email address.` · invalid: `Email address: enter an address like name@example.com.` · too long: `Email address: use 254 characters or fewer.`                                 |
| Range error summary         | heading `Check the dates`                                                                                                                                                                                       |
| Range errors                | `From date: enter a date like 2026-07-01.` · `To date: enter a date like 2026-09-30.` · `From date must be on or before To date.`                                                                               |
| Filter errors (recommended) | heading `Check the filters` · `Time window: choose Last quarter, This quarter, or Custom.` · `Verdict: choose All visible, Positive, Negative, Neutral, or Unranked.`                                           |
| 400 empty                   | `No results to show.` / `Fix the date range above, then apply it to see coverage.`                                                                                                                              |
| Review                      | h1 `Review`. Lede `Articles the classifier couldn't decide on. Read-only.` Count `{n} article(s) flagged`. Meta `Text source: Full text` / `Text source: Headline only`. Caption `Model reply`                  |
| Review empty                | `Nothing is flagged.` / `Uncertain classifications show up here for a human look.`                                                                                                                              |
| 404                         | h1 `Company not found`, p `There's no company with id “{id}”.`, button `Back to all companies`                                                                                                                  |
| 403                         | h1 `Request blocked`, p `This form can only be submitted from Press Monitor itself.`, button `Back to all companies`                                                                                            |

---

## 9. `src/ui/browser/app.js` module plan

One ES module, under 300 lines. Every function is small (≤ 60 lines, complexity ≤ 10), JSDoc-typed and exported for tests. Each `init*` takes a root (`Document` or `Element`) plus injectable dependencies, so happy-dom tests need no globals. Test file: `test/ui/browser/app.test.js` (`// @vitest-environment happy-dom` docblock, or the Vitest project config for `test/ui/browser`).

```js
/** Entry. Runs once on DOMContentLoaded. */
export function main(
  doc = document,
  deps = {
    storage: sessionStorage,
    formatter: new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
  },
) {
  doc.documentElement.classList.add("js");
  initLocalTimes(doc, deps.formatter);
  initAutoSubmit(doc, deps.storage);
  restoreFocus(doc, deps.storage);
  initNameFilter(doc);
  initCommandFallback(doc, globalThis.HTMLButtonElement?.prototype);
}
document.addEventListener("DOMContentLoaded", () => main());
```

(Default parameters are evaluated at call time, so `sessionStorage` is only touched inside `main`. Wrap storage access in try/catch, because Safari private mode and blocked storage throw.)

### 9.1 Local times: `initLocalTimes(root, formatter)`

- For each `time[data-local]`: `const d = new Date(el.dateTime)`. If valid, `el.title = el.textContent` (the UTC text) and `el.textContent = formatter.format(d)`. Invalid dates are left untouched.
- Pure helper `formatLocal(iso, formatter) → string | null`.
- Day counts ("3 days ago") and window/date-input values are **not** touched: they're UTC by design (decision: filters are UTC, and the day count is server-computed in UTC days).
- Tests: formats a valid time and sets title to the original text · leaves an invalid `datetime` unchanged · ignores `<time>` without `data-local` · formatter injected (fixed `timeZone: 'Asia/Jerusalem'`, locale `en-GB`) for deterministic output.

### 9.2 Auto-submit and focus restore: `initAutoSubmit(root, storage)`, `restoreFocus(root, storage)`

- Listen for `change` on `form[data-filters]` (delegated).
- `shouldAutoSubmit(target) → boolean` (pure): true for `input[type=radio]` except `name=window value=custom`; false for date inputs. _Strict spec: true for everything._
- When true: `rememberFocus(storage, target)` (JSON `{name, value}` under `pm:focus`, try/catch), then `form.requestSubmit()`.
- `restoreFocus`: read and parse the key (try/catch); find the matching `[data-filters] input` by iterating and comparing `name`/`value` (don't build selectors from stored strings); `focus()`; remove the key. Do nothing if it's missing or doesn't match.
- Tests: radio change calls `requestSubmit` (spy) · Custom radio doesn't submit · date change doesn't submit · stores name+value before submit · storage `setItem` throwing still submits · restore focuses the matching radio and removes the key · restore with no key / bad JSON / no match is a no-op · restore when `getItem` throws is a no-op · no form on page → no throw.

### 9.3 Name filter: `initNameFilter(root, { delay = 150 } = {})`

- Needs `[data-name-filter]`, `#name-filter`, `#name-filter-count`, `#companies tbody tr[data-search]`, `#name-filter-empty`. If any are missing (other pages, verdict-empty state), return.
- Remove `hidden` from `[data-name-filter]`.
- On `input`: `q = value.trim().toLowerCase()`; for each row `row.hidden = !matches(row.dataset.search, q)` (immediate; 258 rows is cheap). Toggle `table.hidden` and `#name-filter-empty.hidden` when shown === 0, and set its `[data-query]` text to the raw trimmed value via `textContent`. **Debounced** (`delay` ms): update the count text `Showing {shown} of {total} companies`, so the live region announces once after typing pauses.
- `matches(text, q)` (pure): empty q → true; else `text.includes(q)`.
- `countText(shown, total)` (pure).
- `[data-clear-filter]` click: value = '', re-run the filter, update the count immediately, `input.focus()`.
- Tests: un-hides the block · filters rows case-insensitively by name and alias · count updates only after the delay (`vi.useFakeTimers`) · rapid typing yields one count update · zero matches hides the table and shows the empty state with the query as text (verify `<b>` stays literal) · clear button resets rows, count and focus · missing elements → no-op · whitespace-only query shows all.

### 9.4 Invoker-command fallback: `initCommandFallback(root, buttonProto)`

- If `!buttonProto` or `'command' in buttonProto`: return (native support).
- Otherwise, for each `button[commandfor][command]`: on click, look up the target by id in the owning document. If it has `showModal` (`typeof target.showModal === 'function'`): `show-modal` → `if (!target.open) target.showModal()`; `close` → `target.close()`. Other commands: ignore.
- If `<dialog>` itself is unsupported, do nothing: the dialog content is already inline.
- Tests: native support (proto with `command`) → no listeners (click does nothing) · fallback opens via `showModal` (spy) · fallback close calls `close` · already-open dialog isn't re-opened · unknown target id → no throw · target without `showModal` → no throw · unknown command ignored.

### 9.5 Coverage notes

- Test `main` once with injected deps (asserts `html.js` and that each init ran by observable effect). Dispatch `DOMContentLoaded` once to cover the listener line.
- Don't branch on environment inside functions; inject instead. That keeps branch coverage at 100% without contortions.

### 9.6 `tsconfig` placement (decided)

Recommend **root `tsconfig.json` excludes `src/ui/browser` and `test/ui/browser`, plus `tsconfig.web.json`**:

```jsonc
// tsconfig.web.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "lib": ["ES2023", "DOM", "DOM.Iterable"], "types": [] },
  "include": ["src/ui/browser/**/*.js", "test/ui/browser/**/*.js"],
  "exclude": ["node_modules"], // must be set: "exclude" is inherited from the base, which excludes src/ui/browser
}
```

`"typecheck": "tsc -p tsconfig.json && tsc -p tsconfig.web.json"`. `eslint.config.js` also gets browser globals for `src/ui/browser` and `test/ui/browser`. _Why over project references: references need `composite` + `tsc -b` and declaration output, which fights the repo's `noEmit` setup. Two plain `-p` runs are simpler and keep Node types out of browser code (and DOM types out of server code)._

---

## 10. CSS architecture

- **One file, `src/ui/browser/app.css`** (= `app.reference.css`), served with `Content-Type: text/css; charset=utf-8`. Section order (as commented in the file): 1 Tokens → 2 Base → 3 Utilities → 4 Layout shell → 5 Components → 6 Filter toolbar → 7 Index → 8 Company (incl. dialog) → 9 Review → 10 Message pages → 11 Desktop `@media (min-width: 40em)` → 12 Forced colors → 13 Reduced motion.
- **Mobile-first.** Base rules are the narrow layout. One main breakpoint, `@media (min-width: 40em)` = 640px at the default font size. em, not px, so it also responds to user font-size changes, and at 200% zoom on a 1280px window the mobile layout applies (that's 640 CSS px). One micro-breakpoint, `min-width: 24em`, puts card labels beside their values. Only `min-width` queries.
- **`:has()` usage:** (1) reveal `.custom-range` when Custom is checked; (2) under the deviation, hide Apply unless Custom is checked. `@supports not selector(:has(*))` shows the range in old browsers.
- **No horizontal scroll rules.** `body { overflow-wrap: break-word }`; `overflow-wrap: anywhere` on h1, mention titles, review titles and company names; `min-width: 0` on flex/grid children holding text; inputs `width: 100%`; `<pre>` wraps and scrolls inside; the dialog is `width: min(28rem, 100vw - 2rem)`. **Never** "fix" overflow with `overflow-x: hidden` on `html`/`body`; it hides the bug and breaks sticky/focus scrolling. `tools/shoot.mjs` asserts `scrollWidth <= viewport` at 320, 390 and 640px for every mockup (currently passing).
- **`[hidden] { display: none !important }`** so component display rules never un-hide hidden elements (name filter, empty state, filtered rows).
- **State styling by attribute:** `aria-current`, `aria-invalid`, `:checked`, `[open]`, `data-verdict`, `html.js`. No state classes toggled by JS except `html.js`.
- **No inline styles and no inline scripts** in server HTML. That allows a strict CSP. Suggested header: `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`.
- **Known flash:** `html.js` is added when the module runs, after parsing, so for one frame Apply is visible and the name filter is hidden. Accepted; it doesn't shift layout much, and there's only one script by rule.

### Server model split

The model table in `docs/CODING-STANDARD.md` is the current split. The first plan here (one `page.js` with the tag, the components, and the filter form) was split in D2, D4, and D5 as each file reached 300 lines.

---

## 11. Accessibility checklist (mapped to requirements)

| Requirement                  | Implementation                                                                                                                        | How to verify                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Landmarks                    | `header`, `nav[aria-label=Main]`, `main#main`, `footer`; filters `form[aria-label=Filters]`                                           | VoiceOver rotor → Landmarks shows banner, navigation, main, form, contentinfo                       |
| One h1 per page              | h1 per page; sections h2, mentions h3                                                                                                 | axe `page-has-heading-one`; VO rotor → Headings                                                     |
| Labeled controls             | `<label for>` on inputs; radios inside labels; `fieldset/legend` groups                                                               | axe `label`; VO reads "Last quarter, radio button, 1 of 3, Time window, group"                      |
| Visible focus                | 2px accent outline, 2px offset; ring on the segment/pill span for hidden radios                                                       | keyboard pass (below); `shots/index--focus-*.png`                                                   |
| Skip link                    | first focusable; targets `main#main[tabindex=-1]`                                                                                     | Tab once from the address bar: link appears; Enter moves focus to main                              |
| aria-current                 | on the current nav link + 2px bar                                                                                                     | VO reads "Companies, current page"                                                                  |
| Table caption                | names window + verdict                                                                                                                | VO: "table, All visible mentions, Last quarter …"                                                   |
| Table semantics in card mode | explicit `role` attributes, `th scope=row`                                                                                            | at 390px, VO table navigation (VO+⌘+arrows) still reports row/column headers                        |
| Chips not color alone        | dot + word; borders survive forced colors                                                                                             | grayscale screenshot still reads; `shots/*--forced-colors.png`                                      |
| Contrast                     | §2.4 table, 0 failures                                                                                                                | `node tools/contrast.mjs`                                                                           |
| Dialog                       | native `showModal`, Escape, focus return                                                                                              | keyboard: Tab to "Get email alerts", Enter, type, Escape → focus back on the button                 |
| Dialog fallback              | dialog not hidden by CSS; JS backfill for `commandfor`                                                                                | see §14 #3 for the one gap (dialog supported, invoker commands not, JS off)                         |
| Form errors                  | `aria-invalid`, `aria-describedby`, message names the field, value kept, `autofocus`, error summary with links, title prefix "Error:" | submit "itay@example": VO announces the title, then focus lands in the field and it reads the error |
| Status message               | `role="status"` banner first in main + title prefix                                                                                   | after subscribing, VO reads "Subscribed: … · Press Monitor"                                         |
| Name filter                  | labeled search; polite status, debounced                                                                                              | VO: type "acme", pause → "Showing 1 of 258 companies" once                                          |
| Reflow (1.4.10)              | no horizontal scroll at 320px; 200% zoom → mobile layout                                                                              | `tools/shoot.mjs`; manually: 1280px window, ⌘+ to 200%, no sideways scroll                          |
| Text spacing (1.4.12)        | no fixed heights on text containers                                                                                                   | apply a text-spacing bookmarklet; nothing clips                                                     |
| Target size (2.5.8)          | nav links 44px tall, buttons 40px, pills 36px                                                                                         | inspect                                                                                             |
| Reduced motion               | dialog fade off                                                                                                                       | macOS Reduce motion on → dialog appears instantly                                                   |
| Forced colors                | §2.3                                                                                                                                  | Chrome DevTools → Rendering → Emulate forced-colors: active                                         |
| Times                        | `<time datetime>` UTC text; JS localizes and keeps UTC in `title`                                                                     | JS off: "28 Sep 2026, 08:15 UTC"; JS on: local format                                               |
| JS off                       | every page and form works                                                                                                             | DevTools → Disable JavaScript; run the manual passes below                                          |

**Manual test passes**

1. **Keyboard only** (no mouse). Tab: skip link → brand → Companies → Review → Time window (arrows move between segments; with JS each step reloads and focus returns to the same radio) → Verdict → (Apply when visible) → name filter → each company link. On the company page: back link → Get email alerts → (Enter opens the dialog, focus in the email field, Tab cycles Cancel/Subscribe, Escape closes and focus returns) → filters → each mention link → each Excerpt summary (Enter/Space toggles). Review: company link → title link → `<pre>` (arrow keys scroll it). The focus ring is visible at every stop; no stop is invisible.
2. **VoiceOver (macOS Safari + Chrome, iOS Safari).** Rotor headings: one h1, then sections. Table at 1280 and 390 widths: headers announced. Filter radios announce group legends. Dialog: "Email alerts for {Company}, dialog". After POST, the title is announced. Name filter status is announced once per pause. Decorative dots, ↗ and the "!" glyph are not read.
3. **Zoom/reflow.** 200% and 400% zoom at 1280 width; 320px width in responsive mode. No horizontal page scroll on any page (the `<pre>` may scroll inside itself). Long names and titles wrap.
4. **Forced colors.** Emulate in DevTools (and test on Windows High Contrast if available). Chips/buttons/segments have borders; the checked radio is shown with Highlight; focus is visible.
5. **JS off.** Filters submit via Apply; Custom dates appear on selecting Custom; name filter absent; times in UTC; "Get email alerts" opens the dialog natively where invoker commands exist (see §14 #3); subscribe POST works; 400 inline form works.
6. **Automated.** `node tools/axe.mjs` on the mockups (currently 0 violations: 10 pages × light/dark × 1280/390). Run axe (or `@axe-core/playwright`) against the real pages once built.

---

## 12. Acceptance checklist (coding agent ticks)

**Shell and assets**

- [ ] `src/ui/browser/app.css` = `app.reference.css` (adjust only with reason); `src/ui/browser/app.js`; served at `/app.css` and `/app.js` with correct content types; no CDN, no inline style/script
- [ ] `APP_NAME` constant; `<title>` patterns from §8, including `Error:` and `Subscribed:` prefixes
- [ ] Skip link, landmarks, `main#main[tabindex=-1]`, one h1 per page
- [ ] Nav: `aria-current="page"`; Review badge with hidden ", N flagged"; no badge when 0
- [ ] Footer: localized as-of time + collection-start (or "Collection has not run yet")

**Index**

- [ ] One `<table>` with explicit roles, visible caption naming window + verdict, all rows, no pagination
- [ ] Sort: last mentioned desc, none last, then name A–Z
- [ ] Cells per §6.1 (aliases, `Today`/`n days ago`/`No coverage`, tally + tones, zeros muted, "No mentions in this window")
- [ ] Verdict filter: counts only that verdict, zero rows omitted, empty state with "Show all verdicts"
- [ ] Pre-classification and not-run info panels; footnote only when relevant
- [ ] Name filter hidden without JS; filters by name/alias; debounced status; empty state + Clear filter
- [ ] Cards under 640px; label beside value at ≥24em; no horizontal scroll at 320px

**Filters**

- [ ] GET form, names `window|from|to|verdict`, defaults `last`/`all`, prefill last 90 days inclusive
- [ ] Custom range via `:has()` (+ `@supports` fallback); dates labeled "(UTC)"
- [ ] Window sentence under the form
- [ ] JS behavior per §7.3; hint shown only with JS; focus restore
- [ ] 400 on bad range: error summary, inline field error, `aria-invalid`, `aria-describedby`, `autofocus`, typed values kept, no results, empty state

**Company**

- [ ] Back link keeps the query; h1, aliases, descriptor
- [ ] Summary card: last mentioned (all data) + tally (window) + note
- [ ] Sections Negative → Positive → Neutral → Unranked, newest first, empty sections omitted, verdict filter shows one
- [ ] Mention: h3 link (http/https only, `rel="noopener noreferrer"`, CSS ↗), publisher, `<time data-local>`, chip, "Headline only" tag, `<details>` excerpt ≤ ~300 chars
- [ ] Empty-window and never-mentioned states with actions
- [ ] 404 for unknown id

**Subscribe**

- [ ] Button with `commandfor`/`command="show-modal"`; native `<dialog>` with `aria-labelledby`; no CSS hiding closed dialogs
- [ ] POST: 200 success/duplicate banners (`role="status"`), 400 inline section (value kept, `aria-invalid`, described-by, autofocus), 403 guard page
- [ ] Address rule and case-insensitive uniqueness

**Review**

- [ ] Cards with company link, title (link rule), text source, `<figure>` + `<pre tabindex=0 role=group>` (escaped), newest first
- [ ] Empty state "Nothing is flagged."

**Quality**

- [ ] `test/ui/browser` at 100% (functions, branches, lines) with the cases in §9
- [ ] ESLint/tsc clean (`tsconfig.web.json` per §9.6)
- [ ] Keyboard, VoiceOver, 200% zoom/320px, forced colors and JS-off passes (§11) done on the real app
- [ ] axe: 0 violations on `/`, `/companies/:id`, `/review`, 404, the 400 states, light and dark

---

## 13. Open questions for Itay

All answered on 2026-10-01. See the decision table at the top.

---

## 14. Conflicts and ambiguities found in the requirements

1. **Auto-submit vs WCAG 3.2.2 / date typing**: resolved by §7.3, approved.
2. **"Shows N of 258 companies"** with a verdict filter active: fewer than 258 rows are listed. This doc uses the rendered row count as the denominator ("Showing 12 of 40 companies"). Alternative: always 258, which would read as if the name filter hid rows it didn't.
3. **"Without dialog support, the form is still reachable."** True where `<dialog>` is unsupported (it renders inline). But a browser that supports `<dialog>` and not invoker commands, **with JS off**, shows a button that does nothing, and the form is unreachable. Options: (a) accept: these are older browser versions, and current engines ship invoker commands; (b) a no-JS link to a separate subscribe page (`GET /companies/:id/subscribe`), which is new scope. **Decided (a)**; noted in README limitations.
4. **Window sentence placement**: the index notes say "under h1", the filter notes say "beneath the form". This doc puts it **beneath the form on both pages** for consistency.
5. **Status message in `role="status"` on a freshly loaded page** isn't reliably announced (live regions announce changes). Mitigated with the title prefix; the role stays as required.
6. **"prefilled with the last 90 days"**: interpreted as 90 calendar days _inclusive_ of today (`from = today − 89`). If "today − 90" is meant, change one constant.
7. **"Apply is hidden with JS"** vs keeping it for Custom dates: part of the deviation.
8. **Tooltip on "Headline only"**: `title` isn't available to keyboard/touch users. The visible words carry the meaning, so the title is only a supplement.
9. **Unranked in tone counts**: the tally shows "18 mentions, 11 rated" and three tones; unranked has no tone item (it's implied as mentions − rated). With `verdict=unranked` on the index, the tally reads "2 mentions, 0 rated" with all tones zero, which is correct but plain. Acceptable.
