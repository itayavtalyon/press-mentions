# 0007. Alerts and schedule

Date: 2026-09-30

## Status

Accepted

## Context

The assignment needs a visible daily alert. This environment should not send mail. A historical backfill is not a set of new events. Subscriptions are per company. The dashboard server can be down without stopping collection.

## Decision

Backfill is a one-time coverage process. It writes articles and verdicts and has no alert side effects. `alert_eligible` is set only on a `guid` first inserted by the daily job. A later daily run does not flip that flag on a row backfill already stored.

A mention is new for an email when all of these hold:

- Its verdict is `positive`, `negative`, `neutral`, or `unranked`.
- `alert_eligible` is set.
- `published_at` is within the last 72 hours at enqueue time. This keeps week-old items that backfill truncated, and any `guid` Google re-encodes, from alerting.
- No `notified` row exists for that email, company, and `guid`.

A daily run on a fresh clone with no backfill works the same way. It stores what the trailing window returns, and only the last 72 hours can alert.

Cron runs two commands that exit when finished, chained in one crontab line (`daily.js && mail.js`), so the mailer always follows collection. The server does not schedule them.

- `src/jobs/daily.js` collects forward and enqueues digests.
- `src/jobs/mail.js` sends the queue.

A digest is one message per subscribed email per company per run, and only when that company has at least one new mention. Order inside the message is negative, then positive, neutral, and unranked. Each item has the title, the link, and the verdict. An `unranked` item says the tone is unranked. The outbox row and the `notified` rows for its mentions are written in one alerts transaction, so a second run the same day enqueues only what is still new.

`subscriptions` is company id plus email, unique on that pair. The daily job upserts one subscription per company for `ALERT_EMAIL` before enqueueing, so a fresh clone alerts without anyone signing up. `.env.example` ships an `example.com` address. The mailer deletes the outbox row after a successful handoff. A failed handoff leaves the row.

The exercise sender writes `data/alerts/<outbox id>.txt` and logs the same body, then deletes the row. The body is `To:`, the company display name, a blank line, then items grouped negative, positive, neutral, and unranked. An unranked item includes the line `Tone: unranked`. The link is the publisher URL, or the Google URL when unwrap failed. The file is committed with the graded run as evidence that the alert fired. It does not open an SMTP connection. Production notes describe SMTP. A crash after the write and before the delete can send the same body twice. The next daily run does enqueue that email's eligible mentions from the last 72 hours, because that email has no `notified` rows yet. `published_at` must satisfy `now - 72 hours <= published_at < now`.

## Consequences

A crashed server does not stop collection. The default subscriber gets one message per company with news, so a busy day is dozens of log entries. A mention classified more than 72 hours after publication, for example after a long Ollama outage, never alerts. It still appears on the dashboard. A new subscriber still receives eligible mentions from the last 72 hours on the next daily run. A crash after a successful send and before the delete can deliver the same body twice. Keeping a sent mark would prevent that and would keep an audit row. Deletion was chosen, so the queue stays small and the audit of sent mail is the log and the file. There is no account system. Double opt-in is a v2 note, because anyone who can open the page can enter any address, and the exercise sender does not deliver it.
