# Architecture

Press mentions for the OurCrowd seed list are collected from Google News RSS, judged by a local Ollama model, and shown on a small server-rendered dashboard. A one-time backfill fills the coverage store and does not notify anyone. Cron starts the pipeline as separate commands: the forward feed, unwrap, fetch, extract, classify, eligible, digest, and mail. Three SQLite files keep coverage, alerts, and prompt scores apart so the exercise process can later split along those lines. The live model and prompt are constants chosen offline. The main README is the runbook and the production/v2 narrative. This document is how the pieces move.

## Context

```mermaid
flowchart LR
  reviewer[Reviewer]
  cron[Cron]
  operator[Operator]
  server[Dashboard server]
  feed[Forward feed]
  unwrap[Unwrap]
  fetch[Fetch]
  extract[Extract]
  classify[Classify]
  eligible[Mark eligible]
  digest[Digest enqueue]
  mailer[Mailer]
  backfill[Backfill once]
  eval[Eval program]
  google[Google News RSS]
  publishers[Publisher sites]
  ollama[Ollama]
  coverage[(Coverage SQLite)]
  alerts[(Alerts SQLite)]
  evaluation[(Evaluation SQLite)]

  reviewer --> server
  cron --> feed
  cron --> unwrap
  cron --> fetch
  cron --> extract
  cron --> classify
  cron --> eligible
  cron --> digest
  cron --> mailer
  operator --> backfill
  operator --> eval
  server --> coverage
  server --> alerts
  feed --> google
  feed --> coverage
  unwrap --> coverage
  fetch --> publishers
  fetch --> coverage
  extract --> coverage
  digest --> coverage
  digest --> alerts
  classify --> ollama
  classify --> coverage
  eligible --> coverage
  backfill --> google
  backfill --> coverage
  mailer --> alerts
  eval --> ollama
  eval --> evaluation
```

The exercise mailer logs the stored body and marks the outbox row sent. It does not write a file. Production notes in the README describe SMTP. Redis is described there as the shared rate-limit bucket and is not installed.

## Components

```mermaid
flowchart TB
  subgraph coverageMod [Coverage module]
    feed[Feed port]
    resolver[URL resolver port]
    fetcher[Article fetcher port]
    extractor[HTML extractor port]
    classifier[Classifier port]
    bucket[Token bucket]
    coverageDb[(Coverage store)]
  end
  subgraph alertsMod [Alerts module]
    subs[Subscriptions]
    queue[Digest queue]
    mailLog[Mailer log]
  end
  subgraph evalMod [Evaluation module]
    scorer[Offline scorer]
    evalDb[(Evaluation store)]
  end
  dashboard[Server-rendered pages]
  feed --> coverageDb
  resolver --> bucket
  fetcher --> bucket
  extractor --> coverageDb
  classifier --> coverageDb
  dashboard --> coverageDb
  dashboard --> subs
  queue --> mailLog
  scorer --> evalDb
```

Exercise implementations are the Google News RSS adapter, the `batchexecute` unwrap, an HTTP fetcher, Mozilla Readability on linkedom, the Ollama client, an in-memory bucket, and a mailer that logs the stored body. The orchestrator takes these as arguments. Pure functions, including day counts and the bucket math, are not behind a port. An adapter that waits or jitters also takes a clock and a random source in `[0, 1)`.

## Pipeline

```mermaid
sequenceDiagram
  participant Cron
  participant Feed as Forward feed
  participant Unwrap
  participant Fetch
  participant Extract
  participant Classify
  participant Eligible as Mark eligible
  participant Digest as Digest enqueue
  participant Mail as Mailer
  participant DB as Coverage store
  participant Alerts as Alerts store

  Cron->>Feed: Start
  Feed->>DB: Insert new daily articles at stage unwrap
  Note over Feed,DB: alert_eligible stays 0. A stored guid is unchanged. Feed holds the feed lock. Unwrap holds its own lock.
  Cron->>Unwrap: Start later
  Unwrap->>DB: Read stage unwrap only, write the publisher URL, stage becomes fetch
  Cron->>Fetch: Start later
  Fetch->>DB: Read stage fetch only, write the page, stage becomes extract
  Cron->>Extract: Start later
  Extract->>DB: Read stage extract only, write text, stage becomes classify
  Cron->>Classify: Start later
  Classify->>DB: Read open links at stage classify, write verdicts, stage stays classify
  Cron->>Eligible: Start later
  Eligible->>DB: Set alert_eligible on daily mentions that can alert
  Cron->>Digest: Start later
  Digest->>Alerts: Upsert ALERT_EMAIL subscriptions
  Digest->>DB: Eligible mentions published in the last 72 hours
  Digest->>Alerts: One transaction per digest, pending outbox row, then notified rows
  Cron->>Mail: Start later
  Mail->>Alerts: Mark each still-pending row sent
  Mail->>Mail: Log the stored body after that update commits
  Note over Cron,Alerts: A step does not call the next step. A second copy of that same command exits without opening its store.
```

The backfill window is last quarter through now. The forward feed window is the trailing three days, `[now - 3 days, now)`. It inserts a new article at stage `unwrap` with origin `daily` and leaves `alert_eligible` unset. A guid already stored for that company is not changed, and the feed does not set `backfilled_at`. Unwrap, fetch, extract, classify, eligible, digest, and mail are separate cron commands. A text step reads only the articles whose `stage` is its queue. The coverage row is the queue. A write matches that stage. A row that has already moved is logged and left where it is. If volume demands it, replace that cron polling with a message queue such as Kafka. Classification is `npm run job:classify`, and extract does not start it. Eligible marks daily mentions after classify and does not advance `stage`. Backfill stays ineligible. Digest and mail follow eligible. They do not advance `stage`, and none of these commands starts the next one. Each adapter handles its own failures (ADR 0006): Google and publisher throttles back off, honoring `Retry-After`. Ollama failures back off. Any publisher status other than 429 or 5xx, a refused URL, and an empty extract take the title path at once. A throw from Readability records `last_error`, leaves the row at `extract`, and the run continues. When backoff is exhausted, the item stays retryable and the run exits non-zero. A third failed run makes the item terminal. `uncertain` is not retried.

## Digest

```mermaid
sequenceDiagram
  participant Cron
  participant Digest as Digest enqueue
  participant Coverage as Coverage store
  participant Alerts as Alerts store
  participant Mail as Mailer

  Cron->>Digest: Start and exit when done
  Digest->>Alerts: Upsert ALERT_EMAIL subscriptions
  Digest->>Coverage: Eligible mentions published in the last 72h
  Digest->>Alerts: Drop those with a notified row
  Digest->>Alerts: One transaction per digest, pending outbox row, then notified rows
  Note over Digest,Alerts: Backfill rows are not eligible. A conflict keeps the stored body and still fills notified rows.
  Cron->>Mail: Its own crontab line
  Mail->>Alerts: Delete sent rows whose sent_at is at least 96 hours ago
  Mail->>Alerts: Set status sent and sent_at where the row is still pending
  Mail->>Mail: Log the stored body after that update commits
  Note over Mail,Alerts: The row stays. There is no alert file. A crash after the update and before the log does not log it again.
```

Digest order is negative, positive, neutral, then `unranked`. No row is written when the company has no new eligible mention.

## Coverage store

```mermaid
erDiagram
  companies ||--o{ company_articles : has
  articles ||--o{ company_articles : appears_in
  companies {
    text id
    text display_name
    text query_name
    text aliases
    text descriptor
    text query_terms
    text backfilled_at
  }
  articles {
    text guid
    text title
    text published_at
    text publisher_name
    text publisher_homepage
    text publisher_url
    text google_url
    text extracted_text
    text text_source
    text stage
    int attempt_count
    text last_error
    int retryable
  }
  company_articles {
    text company_id
    text guid
    text origin
    int alert_eligible
    text verdict
    text model_id
    text prompt_version
    text raw_response
    int review_flag
  }
```

`origin` is `backfill` or `daily`. `verdict` is `positive`, `negative`, `neutral`, `unranked`, `unrelated`, or `uncertain`.

## Alerts store

```mermaid
erDiagram
  subscriptions ||--o{ outbox : receives
  subscriptions ||--o{ notified : recorded
  subscriptions {
    text company_id
    text email
  }
  notified {
    text email
    text company_id
    text guid
  }
  outbox {
    int id
    text email
    text company_id
    text body
    text created_at
    text status
    text mention_ids
    text sent_at
  }
```

`subscriptions` is unique on company and email, ignoring case. The address is stored as typed. `notified` is unique on email, company, and `guid`, and is written in the same transaction as the outbox row it belongs to. A failed digest rolls back only that transaction. `outbox` is unique on email, company, and `mention_ids`, ignoring email case. `status` is `pending` or `sent`. `sent_at` is null while pending and an ISO timestamp when sent. A sent row stays for 96 hours after `sent_at`. Notified rows are not deleted.

## Evaluation store

```mermaid
erDiagram
  cases {
    text id
    int position
    text parameters_json
    text expected_json
  }
  scores {
    text model_id
    text prompt_id
    int score
    int relatedness_correct
    float seconds_per_case
    text scored_at
  }
```

`cases` is the only labeled set. The program does not seed it. An empty table fails the eval run. `parameters_json` is the prompt input. `expected_json` is the gold verdict by company name. `scores` is unique on model, prompt, and `scored_at`. The query is in `src/jobs/prompt-eval/store.js`.

## Flow into data/

```mermaid
flowchart LR
  coverage[(Coverage SQLite)]
  alerts[(Alerts SQLite)]
  evaluation[(Evaluation SQLite)]
  json[data/companies/id.json]
  covCopy[data/coverage.sqlite]
  alertsCopy[data/alerts.sqlite]
  evalCopy[data/evaluation.sqlite]
  coverage --> json
  coverage --> covCopy
  alerts -->|emails replaced| alertsCopy
  evaluation --> evalCopy
```

Each JSON file has `name`, `last_mentioned_at` (the newest visible `published_at` across all stored data, or null), `as_of`, and `mentions`. The mention list is the visible mentions whose `published_at` falls in the previous complete UTC quarter at `as_of`. Each mention has `title`, `link`, `published_at`, `verdict`, and `text_source`. The "N days ago" sentence is rendered by the page, never stored. Hidden verdicts remain in `data/coverage.sqlite`. Copies use `db.backup()`. A company that failed has no file. The command still writes the rest, then exits non-zero. A file over 100 MB throws and is not written. Before the alerts copy, every email column becomes `redacted@example.com`.

## Runtime and configuration

One OS process per command. Publishers on different hosts may proceed together. `news.google.com` and each publisher host take one token at a time. Defaults are one token per second for Google and one token per two seconds for anyone else, from environment variables so a polite run can go slower.

| Variable             | Role                                                                                |
| -------------------- | ----------------------------------------------------------------------------------- |
| `COVERAGE_DB`        | Coverage SQLite path                                                                |
| `ALERTS_DB`          | Alerts SQLite path, default `data/alerts.sqlite`                                    |
| `EVAL_DB`            | Evaluation SQLite path                                                              |
| `OLLAMA_HOST`        | Default `http://127.0.0.1:11434`                                                    |
| `PORT`               | Dashboard port                                                                      |
| `GOOGLE_TOKEN_MS`    | Refill interval for Google, default 1000                                            |
| `PUBLISHER_TOKEN_MS` | Refill interval for other hosts, default 2000                                       |
| `ALERT_EMAIL`        | Default subscriber for every company; `.env.example` ships an `example.com` address |

The live model and prompt version are `LIVE_MODEL` (`qwen3.5:9b`) and `LIVE_PROMPT_VERSION` (`v001`) in `src/core/classifier.js`. A person edits them by hand after eval. They are not environment variables, and the eval job does not read them. The backfill cap of 150, the 72-hour alert age gate, and the backoff limits are constants too. HTTP backoff is 5 attempts, a 2 second base, a 5 minute cap, a 30 second timeout, and jitter from half to all of the exponential delay. The seed is the provided plain-text file, one name per line. Parentheticals become aliases. The overlay file adds descriptors and query terms (ADR 0003). Each command has its own lock file, `<database>.<command>.lock`. Backfill and the forward feed share `feed` on the coverage database. Unwrap, fetch, extract, classify, and eligible lock the coverage database under their own names. Digest and mail lock the alerts database under their own names. A different command may run at the same time. Each process has its own in-memory token bucket, so overlap can double the Google rate. The job writes its pid into a claim file and links that onto its lock, so the file is never empty. A second copy of that command exits without opening its store while that pid is running. A pid that is not running is stale: the next start renames the file aside and takes the lock. Two recovering starts cannot delete each other's lock. The loser exits naming the holder. The file is deleted when the job finishes. Every connection uses WAL, `busy_timeout` 5000, and foreign keys. Schema changes are applied by deleting the file. There are no migrations.

Logging is structured enough to grep: company, `guid`, stage, and error. A 100-item feed is logged as truncated. Parse failures log the raw model text.

## Exercise and production

| Topic              | Exercise                                                | Production note                                     |
| ------------------ | ------------------------------------------------------- | --------------------------------------------------- |
| Backfill depth     | Quarter, then weeks, at most 150 per company            | Keep halving, no cap. A full day is the RSS ceiling |
| Rate limit         | In-memory token bucket                                  | Redis key shared by workers                         |
| Mail               | Log the stored body and leave the row sent for 96 hours | SMTP                                                |
| Signup             | Dialog on the company page, no confirmation             | Confirm the address before SMTP                     |
| Egress             | One IP                                                  | A pool of addresses, not specified here             |
| Historical quarter | One backfill so `data/` is populated                    | Empty until a quarter of forward collection exists  |

## Where a decision lives

| Kind                                                    | Place                               |
| ------------------------------------------------------- | ----------------------------------- |
| One choice and the alternatives                         | `docs/adr/`                         |
| How the run fits together                               | This file                           |
| Types, errors, and which file owns a job                | `docs/CODING-STANDARD.md`           |
| Setup, commands, model, prompt, limits, production, v2  | Main README, written as the runbook |
| What to build first                                     | `docs/BUILD-PLAN.md`                |
| Dashboard pages, states, copy, styling, and page script | `docs/ui-design.md`                 |

## ADR index

| ADR                                           | Title                              |
| --------------------------------------------- | ---------------------------------- |
| [0001](adr/0001-utc-quarter-windows.md)       | UTC quarter windows                |
| [0002](adr/0002-verdicts-and-fail-closed.md)  | Verdicts and fail closed           |
| [0003](adr/0003-google-news-rss.md)           | Google News RSS collection         |
| [0004](adr/0004-local-classification.md)      | Local classification               |
| [0005](adr/0005-three-stores-and-export.md)   | Three stores and the graded export |
| [0006](adr/0006-ports-resume-and-retries.md)  | Ports, resume, and retries         |
| [0007](adr/0007-alerts-and-schedule.md)       | Alerts and schedule                |
| [0008](adr/0008-server-rendered-dashboard.md) | Server-rendered dashboard          |
| [0009](adr/0009-tests-without-network.md)     | Tests without network              |

## Open questions and risks

- The 2026-10-01 run picked `qwen3.5:9b` and `v001`. Collection uses those constants. Eval does not change them.
- The backfill command only stores Google News candidates at stage `unwrap`. It does not unwrap, fetch, extract, or classify. At one request a second, 258 companies take a few minutes when the first page is short, and about an hour if every company needs the week queries. Classification is `npm run job:classify`. It scores open links and leaves the stage at `classify`. With the cap, about 6k candidates at roughly 5 s each is one night. Start the RSS backfill no later than Oct 3.
- Every candidate is one Google GET. A POST carries at most 20 articles that returned a signature. At about 8k+ candidates, that is still hours of Google traffic from one IP, and a block is plausible. A block backs off and leaves rows retryable. It does not bypass anything.
- `batchexecute` is unofficial. When the POST fails, those rows stay retryable (ADR 0006). A parsed batch that lacks an article takes the title path. The README should say the unwrap failed.
- A week that returns 100 items is silently incomplete, and the cap samples it further. The dashboard does not mark sampled companies. The README does.
- Many business pages return 401, 403, or a script shell. A shell is a 200 whose Readability text is empty after trim. Those mentions are title judgments, and `text_source` shows it. The fetcher allows only public `http` and `https` URLs (ADR 0006).
- The overlay must be final before the real backfill. A company already backfilled keeps its candidates when its query changes later. Clearing `backfilled_at` makes the next run search again and add links. It does not remove links already stored. A smoke run on 1 Oct 2026 stored 150 "edge" items for Ludeo before the overlay existed. Delete those links before searching that company again. Ludeo's overlay entry now drops the Edge alias.
- Measured on 1 Oct 2026 with the overlay terms: Bites, Kini, Peak, MST, Silo, Launchpad, and Rewire return few or no stories about the company, and Orchard is still mostly other uses of the word. Those may be quiet companies or a recall loss from the terms. The README should list them.
- The overlay decides precision for about 30 ordinary-word names. A wrong or missing descriptor is a silent precision loss. The labeled set should include one hit and one miss for several of those names, not only Harvey.
- A crash after the outbox update and before the log leaves the row sent. The next mail run does not log that body again. The sent row is the evidence. The same mention set cannot be inserted again while that row remains, and notified rows are not deleted, so the mention stays marked after the sent row is removed at 96 hours.
- A mention classified more than 72 hours after publication never alerts.
- Article text is committed in `data/coverage.sqlite`. Size is the only check.
- The subscribe form accepts a trimmed address with one `@`, no spaces, a dot in the domain, and length at most 254. Comparison is case-insensitive. The exercise sender does not deliver mail. SMTP without a confirmation step would. A new subscriber receives the last 72 hours on the next digest run (ADR 0007).
- The coverage gate is 100%. Error branches have to be driven through fakes, or the gate becomes a pile of empty assertions. The promise list in ADR 0009 is the review checklist. Entry-point shims are excluded by name, so they must stay free of logic (ADR 0009).
- Three consecutive exhaustions stop the dependent stage (ADR 0006), so a lasting block costs at most three full backoffs. The per-attempt limits are the constants in the runtime section.
- The seed has 258 names. Twelve carry a parenthetical: ten `(formerly X)` or `(formerly known as X)`, plus `Lambda (lambda.ai)` and `SSI (Safe Superintelligence)`. All twelve become aliases. The overlay replaces the ones that are ordinary words (Edge, Trellis).
