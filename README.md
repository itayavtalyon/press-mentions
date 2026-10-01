# Press mentions

## Overview

Local monitoring of press mentions for OurCrowd portfolio companies. The prompt evaluator scores installed Ollama chat models against saved classifier prompts. The server, daily job, and dashboard are still placeholders.

## Setup

Node.js 24.

```bash
npm ci
cp .env.example .env
```

Optional: [just](https://github.com/casey/just) wraps the same npm scripts (`just setup`, `just start`, `just job-daily`, `just verify`). A fresh clone does not need it.

## Run

```bash
npm start
npm run job:daily
npm run job:eval
npm run verify
```

`npm start` is the HTTP server. `npm run job:daily` is the daily job. Both load `.env` with Node's `--env-file`. Both exit without doing work.

`npm run job:eval` scores every installed chat model against `prompt/classifier.vNNN.txt` and the cases in the evaluation database. It needs a running Ollama server. `npm run verify` does not call Ollama.

`npm run verify` runs lint, format check, typecheck, tests with coverage, knip, duplication, and `npm audit`, and stops at the first failure.

## Architecture

The evaluator is described in `docs/engineering-notes.md`. The rest of the product is not built on this branch. Reserved folders:

- `src/config.js` — environment settings, including the classifier model and prompt version
- `src/jobs/prompt-eval` — prompt evaluator
- `src/core` — classifier and other domain logic
- `src/infra` — Ollama and SQLite adapters
- `src/server` — HTTP server (API and dashboard)
- `src/web` — frontend assets served by the server

Decision records go in `docs/adr`. `docs/adr/0000-template.md` is only a template.

## Assumptions

- The app runs on a developer machine with Node.js 24.
- The evaluator talks to a local Ollama server and stores cases and scores in SQLite. `better-sqlite3` and `ollama` are imported by that job.
- Local configuration lives in `.env`, which is not committed.

## Limitations

- No news source, API, dashboard, or schedule yet.
- The server and daily job files are placeholders.
- `supertest` is installed before any test imports it. Knip ignores that name until a real import exists.
- Typecheck uses TypeScript 6.0.3. TypeScript 7.0.2 is current, and `eslint-plugin-sonarjs` 4.2.2 crashes when that version is hoisted.
