# 0003. Google News RSS collection

Date: 2026-09-30

## Status

Accepted

## Context

The source needs no API key and must cover a quarter well enough for a demo on 5 Oct 2026. Measured on 30 Sep 2026, `https://news.google.com/rss/search` honors `after:` and `before:`, returns at most 100 items, and a full page is still HTTP 200. Descriptions repeat the headline. Links are Google tokens. `source` is the publisher homepage, not the article. Unwrapping one token through the article page plus `batchexecute` returned a publisher URL. Body fetches then differed: the Jerusalem Post returned article text, SpaceX returned a script shell, Axios returned 403, and Reuters returned 401.

## Decision

Discovery is the US English Google News RSS search feed (`hl=en-US`, `gl=US`, `ceid=US:en`). There is no keyed news API.

The seed file is the source of truth for which companies exist, and it is read as given: plain text, one name per line. The display name is the whole line. The query name is the text before any parenthetical. `(formerly X)` and `(formerly known as X)` add `X` as an alias. Any other parenthetical, such as `(lambda.ai)` or `(Safe Superintelligence)`, is also an alias. Names and aliases become one query, `A OR B`. Multi-word names are phrases. The feed port receives the list of terms. The Google adapter joins them with `OR`. A second request is a different adapter and is not built.

A committed overlay file covers the ordinary-word names (Harvey, Wave, Peak, Near, Ro, MST, Astra, Island, and the rest) and the aliases that are ordinary words themselves (Edge, Trellis). Each entry is keyed by the seed line and may give a one-line descriptor, extra query terms, or a replacement for the alias list. The descriptor goes into the prompt (ADR 0004). The query terms narrow the Google query, for example `"Harvey" (AI OR legal)`. The overlay never adds or removes a company. A seed line with no overlay entry uses the name rules above.

Identity is the Google `guid`. The exercise backfill covers `[start of last quarter, now)`, so there is no gap before the first daily run. It queries the window once. When that page has 100 items, it queries each week once. It then selects at most 150 candidates per company, round-robin across the week pages, and stores only those. A code comment and this ADR state that day splitting is omitted. Production, if backfill is required, keeps halving. A day that still returns 100 is the end of what this source can return.

The daily job has no watermark. Each run queries the trailing three days and dedupes on `guid`. What counts as new for an alert is defined in ADR 0007.

Text path, in order: feed reader, token unwrap, article fetch, Readability on a linkedom document, classifier. linkedom is the DOM implementation, chosen over jsdom because Readability only needs a parsed tree and linkedom is much lighter. The unwrap is batched under the `news.google.com` rate limit. The body is fetched only for articles that will be classified. A failed unwrap, a blocked fetch, or a near-empty extract classifies the title. No login and no paywall bypass. `text_source` is `body` or `title`. The dashboard links to the publisher URL when unwrap works, otherwise to the Google News URL.

Rate limiting is a token bucket with capacity 1. `news.google.com` refills one token per second. Each other host refills one token per two seconds. The exercise bucket is in memory behind `take(domain)`. Production notes describe Redis as the shared bucket when more than one worker runs. Redis is not installed for the exercise. A throttle response (429, 503, or a consent or block page) is handled as ADR 0006 describes.

Backfill and the daily job do not run at the same time, and this is enforced. Each job takes an exclusive lock file (`open` with `wx`), and a second job exits non-zero naming the holder. Every SQLite connection uses WAL and a `busy_timeout`, because the server reads while a job writes.

## Consequences

Quiet names can come back complete in one response. Busy names are a sample of at most 150, and a full week is truncated before the cap applies. The dashboard does not mark sampled companies. The README states the cap. An ordinary-word name without an overlay entry fills the 100-item page with namesakes, and its real coverage may never be returned. The overlay is hand-written and is only as good as its descriptors. A syndicated press release appears once per outlet. The unwrap depends on an unofficial Google endpoint and can break. Same-outlet stories are not separated by publisher. The README runbook must state the 100-item ceiling, the week-split stop, the title fallback, and the blocked-host behavior. A pool of egress addresses is a production note only and is not built.
