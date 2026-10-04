# Runbook

## Overview

Local monitoring of press mentions for OurCrowd portfolio companies. The backfill collects Google News candidates for last quarter. The forward feed collects the trailing three days. The prompt evaluator scores installed Ollama chat models against saved classifier prompts. The dashboard server shows the index, company, and review pages.

## Setup

Node.js 24.

```bash
npm ci
cp .env.example .env
```

Optional: [just](https://github.com/casey/just) wraps the same npm scripts (`just setup`, `just start`, `just job-backfill`, `just job-feed`, `just job-unwrap`, `just job-fetch`, `just job-extract`, `just job-classify`, `just job-eligible`, `just job-digest`, `just job-mail`, `just job-eval`, `just verify`, `just ui-check`). A fresh clone does not need it.

## Run

```bash
npm run job:backfill
npm start
npm run job:feed
npm run job:unwrap
npm run job:fetch
npm run job:extract
npm run job:classify
npm run job:eligible
npm run job:digest
npm run job:mail
npm run job:eval
npm run verify
```

`npm run job:backfill` loads `seed/companies.txt` and `seed/overlay.json` into the coverage store at `COVERAGE_DB`. It holds `<COVERAGE_DB>.feed.lock` while it runs. Unwrap, fetch, extract, and classify do not share that file. It then collects each company's Google News candidates for last quarter through now: one query, or one per week when the first page is full, keeping at most 150. It stores each new article at stage `unwrap` and stops. It does not unwrap, fetch, extract, or classify. A company whose candidates are stored is skipped on the next run. Requests to Google are spaced by `GOOGLE_TOKEN_MS` and back off on 429. The job exits 1 if any company failed or Google kept throttling.

Each command has its own lock file, `<database>.<command>.lock`. Backfill and the forward feed share `feed` on the coverage database. Unwrap, fetch, extract, classify, and eligible lock that database under their own names. Digest and mail lock the alerts database under their own names. A different command may run at the same time. A second copy of the same command exits 1, names that pid, and does not open its store. The process writes its pid into a claim file and links that onto the lock, so the file is never empty, and deletes the lock when it exits. If the pid in the file is not running, the next start renames the file aside and takes the lock, so a crash does not stick. Two recovering starts cannot delete each other's lock. The loser exits naming the holder. A pid that now belongs to some other live process looks held until that process exits. Each process has its own in-memory token bucket. `news.google.com` uses `GOOGLE_TOKEN_MS`. Every other host uses `PUBLISHER_TOKEN_MS` (default 2000). If the feed and unwrap overlap, those Google rates add. At the default, Google can see two requests a second. There is no shared slot file.

Unwrap, fetch, extract, classify, and eligible are cron commands on the coverage store. Digest and mail are the cron commands after them, on the alerts store. Each text step holds its own lock for its whole run and reads only articles whose `stage` column is its own queue. A write matches that stage. A row that has already moved is logged and left alone. The step does not call the next step. Cron starts each step. The coverage row is the queue. If volume demands it, replace cron polling with a message queue such as Kafka. Classification is its own command.

`npm start` is the dashboard on `http://127.0.0.1:3000/` (`PORT` changes the port). It reads the coverage store and never writes collection data. `npm run job:feed` is the forward feed. It searches each company once for the trailing three days, `[now - 3 days, now)`, stores a new article at stage `unwrap` with origin `daily` and `alert_eligible` left at 0, and leaves a guid that company already has, including a backfill row. It does not set `backfilled_at`. It holds the same `<COVERAGE_DB>.feed.lock` as backfill. It does not unwrap, fetch, extract, classify, mark eligible, or enqueue. `npm run job:unwrap` stores the publisher URL for rows at stage `unwrap`. It GETs each article page, then sends a `batchexecute` POST for every 20 articles that returned a signature, and one more POST for a shorter remainder. A page it cannot resolve takes the title path. `docs/unwrap/README.md` is that call, and why a redirect is not the publisher URL. `npm run job:fetch` stores the publisher page for rows at stage `fetch`. Each publisher host has its own token bucket, refilled every `PUBLISHER_TOKEN_MS` milliseconds (default 2000), so one site does not slow another. A status other than 429 or 5xx, or a refused URL, takes the title path. Forbidden and similar blocks come from bot protection, a page that says to click to prove you are not a bot. The fetch job is a bot, so it fails that check. In production, workers with real browsers will bypass that detection with programmable mouse clicks and similar techniques and fetch the article body. In production at large scale, dedicated workers will work the queues by domain. `npm run job:extract` stores Readability text for rows at stage `extract`, or the title when that text is empty after trim. A throw records `last_error` on that row and the run continues. The third throw sets `retryable` to 0. `npm run job:classify` scores each open company link for articles at stage `classify` with the live model and prompt, then leaves the stage at `classify`. `npm run job:eligible` sets `alert_eligible` on daily mentions whose verdict is negative, positive, neutral, or unranked. Backfill stays unset. It does not enqueue. `npm run job:digest` is the next pipeline command. It upserts `ALERT_EMAIL` for every company and enqueues one pending digest per subscribed email and company that has a new mention. `npm run job:mail` logs each pending body and marks that outbox row sent. Neither command collects, unwraps, fetches, extracts, or classifies. The outbox unique key and the notified primary key are the idempotency guards. Each digest commits on its own. A failed write rolls back only that message, the command exits non-zero, and the next run stores what is still new. A sent outbox row stays for 96 hours after `sent_at`, which is longer than the 72-hour window, so the same mention set cannot be inserted again while it could still be eligible. Notified rows are not deleted, so the mention stays marked after that sent row is gone. There is no alert file. Delete `data/alerts.sqlite` before the first real digest run, because the file on disk has the old tables and there are no migrations. Every script loads `.env` with Node's `--env-file`.

`npm run job:eval` scores every installed chat model against `prompt/classifier.vNNN.txt` and the cases in the evaluation database. It needs a running Ollama server. `docs/prompt-eval/README.md` is how a run is scored, how the winner is chosen, and how a later prompt version is written. `npm run verify` does not call Ollama.

`npm run verify` runs lint, format check, typecheck, tests with coverage, knip, duplication, and `npm audit`, and stops at the first failure.

## Dashboard UI checks

```bash
npx playwright-core install chromium
just ui-check
```

The first command downloads playwright's Chromium build once. `just ui-check` runs `tools/contrast.mjs`, which reads the color tokens from `src/ui/browser/app.css` and checks each pair against its WCAG 2.x minimum. It then starts the server on port 3999 against `COVERAGE_DB` and runs `tools/shoot.mjs` and `tools/axe.mjs`. Shoot fails when a page scrolls sideways at 320, 390, or 640 px (640 px is a 1280 px window at 200% zoom), and writes viewport screenshots, forced colors, and keyboard focus to `docs/shots/`. Axe runs axe-core (WCAG 2.2 A and AA, plus best practices) light and dark at 1280 and 390 px. Each tool exits 1 on a failure. `tools/pages.mjs` lists the pages: the index (plain, negative filter, bad date, bad verdict), review, 404, an unknown company, and, when the index links a company, the first company's page, its dialog, the dialog's address error, the subscribe 400 page without script, a bad range, and the last company's page.

Results on 2026-10-04, on the real coverage store after the backfill and the first daily run were classified (258 companies, 5,011 articles, 3,058 visible Q3 mentions): contrast 72 pairs with 0 failures, no overflow at 320, 390, or 640 px on 13 pages, and 0 axe violations on 13 pages, light and dark, at 1280 and 390 px. The screenshots in `docs/shots/` are from this run. `sample-*.png` are manual captures of the same store.

Results on 2026-10-02, on the real coverage store during the first backfill (258 companies, 2,229 articles at stage `unwrap`, none classified):

- Contrast: 72 pairs, 0 failures.
- Overflow: none at 320, 390, or 640 px on 13 pages.
- axe: 0 violations on 13 pages, light and dark, 1280 and 390 px.
- Keyboard (spec §11 pass 1): skip link, brand, Companies, Review, Time window, Verdict, name filter, then each company link. The skip link moves focus to `main`. An arrow on Time window reloads the page and focus returns to the new radio. On a company page: back link, Get email alerts, filters, then the empty state's link. Enter opens the dialog with focus in the email field. Tab goes Cancel, Subscribe, then Chrome's own toolbar, then back to the field. Escape closes it and focus returns to Get email alerts. Every stop shows the focus ring.
- Name filter: `signals` gives `Showing 2 of 258 companies`. No match hides the table and shows the query and Clear filter.
- Zoom and reflow (pass 3): covered by the 320 and 640 px overflow runs. Text spacing (1.4.12) clips nothing at 1280 and 320 px.
- Forced colors (pass 4), emulated in Chromium: segments, pills, inputs, and buttons keep borders. The checked radio shows in Highlight. The focus ring shows.
- Script off (pass 5): the name filter is absent and Apply shows. Choosing a window does not submit, and Apply does. Custom shows the dates. A reversed range answers 400 with the field marked and the value kept. Times read in UTC. Get email alerts opens the dialog natively. A bad address posts to a 400 page with the field marked, focused, and kept.
- Reduced motion: the dialog has no animation.
- VoiceOver (pass 2), run by Itay on macOS Safari: one h1 and the five landmarks in the rotor; the Time window radio reads its position and group; the name filter status is announced once per pause; the dialog reads its name and role; the address error is read; table navigation reads the column headers.

The real store could not show any classified mention yet: index tallies and tones, the No coverage footnote, rows under a verdict filter, company sections, mentions with excerpts and Headline only, review cards, and the subscribed and already-subscribed banners (a real subscribe would write the real alerts store). A scratch store built from the same rules (one company with every verdict, a title-only mention, and a flagged row) is not real data. On it, shoot and axe passed on 13 pages, and the keyboard reached each mention link, each Excerpt summary (Enter opens it), and on review the company link, title link, and the reply `<pre>`. The 2026-10-04 run above covers the classified store. The review page had no flagged row, because no reply was unusable.

Before the backfill started, the empty store showed the not-run panel above a name filter reading `Showing 0 of 0 companies` and an empty table. The index now shows only the panel when the store has no company.

## Architecture

`docs/ARCHITECTURE.md` is how the pieces move. `docs/unwrap/README.md` is the Google News unwrap. `docs/adr/` records each choice. `docs/CODING-STANDARD.md` is the type, error, and file-ownership standard. `AGENTS.md` points coding agents at it. The evaluator boundaries are in `docs/engineering-notes.md`.

- `src/config.js` — paths, the Google interval, and the Ollama host. The live model and prompt version are constants in `src/core/classifier.js`.
- `src/jobs` — backfill, the pipeline from the forward feed through the mailer, and the prompt evaluator
- `src/core` — domain logic, including the classifier
- `src/infra` — Google News, Ollama, and SQLite adapters
- `src/server` — HTTP server: routes, the cross-site guard, headers, and static files
- `src/ui/pages` — server-rendered HTML pages
- `src/ui/browser` — the stylesheet and page script served to the browser

## Assumptions

- The app runs on a developer machine with Node.js 24.
- The backfill reads Google News. The evaluator talks to a local Ollama server and stores cases and scores in SQLite.
- Local configuration lives in `.env`, which is not committed.

## Limitations

- No API or cron schedule yet. The dashboard is complete: index, company, and review pages, the subscribe form (plain or in the dialog with script), the page script, and the UI checks. VoiceOver on iOS Safari and Windows High Contrast were not tried. A browser that supports `<dialog>` but not invoker commands, with script off, cannot open the subscribe dialog. The README lists the pipeline commands in order. It does not install a crontab.
- Typecheck uses TypeScript 6.0.3. TypeScript 7.0.2 is current, and `eslint-plugin-sonarjs` 4.2.2 crashes when that version is hoisted.
