# Press mentions

## Overview

Local monitoring of press mentions for OurCrowd portfolio companies. The backfill collects Google News candidates. The prompt evaluator scores installed Ollama chat models against saved classifier prompts. The server, forward feed, and dashboard are still placeholders.

## Setup

Node.js 24.

```bash
npm ci
cp .env.example .env
```

Optional: [just](https://github.com/casey/just) wraps the same npm scripts (`just setup`, `just start`, `just job-backfill`, `just job-feed`, `just job-unwrap`, `just job-fetch`, `just job-extract`, `just job-digest`, `just job-eval`, `just verify`). A fresh clone does not need it.

## Run

```bash
npm run job:backfill
npm start
npm run job:feed
npm run job:unwrap
npm run job:fetch
npm run job:extract
npm run job:digest
npm run job:eval
npm run verify
```

`npm run job:backfill` loads `seed/companies.txt` and `seed/overlay.json` into the coverage store at `COVERAGE_DB`. It holds `<COVERAGE_DB>.lock` while it runs. It then collects each company's Google News candidates for last quarter through now: one query, or one per week when the first page is full, keeping at most 150. A company whose candidates are stored is skipped on the next run. Requests to Google are spaced by `GOOGLE_TOKEN_MS` and back off on 429. The job exits 1 if any company failed or Google kept throttling.

Backfill, the forward feed, unwrap, fetch, and extract share that one lock. There is not a lock per stage. The process writes its pid and links that onto `<COVERAGE_DB>.lock`, so the file is never empty, and deletes the file when it exits. If cron starts one of those steps while a previous invocation is still running, the new process exits 1, names that pid, and does not open the coverage store. If the pid in the file is not running, the next start renames the file aside and takes the lock, so a crash does not stick. Two recovering starts cannot delete each other's lock. The loser exits naming the holder. A pid that now belongs to some other live process looks held until that process exits.

Unwrap, fetch, and extract are three cron commands. Each one, when it exists, holds the coverage lock for its whole run and reads only articles whose `stage` column is its own queue. It does not call the next step. Cron starts each step. The coverage row is the queue. If volume demands it, replace cron polling with a message queue such as Kafka. Classification of collected articles is not built yet.

`npm start` is the HTTP server. `npm run job:feed` is the forward feed. It collects the trailing three days and does not unwrap, fetch, extract, classify, or enqueue digests. `npm run job:unwrap`, `npm run job:fetch`, `npm run job:extract`, and `npm run job:digest` are the other cron commands. Those files, the server, and the feed exit without doing work. The mailer is a separate command and is not built yet. Every script loads `.env` with Node's `--env-file`.

`npm run job:eval` scores every installed chat model against `prompt/classifier.vNNN.txt` and the cases in the evaluation database. It needs a running Ollama server. `docs/prompt-eval/README.md` is how a run is scored, how the winner is chosen, and how a later prompt version is written. `npm run verify` does not call Ollama.

`npm run verify` runs lint, format check, typecheck, tests with coverage, knip, duplication, and `npm audit`, and stops at the first failure.

## Architecture

`docs/ARCHITECTURE.md` is how the pieces move. `docs/adr/` records each choice. `docs/CODING-STANDARD.md` is the type, error, and file-ownership standard. `AGENTS.md` points coding agents at it. The evaluator boundaries are in `docs/engineering-notes.md`.

- `src/config.js` — paths, the Google interval, and the Ollama host. The live model and prompt version are constants in `src/core/classifier.js`.
- `src/jobs` — backfill, forward feed, and the prompt evaluator
- `src/core` — domain logic, including the classifier
- `src/infra` — Google News, Ollama, and SQLite adapters
- `src/server` — HTTP server (API and dashboard)
- `src/web` — frontend assets served by the server

## Assumptions

- The app runs on a developer machine with Node.js 24.
- The backfill reads Google News. The evaluator talks to a local Ollama server and stores cases and scores in SQLite.
- Local configuration lives in `.env`, which is not committed.

## Limitations

- No API, dashboard, or cron schedule yet.
- The server and forward feed files are placeholders. Unwrap, fetch, extract, and classification of collected articles are not built yet.
- `supertest` is installed before any test imports it. Knip ignores that name until a real import exists.
- Typecheck uses TypeScript 6.0.3. TypeScript 7.0.2 is current, and `eslint-plugin-sonarjs` 4.2.2 crashes when that version is hoisted.
