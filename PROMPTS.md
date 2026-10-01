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
  jobs/        # scheduled jobs entry: src/jobs/feed.js
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
start (server), job:feed, lint, lint:fix, format, format:check, typecheck, test, test:coverage, knip, dup, audit, and verify, which runs every gate in sequence and fails on the first error.

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

## 2026-09-30 — Architecture decisions

```text
You are a panel of three senior reviewers: a staff backend engineer, an ML/LLM engineer, and a product-minded tech lead. We are designing the architecture of my take-home assignment together. Your job is to grill me: ask about every decision, push back on weak answers, and surface tradeoffs I haven't considered. Do not write code in this session.

How to run the session
Ask one area at a time, with no more than 3 questions per turn. Ask me first; don't lead me to your preferred answer. After I answer, critique it, offer the strongest alternative, and state the tradeoff in one or two sentences.
If I'm unsure, give me 2–3 concrete options with pros and cons and ask me to choose.
Keep a running decision log. Whenever we settle something, record it as: decision, alternatives considered, reason, consequences.
Flag any decision that breaks a hard constraint below, immediately.
Keep the scope realistic for the time budget. If I over-engineer, say so.
The assignment (product requirements)
OurCrowd tracks press coverage of its portfolio and fund companies. Build a small system that:

Quarterly press dashboard: for each company, shows its press mentions from the last quarter. Each mention is classified as positive, negative, or neutral, and links to the original article.
Current mention status: for each company, shows its status based on when it was last mentioned (for example, "last mentioned 3 days ago", "45 days ago", or "no coverage found").
Daily alert: a daily job checks for new press mentions of any tracked company and sends an alert when it finds one. The channel is my choice (email, Slack, webhook, or console/log), as long as it's visible and documented.
They evaluate: correctness (the pipeline runs end to end and produces all three outputs), code quality (structure, readability, error handling), use of the local LLM (sensible prompting and Ollama integration), documentation (a stranger can set up and run it from the README alone), and product thinking (sensible choices about classification, alerting, and how the dashboard presents information). They say they care more about the approach than a perfect product, and that a partial solution with clear notes beats an undocumented "complete" one.

Hard constraints
JavaScript on Node.js for the backend and all data collection. Frameworks and libraries are up to me.
Sentiment classification, plus any other text-understanding step (relevance filtering, summarization), must run on a locally hosted Ollama model. No cloud LLM APIs.
The README must state which Ollama model was used and why, how it's invoked (prompt structure and output format), and how classification quality was validated.
The news source is my choice (news or search APIs, RSS, scraping), but the choice and its limitations must be documented.
Deliverables: a GitHub repo with a README covering what it does, the structure, setup (dependencies, environment variables, installing Ollama and which model to pull), the exact commands to run end to end, and the assumptions, tradeoffs, and limitations. A data/ folder with the output of a real run (mentions, sentiment labels, links, and the computed "last mentioned" status per company). A copy of the full prompts used with AI coding assistants.
Deadline: Monday, October 5, 2026, 16:00 Israel time. Realistic build budget is about 14 hours across 3–4 days.
Known facts and context
The seed list has 258 companies, names only, with no domain or sector. It's the source of truth for what to track.
Many names are ordinary words: Harvey, Peak, Wave, Near, Glean, Shield, Guild, Silo, Ro, Casper, Tala, Launchpad, Orchard, Island. Irrelevant articles are the biggest quality risk.
Some companies are enormous (SpaceX, Anthropic, Stripe, xAI, Databricks) and have thousands of articles per quarter. Some are defunct or acquired and will have none. Several names carry "(formerly X)" annotations.
Hardware: an M1 Max MacBook with 32 GB of RAM. Ollama is installed with qwen2.5:14b, qwen3.5:9b, and gemma4:12b. The plan is to compare them on a hand-labeled set of about 40 articles for accuracy and seconds per article.
The repo skeleton already exists: Node 24, ESM, ollama and better-sqlite3, strict ESLint, tsc checkJs, Vitest with 90% coverage thresholds. Entry points are src/server/index.js, src/web/, and src/jobs/feed.js.
My background: a senior backend engineer (Scala microservices at Wix, event-driven systems, idempotent consumers, transactional outbox). My frontend skills are rusty.
Areas you must cover (in roughly this order)
Scope and definitions: what "last quarter" means (a rolling 90 days or the calendar quarter), what counts as a "mention", and the thresholds for the status buckets.
News sourcing: which source(s), query construction, rate limits, result caps, date filtering, full text vs snippets, and what we lose with each choice.
Entity disambiguation: how we decide an article is really about this company. Query-time tricks vs LLM relevance checks, whether and how to enrich the seed list, and handling "(formerly X)" names.
LLM classification: one call or separate relevance and sentiment calls, the prompt structure, the JSON schema, temperature, handling malformed output, batching, caching by article, and re-classifying when the model or prompt changes.
Validation: building the labeled set, which metrics to use, the comparison method, and how to report it in the README.
Storage: the schema (companies, articles, mentions, runs), the uniqueness keys, many-to-many between companies and articles, and what's exported to data/ and in what format.
Idempotency and re-runs: the definition of a "new" mention for alerts, what happens if the job crashes halfway, and keeping duplicate runs from sending duplicate alerts.
Daily job and alerting: scheduling (cron, node-cron, or documented crontab), the channel, the alert content and priority (should negative mentions come first?), and grouping.
Dashboard and UX: what the reviewer sees first, sorting and filtering, how to show "no coverage", and a framework choice given my rusty frontend vs keeping it simple.
Runtime budget: articles per company, total LLM calls, expected duration of the full run, and parallelism.
Errors, config, and observability: retries and backoff, partial failures, logging, and configuration through environment variables.
Testing strategy: what's unit-tested, how Ollama and the news source are faked, and how to reach 90% coverage without writing meaningless tests.
Cuts: what gets dropped first if time runs out, and how that's documented.
Output at the end of the session
When all areas are covered, produce:

docs/ARCHITECTURE.md with: a one-paragraph overview, a context diagram and a component diagram (Mermaid), sequence diagrams for the collection-and-classification pipeline and for the daily alert job (Mermaid), an ER diagram of the database (Mermaid), and the data flow into data/.
One ADR per major decision in docs/adr/, using the template.
An ordered build plan: tasks with rough hours that fit the 14-hour budget, with must-haves first.
A list of open questions and risks.
Start with area 1.
```

## 2026-09-30 — Architecture review

Attached: the assignment PDF and `ourcrowd_companies.txt`. The answers to the review's multiple-choice questions are recorded in the ADRs.

```text
This is a new project (a home assignment). I started writing the architecture notes and records and I need a very strict review of the choices there.  Attaching the assignment information. I want you to find holes, mistakes, edge cases, and any place that an implementor have to decide or make product calls.

Grill me and interrogate me.
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

## 2026-10-01 — Architecture deep review

The multiple-choice answers from this review are locked in `docs/ARCHITECTURE.md`, `docs/adr/`, and `docs/CODING-STANDARD.md`.

```text
Deep review the architecture for this exercise. Apply my workflows, and code standards, and grill me about anything not clear, or left open / unanswered (the goal is that an implementer will have all the information needed and will not invent anything).
I want us to set a coding standard ts
```

## 2026-10-01 — Coding standards for agents

```text
Got cut off, I want to set some coding standards to the coding agents. I want SOLID principles applied, code should be simplified. Less files, group models by functionality so each model is in charge of one thing, and it is easy to understand what.
```

## 2026-10-01 — Prompt log

```text
We also need to record the prompts I use with you in the @PROMPTS.md file
```

## 2026-10-01 — Prompt evaluation review

```text
I want you to go over the prompt evaluation mechanism. Review and make sure it does its job. Then go over the cases, and see about adding more of various difficulties. Then we will run them. We should have a README file explaining the process and how we chose the winning model and prompt. We can also see after an evaluation run if we can have a new version that might score better.
```

## 2026-10-01 — Multi-company cases and an evaluation run

```text
Let's add a few cases where an article mentions more than one company (and we pass few companies as candidates). And then run the evaluator.
```

## 2026-10-01 — Set the live pair to the eval winner

```text
update the configs with the winners and commit
```

## 2026-10-01 — Pipeline review

```text
Let's continue reviewing other parts of the system. Now I am interested in the pipeline processes for getting and handling news mentions. Each components must operarte independently without impacting other components, and we have to make sure that each process runs as a signleton. Review what's done and then grill me.
```

## 2026-10-01 — Record the pipeline answers

```text
Record these answers in the ADRs. Let's keep the public documentation accurate
```
