# Unwrapping Google News links

Google News RSS does not give us the publisher's article URL. Unwrap is the step that recovers it. The dashboard then links to the publisher when unwrap works, and to the Google News URL when it does not.

## Why a redirect is not enough

Each RSS item has two URLs, and neither is the story.

- `<link>` is a token on `news.google.com`, shaped like `https://news.google.com/rss/articles/<id>`. The id is the last path segment. Since 2024 that id is opaque. It is not a base64 encoding of the publisher URL.
- `<source>` is the publisher's homepage. ADR 0003 already says so. Following it opens the site, not the article.

Measured on 2 Oct 2026 with two OurCrowd stories (Calcalist Tech and The Jerusalem Post):

1. The feed link answered 302 to another `news.google.com` URL, still under `/rss/articles`, with query keys `oc`, `hl`, `gl`, and `ceid`. The article id did not change.
2. That URL answered 200 HTML.
3. The page's canonical URL and `og:url` were also `news.google.com`. There was no meta refresh to the publisher.

The publisher URL was not in the redirect. It showed up only after the call below.

The HTML page does carry two values the call needs: `data-n-a-sg` (a signature) and `data-n-a-ts` (a timestamp). Those belong to that article's page, so each article still needs its own GET.

## What `Fbv4je` and `batchexecute` are

`batchexecute` is the POST Google's own web apps use to send one or more internal RPC calls. For News the URL is `https://news.google.com/_/DotsSplashUi/data/batchexecute`. The body is `application/x-www-form-urlencoded`, and the field is `f.req`. The response starts with `)]}'` and then JSON frames tagged `wrb.fr`.

`Fbv4je` is the six-character id of the News call that turns an article token into a publisher URL. The arguments inside it are labeled `garturlreq`. The reply is labeled `garturlres`, and the publisher URL sits in that reply. This is the same request the public article page sends. It uses no login and no paywall bypass. It is not a documented API. ADR 0003 treats it as unofficial, and a break leaves rows retryable rather than guessing a URL.

The word "batched" in the rate-limit section of ADR 0003 means the token bucket: one Google request per second (`GOOGLE_TOKEN_MS`, default 1000). It does not, by itself, mean several articles in one POST.

## How this call was found

The single-article call was already in this repo before the batch question. ADR 0003 records a measurement on 30 Sep 2026: one token, opened as the article page and then sent through `batchexecute`, returned a publisher URL. The recipe in `src/infra/resolver.js` matches public decoders of that page, including the [scott2b gist](https://gist.github.com/scott2b/25c6ecd45caf960c137d86e05e166f3c) and the signature-based decoder in [alainmucyo/google-news-url-decoder](https://github.com/alainmucyo/google-news-url-decoder). Those decoders GET the article, read `data-n-a-sg` and `data-n-a-ts`, and POST this envelope:

```json
[[["Fbv4je", "<garturlreq JSON>", null, "generic"]]]
```

`garturlreq` is a JSON string: `["garturlreq", SHELL, articleId, timestampNumber, signature]`. `SHELL` is the public `X` / `US:en` array in `src/infra/resolver.js`. The JSON nulls are part of that recipe. One signed article still uses `"generic"`, and the parser takes the first `http` or `https` URL in that response whose host is not `news.google.com`.

The batch shape came from public `batchexecute` encoders, not from a guess. [pybatchexecute](https://github.com/pndurette/pybatchexecute) and [wong2/batchexecute](https://github.com/wong2/batchexecute) put several RPC envelopes in one `f.req`. For one RPC the fourth field is `"generic"`. For more than one it is `"1"`, `"2"`, and so on. The same project's decoder reads that index back from slot 6 of each `wrb.fr` frame. [fetchDecodedBatchExecuteMultiple](https://github.com/alainmucyo/google-news-url-decoder/commit/3423ed6349ceab2800ef8e0eaa615e75945bdee7) sends several `Fbv4je` entries that way, but its inner payload is the older one without a per-article signature. This project keeps the signature inner.

Two live POSTs on 2 Oct 2026 checked that combination against real article pages. No `rpcids` query was added. The first used a browser User-Agent and Referer. The second used only `content-type: application/x-www-form-urlencoded;charset=UTF-8`, which is what `src/infra/http.js` sends. Both returned HTTP 200 and two `garturlres` frames, echoed `"1"` and `"2"`. In the first response the second article's frame arrived first, so body order is not a pairing key. The article id was not in either payload. An earlier POST with an extra pair of brackets returned HTTP 400 and one `er` frame for the whole body. That was a malformed request, not a per-article failure.

A bad signature, a missing URL, and a throttle mixed into an otherwise good batch were not sent.

## What the code does

`src/infra/resolver.js` exposes `sign` and `post`. `sign` GETs one stored article URL and reads `data-n-a-sg` and `data-n-a-ts`. A URL with no id, a page with no signature, or a GET status other than 429 or 5xx throws `UnresolvedError`. The job sends that row down the title path, and it is not in the POST. A GET throttle stays retryable.

`post` sends one `batchexecute` POST for the signed array it is given. One article uses fourth-slot `"generic"`. Several use `"1"`, `"2"`, and so on. The inner `garturlreq` recipe and the SHELL array do not change, and the request does not add `rpcids`. Frames are paired by the echo in `wrb.fr` slot 6, not by body order. A missing echo, or a frame with no publisher URL, is omitted from the result. The job takes the title path for that article.

A POST that does not return a parseable batch throws. That includes a non-throttle HTTP status, a body with no `Fbv4je` frame, and an exhausted throttle. The job leaves every article in that POST retryable. It does not take the title path. One throttled POST counts as one exhaustion toward the three-in-a-row stop, not one per article. A later signature clears that streak, so throttled POSTs with a successful article page between them do not stop the run.

`src/jobs/run-unwrap.js` signs each row and posts every 20 signatures, then posts any shorter remainder, including signatures gathered before a GET stop. An empty remainder is not sent. Measured on 2 Oct 2026, one POST of 20 stored articles returned 20 publisher URLs and wrote nothing. The token bucket stays one take per HTTP request. The stage write stays `WHERE guid = ? AND stage = 'unwrap'`. Unwrap does not call fetch. The lock file stays `<database>.unwrap.lock`.

Tests use fixtures. They do not call Google.
