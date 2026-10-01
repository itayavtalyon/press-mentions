# 0003. Google News RSS collection

Date: 2026-09-30

## Status

Accepted

## Context

The source needs no API key and must cover a quarter well enough for a demo on 5 Oct 2026. Measured on 30 Sep 2026, `https://news.google.com/rss/search` honors `after:` and `before:`, returns at most 100 items, and a full page is still HTTP 200. Descriptions repeat the headline. Links are Google tokens. `source` is the publisher homepage, not the article. Unwrapping one token through the article page plus `batchexecute` returned a publisher URL. Body fetches then differed: the Jerusalem Post returned article text, SpaceX returned a script shell, Axios returned 403, and Reuters returned 401. Measured on 1 Oct 2026: `after:2026-06-30` returned an item dated 2026-06-30 07:00 UTC, so Google's day boundaries are not UTC. `"Ludeo" OR "Edge"` filled all 100 items with other uses of "edge" and none mentioned Ludeo, while `"Ludeo"` alone returned the two real stories.

## Decision

Discovery is the US English Google News RSS search feed (`hl=en-US`, `gl=US`, `ceid=US:en`). There is no keyed news API.

The seed file is the source of truth for which companies exist, and it is read as given: plain text, one name per line. The display name is the whole line. The query name is the text before any parenthetical. `(formerly X)` and `(formerly known as X)` add `X` as an alias. Any other parenthetical, such as `(lambda.ai)` or `(Safe Superintelligence)`, is also an alias. Names and aliases become one query, `"A" OR "B"`. Every name and term is quoted, so single words are not stemmed. The date operators are widened by a day on each side and the result is filtered on `pubDate` against the UTC window. Core builds the `q` string. The adapter requests that string. A second news source is a different adapter and is not built.

The string is the names group, then the overlay-terms group when the company has query terms, then `after:` and `before:`. A group of one term is `"term"`. A group of several is `("a" OR "b")`. Groups are separated by spaces, which is AND. A term that contains `"` throws. `after` is the UTC day before the window start. `before` is the UTC day after the window end. Callers then drop items whose `pubDate` is outside the UTC window.

A week is seven times 86,400,000 milliseconds, measured from the window start. The last slice ends at the window end and may be short. Slices are oldest first. This is not a calendar week. Day splitting is omitted.

Round-robin takes index 0 of every slice, then index 1, and so on. A `guid` already taken is skipped. It stops at 150.

The company id is the query name in lowercase, with every run of characters other than ASCII letters and digits replaced by one `-`, and dashes trimmed from the ends. An empty id throws. Two seed lines that share an id throw. A seed line is `Name` or `Name (alias)` with the parenthetical at the end. `formerly ` and `formerly known as ` are stripped from the alias. Anything else throws.

The first stored `guid` keeps its title, date, and publisher fields. A later company adds a link and does not change the article row.

A committed overlay file covers the ordinary-word names (Harvey, Wave, Peak, Near, Ro, MST, Astra, Island, and the rest) and the aliases that are ordinary words themselves (Edge, Trellis). Each entry is keyed by the seed line and may give a one-line descriptor, extra query terms, or a replacement for the alias list. The descriptor goes into the prompt (ADR 0004). The query terms narrow the Google query, for example `"Harvey" (AI OR legal)`. The overlay never adds or removes a company. Each descriptor condenses the company's OurCrowd page (`ourcrowd.com/companies/<slug>`) or, for Lambda, Wave, and Overtime, the company's own site. Query terms use words from the same sources, and were kept only when a measured quarter query on 1 Oct 2026 returned mostly the company or cut the noise. Stripe, Glean, Kando, Ludeo, Privateer, and Neura did not need terms. A seed line with no overlay entry uses the name rules above.

Identity is the Google `guid`. The exercise backfill covers `[start of last quarter, now)`, so there is no gap before the first forward feed. It queries the window once. When that page has 100 items, it queries each week once. It then selects at most 150 candidates per company, round-robin across the week pages, and stores only those. A code comment and this ADR state that day splitting is omitted. Production, if backfill is required, keeps halving. A day that still returns 100 is the end of what this source can return.

The forward feed has no watermark. Each run queries the trailing three days and dedupes on `guid`. What counts as new for an alert is defined in ADR 0007.

Text path, in order: feed reader, token unwrap, article fetch, Readability on a linkedom document, classifier. linkedom is the DOM implementation, chosen over jsdom because Readability only needs a parsed tree and linkedom is much lighter. The unwrap is batched under the `news.google.com` rate limit. The body is fetched only for articles that will be classified. A failed unwrap, a blocked fetch, or a near-empty extract classifies the title. No login and no paywall bypass. `text_source` is `body` or `title`. The dashboard links to the publisher URL when unwrap works, otherwise to the Google News URL.

Rate limiting is a token bucket with capacity 1. `news.google.com` refills one token per second. Each other host refills one token per two seconds. The exercise bucket is in memory behind `take(domain)`, one bucket per process. Two commands that both call Google can together exceed one request per second. The README says so. There is no shared slot file. Production notes describe Redis as the shared bucket when more than one worker runs. Redis is not installed for the exercise. A throttle response (429, 503, or a consent or block page) is handled as ADR 0006 describes.

Each pipeline command has its own lock file, `<database>.<command>.lock`, and this is enforced. Backfill and the forward feed share `feed` on the coverage database. Unwrap, fetch, extract, and classify each lock the coverage database under their own command name. Digest and mail each lock the alerts database under their own command name. A different command may run at the same time. The job writes its pid into a claim file and links that onto its own lock file, so the visible file is never empty. A second copy of that command, while that pid is still running, exits non-zero and does not open its store. `process.kill(pid, 0)` is the liveness check: success or `EPERM` means the pid is running, and `ESRCH` means it is gone. Contents that are not a positive pid are not a running holder. The next start renames that file aside and creates a new lock, so a crash does not wait for a person, and two recovering starts cannot delete each other's lock. The loser exits naming the holder. The file is deleted when the job settles. A recycled pid that now belongs to some other live process looks held until that process exits. Every SQLite connection uses WAL, `busy_timeout` 5000, and foreign keys, because the server reads while a job writes. `news.google.com` uses `GOOGLE_TOKEN_MS`, default 1000. Every other host uses `PUBLISHER_TOKEN_MS`, default 2000. A set value that is not a positive whole number throws. Blank means the default.

## Consequences

Quiet names can come back complete in one response. Busy names are a sample of at most 150, and a full week is truncated before the cap applies. The dashboard does not mark sampled companies. The README states the cap. An ordinary-word name without an overlay entry fills the 100-item page with namesakes, and its real coverage may never be returned. The overlay is hand-written and is only as good as its descriptors. A syndicated press release appears once per outlet. The unwrap depends on an unofficial Google endpoint and can break. Same-outlet stories are not separated by publisher. The README runbook must state the 100-item ceiling, the week-split stop, the title fallback, and the blocked-host behavior. A pool of egress addresses is a production note only and is not built.
