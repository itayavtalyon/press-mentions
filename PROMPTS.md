# Prompts

Log of prompts given to AI coding assistants.

## 2026-09-29 — Repository skeleton

```text
You are setting up the repository skeleton for a take-home assignment: a press-mentions monitoring system for OurCrowd portfolio companies. Do NOT implement any business logic yet. The architecture will be designed in a separate session. Your job is the project structure, the tooling, and quality gates strict enough that every line we write later has to meet a very high bar.

Hard constraints
Plain JavaScript (not TypeScript source files), Node.js 24, ES modules ("type": "module"). The assignment requires JavaScript/Node for the backend and data collection.
Runtime dependencies for now: ollama (official client for a locally running Ollama server) and better-sqlite3. Add nothing else at runtime without asking me.
Three runnable parts will live in this repo: an HTTP server (API and dashboard), a frontend (served by that server), and a daily job run from cron. Create an entry point and folder for each, containing only a placeholder.
Everything must run locally from a fresh clone with only the commands in the README.
Folder layout (placeholders only)
src/
  server/      # HTTP server entry: src/server/index.js
  web/         # frontend assets served by the server
  jobs/        # scheduled jobs entry: src/jobs/daily.js
  core/        # shared domain logic (empty for now)
  infra/       # adapters: db, ollama, news source (empty for now)
test/          # mirrors src/
data/          # output of a real run (committed later), keep a .gitkeep
docs/
  adr/         # architecture decision records, add 0000-template.md
PROMPTS.md     # log of every prompt given to AI coding assistants (a required deliverable, or maybe a folder with prompt files in it)
README.md      # stub with sections: Overview, Setup, Run, Architecture, Assumptions, Limitations
.env.example

Load environment variables with Node's built-in --env-file, not dotenv.

Quality gates (the strictest reasonable setup)
Use the latest stable versions and ESLint flat config (eslint.config.js).

Linting (errors, not warnings):
@eslint/js recommended as the base, plus strict extra rules: eqeqeq, no-var, prefer-const, no-implicit-coercion, no-param-reassign, no-shadow, consistent-return, curly: all, no-console (allowed only in entry points and a logger module).
Complexity limits: complexity at most 10, max-depth 3, max-params 4, max-lines-per-function 60, max-lines 300 per file.
Plugins: eslint-plugin-unicorn (recommended), eslint-plugin-sonarjs (recommended), eslint-plugin-n (Node rules), eslint-plugin-promise, eslint-plugin-import-x (no cycles, no unresolved, ordered imports), eslint-plugin-security, eslint-plugin-regexp, eslint-plugin-jsdoc (JSDoc required on exported functions, with types).
@eslint-community/eslint-plugin-eslint-comments: every eslint-disable must carry a description, and unused disables are errors.
Separate override blocks for browser globals (src/web) and test files.
Type checking without TypeScript source: tsconfig.json with allowJs, checkJs, strict: true, noEmit, noUncheckedIndexedAccess, exactOptionalPropertyTypes, driven by JSDoc types. npm run typecheck runs tsc --noEmit.
Formatting: Prettier, with eslint-config-prettier so style rules don't conflict.
Tests and coverage: Vitest with V8 coverage. Global thresholds of 90% for lines, statements, functions, and branches; the run fails below that. Use supertest for server tests and a DOM environment (happy-dom) only for test/web.
Dead code and dependencies: knip for unused files, exports, and dependencies.
Duplication: jscpd with a low threshold (fail above 3%).
Security: npm audit --audit-level=high.
Git hooks: husky and lint-staged run lint, format, and related tests on commit. commitlint enforces Conventional Commits.
CI: a GitHub Actions workflow that runs npm ci and then npm run verify on Node 24.
Housekeeping: .nvmrc, engines in package.json, .editorconfig, and a .gitignore that excludes the SQLite database files but keeps data/.
npm scripts
start (server), job:daily, lint, lint:fix, format, format:check, typecheck, test, test:coverage, knip, dup, audit, and verify, which runs every gate in sequence and fails on the first error.

Prove the gates work
Add one tiny real module, for example src/core/mention-status.js with a pure function daysSince(date, now), along with full JSDoc and tests at 100% coverage. Then:

Run npm run verify on a clean install and show me the output. Everything must pass.
Temporarily introduce a lint error, a type error, and a coverage drop one at a time, show that each gate fails, then revert.
Rules for you
Never weaken a rule, threshold, or config to make something pass. If a rule truly conflicts with the project, stop and tell me which rule and why.
Do not write business logic, pick a news source, design the database schema, or choose a frontend framework. Those decisions come from the design session.
When finished, report: the dependency list with versions, every rule you set that differs from the plugin defaults, and anything you were unsure about.

Maybe we should use `just` to simplify the commands.
```

## 2026-09-30 — Prompt evaluator

```text
Let's build the prompt evaluater. The list of modules should be gotten from the `ollama list` output (we can only test installed models). The prompts should be in a folder `prompt` and should be `classifier.vNNN.txt` where NNN is the version. Let's have a very (very!) simple prompt as version 0, the base line, and have two different prompts for the classifying job. Have placeholders in the text for the title, publication, company name, and an optional extra information for the company (can be empty).

In the evaluation database, prepare a few cases to test, especially the generic names that have different meanings.

The check should loop through the models, and then loop through the prompts and loop through the cases (each test case contains the parameters for the prompt. The program will inject the data into the prompt and send it to the ollama server. Compare result to the expected result and tally results. The end output is the scores, and the absolute winner in the end.

List of companies:  /Users/itay/Downloads/ourcrowd_companies.txt

Read the engineering documents. There should be a plan for this component. Use Remember to load the workflows, especially the writing code and reviewing code. Do a strict review when you are done coding, and then stop and wait for a second review.

If you have any questions while implementing this, stop and grill me before continuing.

Before you start, log this prompt in the coding agent prompt file.
```
