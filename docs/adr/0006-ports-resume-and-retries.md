# 0006. Ports, resume, and retries

Date: 2026-09-30

## Status

Accepted

## Context

The feed, the token unwrap, the fetcher, the parser, the model, the rate limiter, and the mailer are the pieces a later version might replace. A long run will be stopped. One bad host must not discard the other companies.

## Decision

The orchestrator receives ports for the feed, the URL resolver, the article fetcher, the HTML extractor, the classifier, the rate limiter, and the alert sender. Each has one exercise implementation. Pure functions stay concrete. There is no dependency-injection container. JSDoc types satisfy `checkJs`. A comment on `take` says production may share the bucket through Redis across workers. Adapters that wait or jitter also take a clock and a random source in `[0, 1)`. Tests pass fakes. An entry shim may construct the system clock and `Math.random` and pass them in.

Each stage writes its result. A later run skips a stage whose result is already stored for the current inputs.

| Stage           | Skip when                                                              |
| --------------- | ---------------------------------------------------------------------- |
| Feed (backfill) | `backfilled_at` is set                                                 |
| Feed (forward)  | The `guid` is already stored for that company                          |
| Unwrap          | A publisher URL or a terminal resolve failure is stored                |
| Fetch           | A terminal fetch status is stored                                      |
| Extract         | Extracted text or a terminal empty extract is stored                   |
| Classify        | A verdict exists for this model and prompt version                     |
| Alert enqueue   | A `notified` row exists for that email, company, and `guid` (ADR 0007) |

`stage` is the next stage: `unwrap`, then `fetch`, then `extract`, then `classify`. There is no `done` value. A successful stage advances and sets `attempt_count` back to 0. Classify success writes the verdict columns and leaves `stage` at `classify`.

Unwrap, fetch, extract, and classify are separate processes. Cron starts each one. A step reads only articles whose `stage` is its own queue, writes that step's result, and does not call the next step. The coverage row is the queue. Each command holds its own lock for its whole run (ADR 0003). Backfill shares the feed lock. A different command may run at the same time.

A stage write matches `WHERE guid = ? AND stage = ?` for the stage that step owns. Zero rows means the article already moved or is gone. The step logs that and continues. It does not throw, and it does not move the row backward. The title path is that same guarded write from `unwrap`, `fetch`, or `extract` straight to `classify`.

A `batchexecute` POST that fails for the whole set leaves every article in that POST retryable. That is a non-throttle HTTP status, a body that is not a batch, or exhausted throttle backoff. It does not take the title path. One throttled POST is one exhaustion toward the stop, not one per article. The unwrap job sends that POST every 20 signed articles, then once for a shorter remainder (ADR 0003). A signature clears the streak, so those POST exhaustions do not add up across batches when article pages still sign. A parsed batch with no frame for an article, or a frame with no publisher URL, is that article's unwrap failure and takes the title path. A GET status other than 429 or 5xx still takes the title path.

The title path sets `text_source` to `title`, `extracted_text` to the title, `stage` to `classify`, and `attempt_count` to 0. It is taken when unwrap fails, when the publisher returns any status other than 429 or 5xx (including 400, 401, 403, and 404), when the fetcher refuses the URL, or when a 200 leaves Readability text empty after trim. That empty extract is the script shell. There is no character threshold. The fetcher checks the URL it was given, not redirects and not DNS. It requests only `http` and `https`, and it refuses `localhost`, a name ending in `.localhost`, and an IP literal in loopback (`127.0.0.0/8`, `::1`, `0.0.0.0/8`), link-local (`169.254.0.0/16`, `fe80::/10`), or private (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7`) space, including the IPv4-mapped form of those addresses. Ollama is not this fetcher. Publisher 429 and 5xx use the HTTP backoff below.

One run that exhausts HTTP backoff increments `attempt_count` by 1 and stays on the current stage, with `retryable` 1 and `last_error` set. The third such run sets `retryable` to 0, keeps `last_error`, and leaves `stage` where it failed. Later runs skip that row. A person puts it back by setting `retryable` to 1. Advancing a stage is what resets the counter. The in-run stop below is a different counter and does not increment `attempt_count` by itself.

The in-memory bucket belongs to one process and resets when that process exits. Two commands that both call Google can together exceed one request per second (ADR 0003). There is no shared slot file.

Each adapter reacts to its own failures. It does not share one policy across all of them:

- Google (feed and unwrap): a 429, any 5xx, or a consent or block page means the source is throttling. The adapter honors `Retry-After` when present. Otherwise it waits with exponential backoff and jitter, and every later request to that host waits too, because the throttle is host-wide.
- Ollama: connection refused, timeout, or 5xx backs off exponentially with jitter, then retries the same article. Each chat call has a 5 minute budget, generous for a cold model load, so a stuck model ends as a timeout. Classify uses the same `RETRY_POLICY` and `backoffMs` as HTTP and does not wait after the last attempt. A malformed reply is not an Ollama failure. It is `uncertain` (ADR 0004).
- Publisher hosts: 429 or any 5xx backs off on that host only. 400, 401, 403, 404, or an empty extract takes the title path at once.

Backoff limits are named constants: 5 attempts, a 2 second base, a 5 minute maximum, and a 30 second request timeout. Jitter waits for half to all of `base * 2^attempt`, capped at 5 minutes. `Retry-After` may be seconds or an HTTP date. A wait above 5 minutes stops the item for this run instead of sleeping. When an item exhausts the attempts, it stays retryable for the next run, subject to `attempt_count` above. Three consecutive exhaustions against the same dependency stop that command for the rest of its run. Google stops the feed command, or the unwrap command, that saw the errors, and does not stop the other one. Ollama stops classification. A publisher host stops fetches to that host only. A success resets the count. The skipped items stay retryable. Other commands keep running. The stopped command exits non-zero and names the dependency. `attempt_count` is the per-stage count described above. A failing company is logged and the run continues. `uncertain` is a finished verdict and is not retried.

- Retryable: timeout, 429, 503, a failed `batchexecute` POST, Ollama unreachable, after the in-run backoff is exhausted. The row stays queued.
- Terminal: a failure that will not change on its own, such as HTTP 400 or 404 after the title path was taken, or a third failed run. The error is logged and the row leaves the queue. A person can put it back.

A run with any retryable leftovers exits non-zero and prints the counts per stage, so cron and a person both see it.

"Ignore" means skip it for the rest of this process. It does not delete the article.

## Consequences

Swapping Google News or the log mailer is a new module. A crash resumes from the last finished stage. Changing the parser refetches. Changing the model or the prompt reclassifies stored text. Transient outages retry unattended. A wrongly terminal error waits for a person. Entry points stay thin so tests can call the same functions. See ADR 0009.
