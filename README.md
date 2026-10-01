# Press mentions

## Overview

Local monitoring of press mentions for OurCrowd portfolio companies. The backfill collects Google News candidates. The prompt evaluator scores installed Ollama chat models against saved classifier prompts. The server, daily job, and dashboard are still placeholders.

## Setup

Node.js 24.

```bash
npm ci
cp .env.example .env
```

Optional: [just](https://github.com/casey/just) wraps the same npm scripts (`just setup`, `just start`, `just job-backfill`, `just job-daily`, `just job-eval`, `just verify`). A fresh clone does not need it.

## Run

```bash
npm run job:backfill
npm start
npm run job:daily
npm run job:eval
npm run verify
```

`npm run job:backfill` loads `seed/companies.txt` and `seed/overlay.json` into the coverage store at `COVERAGE_DB`. It holds `<COVERAGE_DB>.lock` while it runs, and a second job exits 1 with the holder's process id. It then collects each company's Google News candidates for last quarter through now: one query, or one per week when the first page is full, keeping at most 150. A company whose candidates are stored is skipped on the next run. Requests to Google are spaced by `GOOGLE_TOKEN_MS` and back off on 429. The job exits 1 if any company failed or Google kept throttling. Text extraction and classification are not built yet.

`npm start` is the HTTP server. `npm run job:daily` is the daily job. Both exit without doing work. Every script loads `.env` with Node's `--env-file`.

`npm run job:eval` scores every installed chat model against `prompt/classifier.vNNN.txt` and the cases in the evaluation database. It needs a running Ollama server. `npm run verify` does not call Ollama.

`npm run verify` runs lint, format check, typecheck, tests with coverage, knip, duplication, and `npm audit`, and stops at the first failure.

## Architecture

Collection and storage are described in `docs/ARCHITECTURE.md`. The evaluator is described in `docs/engineering-notes.md`.

- `src/config.js` — classifier model, prompt version, evaluation database, and Ollama host
- `src/jobs` — backfill, daily job, and the prompt evaluator
- `src/core` — domain logic, including the classifier
- `src/infra` — Google News, Ollama, and SQLite adapters
- `src/server` — HTTP server (API and dashboard)
- `src/web` — frontend assets served by the server

Decision records go in `docs/adr`. `docs/adr/0000-template.md` is only a template.

## Assumptions

- The app runs on a developer machine with Node.js 24.
- The backfill reads Google News. The evaluator talks to a local Ollama server and stores cases and scores in SQLite.
- Local configuration lives in `.env`, which is not committed.

## Limitations

- No API, dashboard, or daily schedule yet.
- The server and daily job files are placeholders. Text extraction and classification of collected articles are not built yet.
- `supertest` is installed before any test imports it. Knip ignores that name until a real import exists.
- Typecheck uses TypeScript 6.0.3. TypeScript 7.0.2 is current, and `eslint-plugin-sonarjs` 4.2.2 crashes when that version is hoisted.
