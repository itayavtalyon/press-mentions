# What is in this folder

Snapshot from `npm run job:export` at `2026-10-05T07:04:02.120Z`, after the 4 Oct daily run. These files are the run a reviewer can read without starting Ollama or calling Google.

The dashboard shots of this same snapshot are the `sample-*.png` files in [`docs/shots/`](../docs/shots/): the index light and dark, BriefCam, Eko Health, Lemonade, Databricks, Harvey's _Company site_ tags, and Harvey on mobile.

## Files

| File                       | What it is                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `summary.json`             | All 258 companies. `last_mentioned_at`, `days_since_last_mention` at `as_of`, and Q3 counts for `positive`, `negative`, `neutral`, and `unranked`                         |
| `companies/<id>.json`      | That company's visible mentions in Q3 2026 (1 Jul through 1 Oct, end exclusive). Title, link, publisher, time, verdict, `text_source` (`body` or `title`), and `own_site` |
| `alerts.json`              | Alert outbox: 45 digests, all `sent` on 4 Oct. Addresses in the bodies are redacted                                                                                       |
| `sqlite/coverage.sqlite`   | Compacted coverage store, about 35 MB. Article text and the raw model reply stay here                                                                                     |
| `sqlite/evaluation.sqlite` | The 167 labeled cases and the tournament scores                                                                                                                           |
| `sqlite/alerts.sqlite`     | Subscriptions, with every address replaced by `redacted@example.com`                                                                                                      |

`unrelated` and `uncertain` stay in `sqlite/coverage.sqlite` and stay out of the JSON. Q3 in the JSON lists 3,058 mentions. 260 of them have `own_site: true`: the company published them on its own site (Databricks 72, CarDekho 51, Anthropic 30, Cyfirma 23, Harvey 19, and 10 more). They are listed but not counted, so the counts in `summary.json` total 2,798: 1,794 positive, 680 neutral, 312 negative, 12 unranked. `last_mentioned_at` ignores them too. Another 1,539 links were judged `unrelated`.

`days_since_last_mention` is whole days before `as_of`. It ignores the quarter window. A mention on 3 Oct can make the status "1 day ago" while the company file, which is Q3 only, stops on 30 Sep.

## Four companies

### BriefCam — last mentioned 16 days ago

[`companies/briefcam.json`](companies/briefcam.json). Four Q3 mentions, all from the article body. Two negative, two neutral.

- Negative, 14 Sep, Chicago Tribune: [Letters: The Tribune Editorial Board is right to question the proliferation of Flock cameras](https://www.chicagotribune.com/2026/09/14/letters-091426-flock-cameras/). The letter then argues against Cook County buying BriefCam.
- Neutral, 18 Sep, FutureScot: [Police Scotland explores AI-powered CCTV search in Aberdeen pilot](https://futurescot.com/police-scotland-explores-ai-powered-cctv-search-in-aberdeen-pilot/).

### Eko Health — last mentioned 54 days ago

[`companies/eko-health.json`](companies/eko-health.json). Three Q3 mentions.

- Negative, 12 Aug, Phys.org: [Human clinicians outperform AI stethoscope in diagnosing pet heart problems](https://phys.org/news/2026-08-human-clinicians-outperform-ai-stethoscope.html).
- Positive, 29 Jul: [FDA Breakthrough Device Aortic Stenosis Screening Market](https://www.futuremarketinsights.com/reports/fda-breakthrough-device-aortic-stenosis-screening-market).

The company page also shows the overlay line, "Digital heart disease monitoring and cardiopulmonary screening (Eko Devices)".

### Lemonade — status and quarter are different clocks

[`companies/lemonade.json`](companies/lemonade.json) has 108 Q3 mentions (72 positive, 22 neutral, 14 negative). The newest row in that file is 29 Sep. `summary.json` says last mentioned **1 day** before `as_of`, because later articles sit outside Q3. The newest is 3 Oct, Stocktwits, verdict `positive`: [Lemonade Stock Faces Wall Street Caution As Core Profit Growth Comes Into Focus](https://stocktwits.com/news-articles/markets/equity/LMND-stock-faces-wall-street-caution-as-core-profit-growth-comes-into-focus/cZRt08PR4UY). The dashboard shows that split on the company page: the tally and the weekly chart are the selected window, and "last mentioned" is every counted mention.

18 Q3 rows are headline-only (`text_source` `title`), where the publisher page was blocked and the model saw only the headline.

### 3d Signals — no coverage

[`companies/3d-signals.json`](companies/3d-signals.json) has `last_mentioned_at: null` and no mentions. 105 companies have `last_mentioned_at: null`. 73 of them have no stored article. Most of the rest have only `unrelated` links or articles that are not classified yet. Atlas Obscura's only Q3 mention is on its own site, so it is listed and not counted.

## What this snapshot does not contain

The forward feed stored 510 articles with origin `daily`. 304 of their company links became visible mentions, 191 were judged `unrelated`, and 45 digests went out. 117 articles are still at stage `fetch`, waiting on publishers that kept throttling. The next `npm run job:fetch` retries them.
