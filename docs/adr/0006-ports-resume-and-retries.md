# 0006. Ports, resume, and retries

Date: 2026-09-30

## Status

Accepted

## Context

The feed, the token unwrap, the fetcher, the parser, the model, the rate limiter, and the mailer are the pieces a later version might replace. A long run will be stopped. One bad host must not discard the other companies.

## Decision

The orchestrator receives ports for the feed, the URL resolver, the article fetcher, the HTML extractor, the classifier, the rate limiter, and the alert sender. Each has one exercise implementation. Pure functions stay concrete. There is no dependency-injection container. JSDoc types satisfy `checkJs`. A comment on `take` says production may share the bucket through Redis across workers.

Each stage writes its result. A later run skips a stage whose result is already stored for the current inputs.

| Stage         | Skip when                                                              |
| ------------- | ---------------------------------------------------------------------- |
| Feed          | The `guid` is already stored for that company                          |
| Unwrap        | A publisher URL or a terminal resolve failure is stored                |
| Fetch         | A terminal fetch status is stored                                      |
| Extract       | Extracted text or a terminal empty extract is stored                   |
| Classify      | A verdict exists for this model and prompt version                     |
| Alert enqueue | A `notified` row exists for that email, company, and `guid` (ADR 0007) |

The in-memory bucket resets when the process exits.

Each adapter reacts to its own failures. It does not share one policy across all of them:

- Google (feed and unwrap): a 429, 503, or consent or block page means the source is throttling. The adapter honors `Retry-After` when present. Otherwise it waits with exponential backoff and jitter, and every later request to that host waits too, because the throttle is host-wide.
- Ollama: connection refused, timeout, or 5xx backs off exponentially with jitter, then retries the same article. A malformed reply is not an Ollama failure. It is `uncertain` (ADR 0004).
- Publisher hosts: 429 or 503 backs off on that host only. 401, 403, 404, a script shell, or an empty extract is terminal for the body and takes the title path at once.

Backoff limits (attempts and the maximum delay) are named constants. When an item exhausts them, it stays retryable for the next run. Three consecutive exhaustions against the same dependency stop the work that depends on it for the rest of the run: Google stops the feed and unwrap stages, Ollama stops classification, and a publisher host stops fetches to that host only. A success resets the count. The skipped items stay retryable, the other stages finish what they already have, and the run exits non-zero naming the stopped dependency. `attempt_count` spans runs, and after three runs the item becomes terminal with `last_error` kept. A failing company is logged and the run continues. `uncertain` is a finished verdict and is not retried.

- Retryable: timeout, 429, 503, Ollama unreachable, after the in-run backoff is exhausted. The row stays queued.
- Terminal: a failure that will not change on its own, such as HTTP 400 or 404 after the title path was taken, or a third failed run. The error is logged and the row leaves the queue. A person can put it back.

A run with any retryable leftovers exits non-zero and prints the counts per stage, so cron and a person both see it.

"Ignore" means skip it for the rest of this process. It does not delete the article.

## Consequences

Swapping Google News or the log mailer is a new module. A crash resumes from the last finished stage. Changing the parser refetches. Changing the model or the prompt reclassifies stored text. Transient outages retry unattended. A wrongly terminal error waits for a person. Entry points stay thin so tests can call the same functions. See ADR 0009.
