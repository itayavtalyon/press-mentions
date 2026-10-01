# 0008. Server-rendered dashboard

Date: 2026-09-30

## Status

Accepted

## Context

The reviewer needs a quarterly view, a last-mentioned line, and a way to subscribe one company. Frontend work is not the center of the assignment. The page still has to make the window and the unranked rows obvious.

## Decision

The server renders HTML. There is no separate frontend application.

The index lists companies by most recently mentioned. Companies with no visible mention are at the bottom and say "no coverage found." Last mentioned is global, not scoped to the selected window (ADR 0001). The default window is last quarter, with controls for this quarter and a custom range (ADR 0001).

A company page lists that company's visible mentions for the selected window and can filter by verdict. A button opens a dialog whose form posts an email for that company only. The POST inserts into the alerts store (ADR 0005, ADR 0007). A duplicate pair answers that the address is already subscribed. A malformed address is rejected. A few lines of script open the dialog. The form still submits without it.

Each mention shows its `text_source`, so a headline judgment is marked. The company page shows the tally line from ADR 0002.

A `/review` page lists every `uncertain` row: company, title, link, text source, and the raw model reply. It is read-only. Labeling happens in the labeled-set file (ADR 0004).

Article timestamps are `<time datetime="…">` values in UTC, formatted in the browser's time zone.

Every feed-derived string is HTML-escaped at render. An `href` is emitted only for `http:` or `https:` URLs, and anything else is rendered as text. Custom `from` and `to` are parsed as instants. An unparseable value or `from >= to` answers 400 and names the field.

## Consequences

The subscribe path is one form and one insert, not an account system. Historical mentions stay on the page and out of the mail queue. The dialog is a small script on top of a normal POST. Filters and the company page are part of the specified product, not an optional extra.
