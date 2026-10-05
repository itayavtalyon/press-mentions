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

## 2026-10-02 — Backfill deep review

```text
Let's deep review and examine the backfill process. We need to start it soon. It should just do the fetching of articles published already. The rest of the process should be done with the regular pipeline, which is work in progress
```

## 2026-10-02 — Classifier pipeline prompt

```text
While the backfill starts in a new window, give me the prompt to write the classifier pipeline component.
```

## 2026-10-02 — Classify pipeline command

```text
Write the classify pipeline command. The backfill only stores Google News candidates at stage unwrap. Unwrap, fetch, and extract already exist and move a row to stage classify. This command is the next process. It does not unwrap, fetch, extract, collect, or touch the alerts store.

Read AGENTS.md, docs/CODING-STANDARD.md, docs/ARCHITECTURE.md, ADR 0004, and ADR 0006 before editing. Match src/jobs/run-extract.js and src/jobs/run-fetch.js. Plain JavaScript, JSDoc, named exports. No any, no ts-ignore, no unchecked casts. Throw Error. One model per file. Do not add a file for a helper. src/core does not import an adapter. Tests use fakes and temp databases. No network. npm run verify must pass.

What already exists
- src/core/classifier.js builds one call and reads verdicts. Use Classifier. Do not edit LIVE_MODEL, LIVE_PROMPT_VERSION, temperature, seed, num_ctx, or the article cap. They are qwen3.5:9b and v001. They are not environment variables.
- src/infra/ollama.js OllamaClient.chat sends that request. prompt-eval calls chat once per case. Do not add retries inside chat.
- src/jobs/prompt-eval/prompts.js reads prompt/classifier.vNNN.txt. Load the live version from there. Add a function on that module if it can only load every file. Do not copy the reader. A missing file or a missing placeholder throws.
- Verdicts live on company_articles: verdict, model_id, prompt_version, raw_response, review_flag. articles.stage stays classify after success. There is no done stage.
- /review lists every company_articles row whose verdict is uncertain. It reads raw_response.

Queue
Read retryable articles at stage classify that have at least one company link still open. A link is open when verdict is null, or model_id is not LIVE_MODEL, or prompt_version is not LIVE_PROMPT_VERSION. An article whose every link matches the live pair is not a call. A retryable 0 row is skipped.

One article is one chat call. The call includes only the open links, ordered by company id. Send companies.query_name as the company name. That is the name in the labeled cases, not the seed line and not the parenthetical. Pass companies.descriptor as the note, word for word. Omit the note when the descriptor is null or empty. Article text is extracted_text. Publisher is publisher_name, or "" when null. Homepage is publisher_homepage, or "" when null. A null extracted_text throws. That row was not written by extract.

Call Classifier.request, then the chat port. Classifier.verdicts maps the reply. A missing or unknown value is uncertain for that company only. Other companies in the same reply still count.

Writes
One transaction per article. Guard the article with WHERE guid = ? AND stage = 'classify'. Zero rows means it moved. Log classify.moved and continue. Do not throw, and do not move the row backward.

For each open link, set verdict, model_id, prompt_version, and raw_response to the reply text. Leave stored verdicts for the live pair unchanged. A later company on an article that was already classified gets one new call with only that company.

A reply that is not a JSON object is a parse failure, not an Ollama failure. Every company in that call is uncertain, review_flag is 1, and raw_response is the raw text. A JSON object, including a model value of uncertain and a missing key, stores review_flag 0. uncertain is finished. Do not retry it.

On a finished article set attempt_count to 0, clear last_error, and leave retryable 1 and stage classify.

Ollama failures
Connection refused, timeout, or HTTP 5xx back off and retry the same article: 5 attempts, 2 second base, 5 minute cap, jitter from half to all of the exponential delay. Inject the clock and random. Honor the same limits as ADR 0006. Do not import the private HTTP policy object. Any other error throws out of the command.

When the attempts are exhausted, leaveForRetry. The third exhausted run sets retryable to 0 and leaves stage classify. null from leaveForRetry means the row moved. Log and continue. Three exhausted failures in a row stop the command for the rest of the run. A success resets that count. Skipped rows stay retryable and do not gain an attempt. Log classify.stopped and exit non-zero. Name the dependency in the log.

Command shape
src/jobs/run-classify.js holds the work. src/jobs/classify.js only loads config, builds the clock, random, logger, and Ollama client, calls runClassify, logs classify.finished, and sets process.exitCode. The lock is withCommandLock(coverageDatabase, "classify"), taken before the store opens. A second classify exits 1 and names the holder. Exit 0 only when no retryable row at classify still has an open link.

Put the classify read and the verdict write in src/infra/stage-queue.js. Widen its stage type so leaveForRetry accepts classify. Keep dashboard queries in coverage-read.js.

Wire npm run job:classify, a just job-classify recipe, the vitest coverage exclude, the coding-standard shim list, and one README sentence next to the other jobs. Log this prompt in PROMPTS.md.

Tests, written first
- A scripted reply writes one verdict per open company, with model, prompt version, and raw response. Stage stays classify.
- A second run with the same pair makes no chat call.
- A different prompt version calls again and overwrites those links.
- A new company linked after the first call is the only name in the next call. The older verdict stays.
- A non-JSON reply stores uncertain, review_flag 1, and the raw text, and the next run does not call again.
- A model value of uncertain stores review_flag 0.
- An exhausted connection failure leaves the row retryable. The third such run is terminal and a later run skips it.
- Three exhausted failures in a row stop the run. The remaining rows are unchanged.
- A row that left stage classify is logged and left alone.
- The command does not open the alerts database.

Do not run the command against the real coverage database.
```

## 2026-10-02 — Unwrap deep review

```text
Deep review the unwrap step in the pipeline. I would like to run it with the backfill data when it is ready to go
```

## 2026-10-03 — Extract deep review

```text
Now do the same for the extract step.
```

## 2026-10-03 — Fetch deep review

```text
Please deep review the fetch step in the pipeline. I would like to have it run next when it's good to go
```

## 2026-10-04 — Alert digest and mailer

```text
Implement the digest command and the mailer. Classify already stores verdicts. These two commands are the alert path. Digest enqueues. The mailer logs. Neither command collects, unwraps, fetches, extracts, or classifies.

Read AGENTS.md, docs/CODING-STANDARD.md, docs/ARCHITECTURE.md, ADR 0005, ADR 0006, ADR 0007, and ADR 0009 before editing. Match src/jobs/run-classify.js. Plain JavaScript, JSDoc, named exports. No any, no ts-ignore, no unchecked casts. Throw Error. One model per file. Do not add a file for a helper. src/core does not import an adapter. Tests use fakes and temp databases. No network. npm run verify must pass. Do not change LIVE_MODEL or LIVE_PROMPT_VERSION. Do not commit unless asked.

This prompt replaces the ADR 0007 mailer. Do not write data/alerts/<id>.txt. Do not delete an outbox row on send. Update ADR 0007, ADR 0005, ADR 0009, docs/ARCHITECTURE.md, and docs/BUILD-PLAN.md so they stop saying the mailer writes that file and deletes the row. The sequence diagram, the outbox columns, and the "can send the same body twice" note change with them.

What already exists
- src/infra/alerts-store.js opens the alerts file and subscribe() upserts one company and email. Email is stored as typed. subscriptions is unique on (company_id, email) COLLATE NOCASE. notified is unique on (email, company_id, guid). Leave that primary key as it is. Do not delete notified rows.
- src/jobs/digest.js is an empty placeholder. src/jobs/mail.js does not exist. vitest already excludes both shims. npm run job:digest and just job-digest already exist.
- alert_eligible is set only when the forward feed first inserts a guid. Backfill does not alert. The feed does not enqueue. A later feed does not flip a backfill row.
- published_at is toISOString text. Text comparison is time comparison. The window is now - 72 hours <= published_at < now.
- Schema changes by deleting the sqlite file. There are no migrations. CREATE TABLE IF NOT EXISTS will not add columns to data/alerts.sqlite. Do not delete data/alerts.sqlite or data/coverage.sqlite. Do not run either command against those files.

Outbox
Add status, mention_ids, and sent_at to outbox in src/infra/alerts-store.js. status is pending or sent. mention_ids is the canonical set: guids sorted by UTF-16 code unit, then JSON.stringify, so ["a","b"] with no spaces. sent_at is null while pending, and toISOString when sent. email is COLLATE NOCASE. UNIQUE (email, company_id, mention_ids). A pending row has a null sent_at. A sent row has a sent_at. created_at stays toISOString.

The same email, company, and mention set cannot be inserted twice. A different set for that email and company is a different digest and is still inserted while those mentions are inside 72 hours. Case-different emails are the same key.

Digest
src/jobs/run-digest.js holds the work. src/jobs/digest.js only loads config, builds the clock and logger, calls runDigest, logs digest.finished, and sets process.exitCode. The lock is withCommandLock(alertsDatabase, "digest"), taken before either store opens. A second digest exits 1 and names the holder. It does not lock the coverage database. The mailer may run at the same time.

Upsert one ALERT_EMAIL subscription per company before enqueue, through subscribe(). Then read candidates from the coverage store. Put that read in src/infra/coverage-store.js. src/infra/stage-queue.js is already at the file limit. Do not add the query there. Dashboard queries stay in coverage-read.js. The coverage read does not know about notified.

A candidate has verdict positive, negative, neutral, or unranked, alert_eligible set, and published_at inside the window. unrelated and uncertain are not candidates. The clock is injected. Do not call Date.now in the job.

For each subscription, keep only candidates for that company with no notified row for that stored email, company, and guid. Use the email stored on the subscription. One message per email per company, and only when at least one mention remains. Skip a company with none. Item order is negative, positive, neutral, unranked. Within a verdict, newest published_at first, then guid. The link is publisher_url, or google_url when publisher_url is null or empty. The company line is display_name.

The body is exactly this shape, with a newline after the last line. A blank line sits between items. Empty verdicts are omitted. An unranked item adds the tone line:

To: <email>
<display name>

<title>
<link>
Verdict: <verdict>

<title>
<link>
Verdict: unranked
Tone: unranked

Enqueue
Build every digest for this run first. Then write them in one alerts transaction. Insert every outbox row as pending, ON CONFLICT DO NOTHING, and only after those inserts insert the notified rows, ON CONFLICT DO NOTHING. A conflict means that digest is already stored. It counts as success. Still write any missing notified rows for that set. Do not update the stored body.

A throw rolls the transaction back. That attempt leaves no new outbox row and no new notified row. Do not mark a mention whose digest was not stored. Digest does not set status to sent, does not log a body, does not write a file, and does not call the network.

Insert digests in email, then company id, order. Exit 0 when the transaction commits, including when nothing was eligible. A throw exits 1.

Mailer
src/jobs/run-mail.js holds the work. src/jobs/mail.js matches the digest shim and logs mail.finished. The lock is withCommandLock(alertsDatabase, "mail"), taken before the store opens. A second mailer exits 1 and names the holder. It does not open the coverage database, does not rebuild a body, does not write a file, and does not call the network.

At the start, delete outbox rows where status is sent and sent_at <= now - 96 hours. 96 hours is 72 hours plus one day. Compare toISOString text. Never delete a pending row. Never delete a notified row. A row sent in this run has sent_at of now, so this cleanup does not remove it.

Then read pending rows oldest created_at, then id. For each row:

UPDATE outbox SET status = 'sent', sent_at = ? WHERE id = ? AND status = 'pending'

If that update changes one row, log mail.sent with the stored body. If it changes zero rows, do not log. The update commits before the log. A crash after the update and before the log leaves the row sent and the body on the row. The next run does not log it again. That missing log line is accepted. The sent row is the evidence.

A throw leaves later rows pending, leaves already-sent rows sent, and exits 1. Exit 0 when every pending row has been claimed or there were none.

README
Add one sentence next to the other jobs for npm run job:mail, and a just job-mail recipe. Add src/jobs/mail.js to the coding-standard shim list. Say that the outbox unique key and the notified primary key are the idempotency guards. A sent outbox row stays for 96 hours after sent_at, which is longer than the 72-hour window, so the same mention set cannot be inserted again while it could still be eligible. notified rows are not deleted, so the mention stays marked after that sent row is gone. There is no alert file. Say that data/alerts.sqlite must be deleted before the first real digest run, because the file on disk has the old tables and there are no migrations.

Tests, written first
- An eligible mention for ALERT_EMAIL becomes one pending row and one notified row. The body matches the shape above. The link is the publisher URL.
- An unranked item includes Tone: unranked. A null publisher URL uses the Google URL.
- Items come out negative, positive, neutral, unranked, and newest first inside one verdict.
- unrelated, uncertain, alert_eligible unset, published_at older than 72 hours, and published_at equal to now do not enqueue. published_at equal to now - 72 hours does.
- A second run inserts nothing new.
- A new mention for the same email and company inserts a second outbox row with a different mention_ids value, and only that guid is newly notified. The older item is not repeated in the new body.
- The same mention set already pending or sent does not insert again. Missing notified rows are still written. The stored body stays.
- A thrown write rolls back. Both tables are unchanged by that attempt.
- Two subscribers for one company get two rows. A company with no new mention writes nothing. ALERT_EMAIL is upserted when nothing is sent.
- A case-different address does not create a second subscription or a second digest.
- Digest does not set sent, does not write a file, and a second digest names the holder and does not open the store.
- The mailer sets sent and sent_at from the injected clock, logs the stored body once, and leaves the row. A second run does not log it. An update that changes zero rows does not log.
- A sent row older than 96 hours is deleted. A sent row younger than 96 hours stays. A pending row older than 96 hours stays. notified stays.
- A throw after one claimed row leaves the later row pending and the first row sent.
- The mailer does not open the coverage database. A second mailer names the holder.

Do not run the commands against the real coverage database or the real alerts database.
```

## 2026-10-04 — Extract Readability crash

```text
The run of the extract job failed with: /Users/itay/Library/Mobile Documents/com~apple~CloudDocs/Code/OurCrowd/Untitled/node_modules/@mozilla/readability/Readability.js:1382
        while (parentOfTopCandidate.tagName !== "BODY") {
                                    ^

TypeError: Cannot read properties of null (reading 'tagName')
    at Readability._grabArticle (/Users/itay/Library/Mobile Documents/com~apple~CloudDocs/Code/OurCrowd/Untitled/node_modules/@mozilla/readability/Readability.js:1382:37)
    at Readability.parse (/Users/itay/Library/Mobile Documents/com~apple~CloudDocs/Code/OurCrowd/Untitled/node_modules/@mozilla/readability/Readability.js:2747:31)
    at Object.extractArticleText [as extract] (file:///Users/itay/Library/Mobile%20Documents/com%7Eapple%7ECloudDocs/Code/OurCrowd/Untitled/src/infra/extractor.js:24:6)
    at extractAll (file:///Users/itay/Library/Mobile%20Documents/com%7Eapple%7ECloudDocs/Code/OurCrowd/Untitled/src/jobs/run-extract.js:65:31)
    at file:///Users/itay/Library/Mobile%20Documents/com%7Eapple%7ECloudDocs/Code/OurCrowd/Untitled/src/jobs/run-extract.js:40:14
    at withLock (file:///Users/itay/Library/Mobile%20Documents/com%7Eapple%7ECloudDocs/Code/OurCrowd/Untitled/src/infra/lock.js:56:18)
    at withCommandLock (file:///Users/itay/Library/Mobile%20Documents/com%7Eapple%7ECloudDocs/Code/OurCrowd/Untitled/src/infra/lock.js:38:10)
    at runExtract (file:///Users/itay/Library/Mobile%20Documents/com%7Eapple%7ECloudDocs/Code/OurCrowd/Untitled/src/jobs/run-extract.js:37:10)
    at file:///Users/itay/Library/Mobile%20Documents/com%7Eapple%7ECloudDocs/Code/OurCrowd/Untitled/src/jobs/extract.js:12:23
    at ModuleJob.run (node:internal/modules/esm/module_job:439:25)

Node.js v24.17.0
```

## 2026-10-04 — Extract must continue after a row error

```text
It should not kill the process! It should mark this row and an error and move on to the next one
```

## 2026-10-04 — Detect a script before the html element

```text
Is there a way programatticaly detect it and fix it?
```

## 2026-10-04 — Digest retry

```text
I do not want the digest to throw everything, We need to make it idempotent and safe to retry.
Logs are less important then sending an email so this is fine
```

## 2026-10-04 — Assignment check and a readable sample

```text
/Users/itay/Downloads/OC FullStack Dev Task 2026.pdf
I want to make sure that we have made everything that we were supposed to do for this assignment. Be critical. I also want to add extra things so it will be easier to understand what is going on and get a sample of things without having to run everything locally.
```

## 2026-10-05 — Sentiment charts and the company-site tag

```text
Let's add some improvements to the UI. What about a graph in the company list next to each row giving a quick glance of the sentiments?
In the company view also a graph in the first box, showing the sentiment distribution. All per the the timeline.

Also, when the source is the company's own website, how about we add a chip denoting that?

Grill me, and show me some options please
```

Answers to the grill: proportion bar on the index; weekly columns with the tone counts as legend on the company page; own-site mentions get the chip and are excluded from the charts, tallies, last mentioned, and the index verdict filter, but stay inline in their verdict section; detection by domain rule plus an overlay `website`; unranked in the company columns but not the index bar.

## 2026-10-05 — Export flag and refresh

```text
add the export flag, then commit. Refresh and include more screenshots
```
