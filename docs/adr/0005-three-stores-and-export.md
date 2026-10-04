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
| Coverage   | Backfill, forward feed, text steps, server (read)        | Companies, articles, company links, verdicts, stage checkpoints |
| Alerts     | Digest (enqueue), mailer (mark sent), server (subscribe) | Subscriptions, notified rows, and the outbox                    |
| Evaluation | Scoring program                                          | Cases, and scores by model, prompt, and date                    |

There is no foreign key across files. Company ids are copied by value. Modules talk through ports. A database per pipeline stage is not used.

Coverage shape:

- `companies`: id (the slug of the query name, also used for file names and URLs), display name, query name, aliases (JSON array), descriptor, query terms (JSON array), `backfilled_at`. Name and aliases are parsed from the seed line (ADR 0003). Descriptor and query terms come from the overlay. Descriptor is null without an entry. Query terms are `[]` without an entry. Nothing else is enriched.
- `articles`: `guid`, title, `published_at`, publisher name, publisher homepage, publisher article URL, Google URL, extracted text, `text_source`, stage, attempt count, last error, retryable flag. `stage` is `unwrap`, `fetch`, `extract`, or `classify` (ADR 0006). Timestamps are ISO UTC text. `published_at` has a CHECK for the exact `toISOString` shape, so the dashboard compares it as text.
- `company_articles`: company id, `guid`, origin `backfill` or `daily`, `alert_eligible`, verdict, model id, prompt version, raw response, review flag.

`articles.guid` is unique. `(company id, guid)` is unique. Raw HTML is discarded after a successful extract.

Alerts shape:

- `subscriptions`: company id, email. Unique on the pair, ignoring ASCII case (`COLLATE NOCASE`). The address is stored as typed.
- `notified`: email, company id, `guid`. Unique on all three. This is the record that a mention was alerted.
- `outbox`: id, email, company id, rendered body, created at, status (`pending` or `sent`), `mention_ids`, `sent_at`. Email ignores case. The row is unique on email, company id, and `mention_ids`. `mention_ids` is the guids sorted by UTF-16 code unit and then `JSON.stringify`. `sent_at` is null while pending and an ISO timestamp when sent. A sent row stays until `sent_at` is 96 hours old. The mailer does not delete a row when it sends. Notified rows are not deleted.

`npm run job:export` writes the graded folder into `data/`. It reads the stores and never changes them.

- `data/companies/<id>.json`, one file per company: `name`, `last_mentioned_at` (or null), `as_of`, and `mentions`. Each mention is `title`, `link` (the publisher URL, or the Google URL when unwrap failed), `publisher`, `published_at`, `verdict`, and `text_source`. `mentions` are the visible rows in the previous complete UTC quarter at `as_of`. `last_mentioned_at` ignores that window. `unrelated` and `uncertain` stay in SQLite and stay out of the JSON.
- `data/summary.json`: `as_of`, the quarter, and per company `last_mentioned_at`, `days_since_last_mention` (whole days at `as_of`, or null for no coverage), and the quarter's counts per verdict. The rendered "N days ago" sentence is not exported, because it would be false by the time anyone reads it. The number is pinned to `as_of`.
- `data/alerts.json`: every outbox row without its address: company, created and sent times, status, and body.
- `data/sqlite/`: a copy of each store taken with `VACUUM INTO`, which reads in one transaction, so a WAL store mid-write is not torn, and drops free pages. Article text and raw replies stay in the copy. In the alerts copy every email is replaced with `redacted@example.com`, so no real address reaches the repository. A copy over 100 MB (GitHub's file limit) throws and is deleted.

The live stores in `data/*.sqlite` are gitignored.

Amended 2026-10-04: the first draft committed `db.backup()` copies of the live files. The live coverage file grew to 1.1 GB of free pages after raw HTML was discarded, so the copy is compacted, and the summary and alerts files were added for a reviewer without a SQLite client.

The server reads coverage and inserts subscriptions. It does not classify and does not enqueue.

## Consequences

Backfill cannot alert, because it is not given an alerts connection. Classifying a mention and enqueueing it are two writes in two files. Each digest's outbox row and its `notified` rows share one alerts transaction. A failed digest does not roll back the others. A mention classified after a crash, or on a later run, has no `notified` row, and the next daily run picks it up, subject to the age gate in ADR 0007. Joins across stores are done in the application. The graded folder is understandable without a SQLite client, and the database copies keep the audit trail.
