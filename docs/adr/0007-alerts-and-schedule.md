# 0007. Alerts and schedule

Date: 2026-09-30

## Status

Accepted

## Context

The assignment needs a visible daily alert. This environment should not send mail. A historical backfill is not a set of new events. Subscriptions are per company. The dashboard server can be down without stopping collection.

## Decision

Backfill is a one-time coverage process. It stores Google News candidates at stage `unwrap` and has no alert side effects. Unwrap, fetch, extract, and classify are later commands. `alert_eligible` is set by the pipeline step after classify, and only on a daily row whose verdict is `positive`, `negative`, `neutral`, or `unranked`. Backfill stays unset. A later run does not flip that flag on a row backfill already stored. `origin` stays `daily` for a row the forward feed inserted.

A mention is new for an email when all of these hold:

- Its verdict is `positive`, `negative`, `neutral`, or `unranked`.
- `alert_eligible` is set.
- `published_at` is within the last 72 hours at enqueue time. This keeps week-old items that backfill truncated, and any `guid` Google re-encodes, from alerting.
- No `notified` row exists for that email, company, and `guid`.

A forward feed on a fresh clone with no backfill works the same way. It stores what the trailing window returns, and only the last 72 hours can alert.

Cron starts one command per component. Each exits when it finishes. They are not chained on one crontab line. The server does not schedule them.

- `src/jobs/feed.js` searches each company once for `[now - 3 days, now)` and holds `<COVERAGE_DB>.feed.lock`. Backfill holds that same file. A new article is stored at stage `unwrap` with origin `daily` and `alert_eligible` left at 0. A guid that company already has is left unchanged, so a backfill row stays backfill. The feed does not set `backfilled_at`. It does not unwrap, fetch, extract, classify, mark eligible, or enqueue.
- `src/jobs/unwrap.js`, `src/jobs/fetch.js`, and `src/jobs/extract.js` are the text steps. They hold `<COVERAGE_DB>.unwrap.lock`, `<COVERAGE_DB>.fetch.lock`, and `<COVERAGE_DB>.extract.lock`. Each reads only its `stage` and does not call the next step (ADR 0003, ADR 0006). The coverage row is the queue.
- `src/jobs/classify.js` scores open links and holds `<COVERAGE_DB>.classify.lock`. Extract does not start it.
- `src/jobs/eligible.js` is the next pipeline command. It sets `alert_eligible` on daily mentions whose verdict can alert. Backfill stays unset. It holds `<COVERAGE_DB>.eligible.lock`. It does not enqueue or send.
- `src/jobs/digest.js` is the next pipeline command. It upserts `ALERT_EMAIL` and writes pending outbox rows. It does not classify, mark eligibility, or send. It holds `<ALERTS_DB>.digest.lock` and does not lock the coverage database. The mailer may run at the same time.
- `src/jobs/mail.js` is the pipeline command after digest. It logs each stored body and marks that row sent. It holds `<ALERTS_DB>.mail.lock`. It does not open the coverage database and does not enqueue.

A digest is one message per subscribed email per company per run, and only when that company has at least one new mention. Order inside the message is negative, then positive, neutral, and unranked. Each item has the title, the link, and the verdict. An `unranked` item says the tone is unranked. Each digest's outbox row and its `notified` rows are one alerts transaction. The outbox row is inserted first, then the notified rows. A throw rolls back that digest only. Digests already stored in the run stay stored, and the command exits non-zero. A conflicting mention set is already stored: the run counts it as success, writes any missing notified rows, and does not change the stored body. A second run enqueues only what is still new.

`subscriptions` is company id plus email, unique on that pair. The digest command upserts one subscription per company for `ALERT_EMAIL` before enqueueing, so a fresh clone alerts without anyone signing up. `.env.example` ships an `example.com` address. The address is stored as typed. A case-different address is the same subscription and the same outbox key.

The outbox is unique on `(email, company_id, mention_ids)`. `mention_ids` is the guids sorted by UTF-16 code unit, then `JSON.stringify`, so `["a","b"]` with no spaces. `email` ignores case. `status` is `pending` or `sent`. `sent_at` is null while pending and `toISOString` when sent. `created_at` stays `toISOString`. The mailer does not delete a row when it sends. It sets `status` to `sent` and `sent_at` to now, and that update commits before the log. If the update changes one row, it logs `mail.sent` with the stored body. If it changes zero rows, it does not log. At the start of a run it deletes outbox rows whose status is `sent` and whose `sent_at` is at or before now minus 96 hours. 96 hours is 72 hours plus one day. It compares `toISOString` text. It never deletes a pending row or a notified row. A row sent in this run has `sent_at` of now, so this cleanup does not remove it.

The body is `To:`, the company display name, a blank line, then items grouped negative, positive, neutral, and unranked. An unranked item includes the line `Tone: unranked`. The link is the publisher URL, or the Google URL when the publisher URL is null or empty. The exercise mailer logs that body and leaves the row. It does not write a file and does not open an SMTP connection. Production notes describe SMTP. A crash after the update and before the log leaves the row sent, and the next run does not log it again. That missing log line is accepted. The sent row is the evidence. `published_at` must satisfy `now - 72 hours <= published_at < now`.

## Consequences

A crashed server does not stop collection. The default subscriber gets one message per company with news, so a busy day is dozens of log entries. A mention classified more than 72 hours after publication, for example after a long Ollama outage, never alerts. It still appears on the dashboard. A new subscriber still receives eligible mentions from the last 72 hours on the next digest run. A sent outbox row stays for 96 hours after `sent_at`, which is longer than that window, so the same mention set cannot be inserted again while it could still be eligible. Notified rows are not deleted, so the mention stays marked after that sent row is gone. A crash after the update and before the log does not send the body twice: the row is already sent, and the next run does not log it. The missing log line is accepted. The sent row is the evidence. There is no alert file. There is no account system. Double opt-in is a v2 note, because anyone who can open the page can enter any address, and the exercise sender does not deliver it.
