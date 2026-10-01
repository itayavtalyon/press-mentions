# Press mentions

## Overview

Local monitoring of press mentions for OurCrowd portfolio companies. This repository is the skeleton: entry points, folders, and quality gates. Product behavior is not implemented.

## Setup

Node.js 24.

```bash
npm ci
cp .env.example .env
```

Optional: [just](https://github.com/casey/just) wraps the same npm scripts (`just setup`, `just start`, `just job-daily`, `just verify`). A fresh clone does not need it.

## Run

```bash
npm run job:backfill
npm start
npm run job:daily
npm run verify
```

`npm run job:backfill` loads `seed/companies.txt` and `seed/overlay.json` into the coverage store at `COVERAGE_DB`. It holds `<COVERAGE_DB>.lock` while it runs, and a second job exits 1 with the holder's process id. Collection is not built yet.

`npm start` is the HTTP server. `npm run job:daily` is the daily job. Both exit without doing work. Every script loads `.env` with Node's `--env-file`.

`npm run verify` runs lint, format check, typecheck, tests with coverage, knip, duplication, and `npm audit`, and stops at the first failure.

## Architecture

Not decided. Reserved folders:

- `src/server` — HTTP server (API and dashboard)
- `src/web` — frontend assets served by the server
- `src/jobs` — scheduled jobs
- `src/core` — shared domain logic
- `src/infra` — adapters (database, Ollama, news source)

Decision records go in `docs/adr`. `docs/adr/0000-template.md` is only a template.

## Assumptions

- The app runs on a developer machine with Node.js 24.
- A later design will talk to a local Ollama server and store data in SQLite. Those clients are dependencies already. Nothing imports them yet.
- Local configuration lives in `.env`, which is not committed.

## Limitations

- No news source, database schema, API, dashboard, or schedule yet.
- The server and daily job files are placeholders.
- `ollama`, `better-sqlite3`, and `supertest` are installed before any module imports them. Knip ignores those three names until a real import exists.
- Typecheck uses TypeScript 6.0.3. TypeScript 7.0.2 is current, and `eslint-plugin-sonarjs` 4.2.2 crashes when that version is hoisted.
