# 0008. Server-rendered dashboard

Date: 2026-09-30

## Status

Accepted

## Context

The reviewer needs a quarterly view, a last-mentioned line, and a way to subscribe one company. Frontend work is not the center of the assignment. The page still has to make the window and the unranked rows obvious.

## Decision

The server renders HTML. There is no separate frontend application and no pagination. It binds `127.0.0.1`. `PORT` defaults to 3000. A set value that is not an integer from 1 to 65535 throws.

`GET /` is the index. `GET /companies/:id` is one company, and `:id` is the company slug. `POST /companies/:id/subscriptions` inserts one email for that company. `GET /review` is the operator list. The window query is `window=last`, `window=this`, or `window=custom` with `from` and `to` as UTC instants. Omitted `window` means last quarter. An optional `verdict` is one of `positive`, `negative`, `neutral`, or `unranked`. Omitted means every visible verdict.

The index sorts by last mentioned descending, companies with none last, then display name ascending. The tally line is the selected window, not all stored data.

The POST response is that company page with status 200. The page says subscribed, or that the address is already subscribed. A malformed address or a bad range is 400 and names the field. An address is trimmed, has one `@`, no spaces, a dot in the domain, and length at most 254. Uniqueness compares the whole address without regard to case. A few lines of script open the dialog. The form still submits without it.

Each mention shows its `text_source`, so a headline judgment is marked. The company page shows the tally line from ADR 0002.

A `/review` page lists every `uncertain` row: company, title, link, text source, and the raw model reply. It is read-only. Labeling happens in the labeled-set file (ADR 0004).

Article timestamps are `<time datetime="…">` values in UTC, formatted in the browser's time zone.

Every feed-derived string is HTML-escaped at render. An `href` is emitted only for `http:` or `https:` URLs, and anything else is rendered as text. Custom `from` and `to` are parsed as instants. An unparseable value or `from >= to` answers 400 and names the field.

## Consequences

The subscribe path is one form and one insert, not an account system. Historical mentions stay on the page and out of the mail queue. The dialog is a small script on top of a normal POST. Filters and the company page are part of the specified product, not an optional extra.

## Amendment, 2026-10-01

The dashboard design was closed with Itay on this date. `docs/ui-design.md` is the full spec. The decisions above still hold, with these changes:

- The page script is one module, `src/web/app.js`, not a few lines. It localizes times, auto-submits filter radios (not Custom and not the date fields), filters rows by name and alias, and opens the dialog where invoker commands are missing. Every page still works without it.
- `verdict=all` is accepted and means the same as an omitted `verdict`. On the index, a verdict narrows the counts and omits companies with zero such mentions in the window.
- Custom `from` and `to` come from date inputs read as UTC days. `to` is inclusive in the form, so the query ends at the start of the next day. A full ISO instant is still accepted.
- An unknown `window` or `verdict` answers 400 and names the field, like a bad range.
- The subscribe POST answers 403 when `Sec-Fetch-Site` is `cross-site` or `Origin` does not match the host. Every response carries a strict Content-Security-Policy. There is no inline script or style.
- An invalid address answers 400 with the form inline on the company page, the typed value kept. Success and an existing subscription still answer 200.
- The address domain must contain a dot that is not its first or last character.
- The company page groups mentions by verdict in digest order and shows aliases, the overlay descriptor, and a short text excerpt.
