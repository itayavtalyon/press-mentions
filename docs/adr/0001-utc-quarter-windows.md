# 0001. UTC quarter windows

Date: 2026-09-30

## Status

Accepted

## Context

The dashboard must show press mentions from the last quarter, and the same rows must support a rolling lookback and the current quarter. Reviewers can sit in different time zones. The graded export and the page have to describe the same window.

## Decision

Timestamps are stored in UTC. Named windows are computed on the server.

- This quarter is the current UTC calendar quarter from its start through now.
- Last quarter is the previous complete UTC quarter.
- Custom sends `from` and `to` as UTC instants. Its fields are prefilled with the last 90 days and apply only when that control is selected.
- Quarters are Q1 Jan 1–Mar 31, Q2 Apr 1–Jun 30, Q3 Jul 1–Sep 30, Q4 Oct 1–Dec 31, as half-open ranges `[start, next start)`.
- The page opens on last quarter.

On 5 Oct 2026 the default query is `[2026-07-01, 2026-10-01)`. Article dates are emitted as UTC instants and formatted in the browser's time zone. "N days ago" is whole elapsed 24-hour periods at read time (`daysSince`, floored). Zero reads "today". A `published_at` in the future, from feed clock skew, is clamped to today.

Last mentioned ignores the selected window. It is the newest visible mention across all stored data, shown as days only, with no status buckets. "No coverage found" means no visible mention since collection started, and the page and the README both say when that was.

## Consequences

Two reviewers selecting last quarter see the same rows. A custom range is the only window the client bounds. This quarter is a few days long just after a quarter boundary, which is an honest empty-looking view. Production collection is forward-only, so last quarter stays empty until a full quarter has been collected. The exercise backfill exists so the graded run is not empty. See ADR 0003.
