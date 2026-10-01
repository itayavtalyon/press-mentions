# 0005. Three stores and the graded export

Date: 2026-09-30

## Status

Accepted

## Context

The exercise is one Node process. The design should be able to grow into separate services. Backfill must be unable to notify anyone. Evaluation must not be part of collection. The grader needs both a readable export and the full audit trail.

## Decision

Three SQLite files, owned by three modules:

| Store      | Opens it                                                 | Owns                                                            |
| ---------- | -------------------------------------------------------- | --------------------------------------------------------------- |
| Coverage   | Backfill, daily job, server (read)                       | Companies, articles, company links, verdicts, stage checkpoints |
| Alerts     | Daily job (enqueue), mailer (delete), server (subscribe) | Subscriptions and the outbound queue                            |
| Evaluation | Scoring program                                          | Scores by model, prompt, and date                               |

There is no foreign key across files. Company ids are copied by value. Modules talk through ports. A database per pipeline stage is not used.

Coverage shape:

- `companies`: id (the slug of the query name, also used for file names and URLs), display name, query name, aliases (JSON array), descriptor, query terms. Name and aliases are parsed from the seed line (ADR 0003). Descriptor and query terms come from the overlay and are null without an entry. Nothing else is enriched.
- `articles`: `guid`, title, `published_at`, publisher name, publisher homepage, publisher article URL, extracted text, `text_source`, stage, attempt count, last error, retryable flag.
- `company_articles`: company id, `guid`, origin `backfill` or `daily`, `alert_eligible`, verdict, model id, prompt version, raw response, review flag.

`articles.guid` is unique. `(company id, guid)` is unique. Raw HTML is discarded after a successful extract.

Alerts shape:

- `subscriptions`: company id, email. Unique on the pair.
- `notified`: email, company id, `guid`. Unique on all three. This is the record that a mention was alerted.
- `outbox`: id, email, company id, rendered body, created at.

After a run, `data/` receives one JSON file per company and a copy of each SQLite file. The JSON contains the company name, `last_mentioned_at` (or null), the export's `as_of` instant, and the visible mentions: title, link, date, verdict, text source. The rendered "N days ago" sentence is not exported, because it would be false by the time anyone reads it. `unrelated` and `uncertain` stay in SQLite and stay out of the JSON. The export may be partial when some companies failed. The README says so.

Copies are taken with `db.backup()`, not a file copy, because a WAL database copied mid-write is torn. Article text stays in the copy. Before the alerts copy is written, every subscription email is replaced with an `example.com` placeholder, so no real address reaches the repository. The export fails loudly if a copy exceeds GitHub's 100 MB file limit.

The server reads coverage and inserts subscriptions. It does not classify and does not enqueue.

## Consequences

Backfill cannot alert, because it is not given an alerts connection. Classifying a mention and enqueueing it are two writes in two files. The enqueue and its `notified` rows share one alerts transaction. A mention classified after a crash, or on a later run, has no `notified` row, and the next daily run picks it up, subject to the age gate in ADR 0007. Joins across stores are done in the application. The graded folder is understandable without a SQLite client, and the database copies keep the audit trail.
