# Build plan

About 19.5 hours, over the original 14 by choice (review of 2026-09-30). The order follows dependencies. The model and prompt constants must be frozen before the long backfill classifies anything. Eval needs real articles, so collection comes before eval. The backfill runs overnight, so it starts before the dashboard is built. The design in `docs/ARCHITECTURE.md` and the ADRs stays whole even if a later task slips. A slip is recorded in the README, not by deleting the decision.

Tests are written with each task. The last test row closes the gap to 100%.

| When    | Hours | Task                                                                                                                       | Done when                                                                                                                         |
| ------- | ----- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Sep 30  | 1.5   | Coverage schema, seed parse, overlay load, three SQLite files, WAL, lock file                                              | All 12 parenthetical seed lines parse to aliases. An overlay entry cannot add a company. A second job exits non-zero on the lock  |
| Oct 1   | 1.5   | RSS client, `OR` query with overlay terms, backfill window, week split, 150 cap round-robin, `guid` dedupe, Google backoff | A fixture feed lands rows. A 100-item page issues week queries and keeps 150. A 429 with `Retry-After` waits                      |
| Oct 1   | 2     | Add linkedom and `@mozilla/readability`. Unwrap, fetch, Readability, token bucket, title fallback, publisher backoff       | A publisher URL is stored. A 401 or empty extract sets `text_source=title` without retry                                          |
| Oct 1   | 1     | Overlay descriptors and query terms for about 30 ordinary-word names and the Edge and Trellis aliases                      | Every name on the ambiguous list has an entry or a written reason for none                                                        |
| Oct 2   | 2     | Classifier: schema `format`, `think: false`, `num_ctx` and text cap, `uncertain`, stage resume, Ollama backoff             | One scripted reply writes per-company verdicts. A second run does not call the classifier again                                   |
| Oct 2   | 1.5   | Labeled set: collect a small real sample, label about 40, with a hit and a miss for several ordinary-word names            | The set file is committed, and its composition is written down                                                                    |
| Oct 2   | 1     | Eval program. Score every installed chat model and every saved prompt, record seconds per case, leave the constants        | Scores print with a winner or a tie. A person sets `LIVE_MODEL` and `LIVE_PROMPT_VERSION` by hand                                 |
| Oct 2–3 | —     | **Start the real backfill.** It resumes if stopped. Latest start: Oct 3 morning                                            | Coverage rows accumulate under the frozen model and prompt                                                                        |
| Oct 3   | 2     | Daily job: trailing window, eligibility, 72-hour gate, `notified`, `ALERT_EMAIL` upsert, digest enqueue                    | Backfill leaves the alerts file untouched. A second run the same day enqueues only mentions still missing a `notified` row        |
| Oct 3   | 0.5   | Mailer                                                                                                                     | The body is in the log and `data/alerts/`, and the outbox row is gone. A thrown sender leaves the row                             |
| Oct 3   | 2.5   | Index, company page, windows, filters, subscribe dialog, `/review`, escaping                                               | Last quarter is the default. "No coverage found" sorts last. A posted email is a unique subscription. `/review` shows raw replies |
| Oct 4   | 1     | Export: `db.backup()`, email scrub, size check, `last_mentioned_at` and `as_of`                                            | JSON and SQLite copies exist from a faked run                                                                                     |
| Oct 4   | 1.5   | Promise tests to 100%, then one real daily run after the backfill, then the real export                                    | The gate passes. `data/` holds the real run and an alert file                                                                     |
| Oct 4   | 1.5   | README runbook: setup, Ollama pull, commands, model and why, prompt shape, eval tally, source limits, cap, assumptions     | A stranger could run it from the README alone. `PROMPTS.md` is current                                                            |
| Oct 5   | —     | Buffer until 16:00 Israel time                                                                                             | Submitted                                                                                                                         |

Cut order if time runs out, recorded in the README: custom date range, then `/review`, then the subscribe dialog (the `ALERT_EMAIL` subscriber still alerts).

Suggested commands, for the README runbook:

```bash
node --env-file=.env src/jobs/backfill.js
node --env-file=.env src/jobs/daily.js
node --env-file=.env src/jobs/mail.js
node --env-file=.env src/jobs/eval.js
node --env-file=.env src/server/index.js
```

Cron runs `daily.js && mail.js` as one line.
