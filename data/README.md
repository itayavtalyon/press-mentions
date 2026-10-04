# What is in this folder

Snapshot from `npm run job:export` at `2026-10-04T15:53:36.727Z`. These files are the run a reviewer can read without starting Ollama or calling Google.

The dashboard shots of this same snapshot are [`docs/shots/sample-index.png`](../docs/shots/sample-index.png), [`docs/shots/sample-briefcam.png`](../docs/shots/sample-briefcam.png), and [`docs/shots/sample-eko.png`](../docs/shots/sample-eko.png).

## Files

| File                       | What it is                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `summary.json`             | All 258 companies. `last_mentioned_at`, `days_since_last_mention` at `as_of`, and Q3 counts for `positive`, `negative`, `neutral`, and `unranked`             |
| `companies/<id>.json`      | That company's visible mentions in Q3 2026 (1 Jul through 1 Oct, end exclusive). Title, link, publisher, time, verdict, and `text_source` (`body` or `title`) |
| `alerts.json`              | Alert outbox. This snapshot is `[]`                                                                                                                           |
| `sqlite/coverage.sqlite`   | Compacted coverage store, about 35 MB. Article text and the raw model reply stay here                                                                         |
| `sqlite/evaluation.sqlite` | The 167 labeled cases and the tournament scores                                                                                                               |
| `sqlite/alerts.sqlite`     | Subscriptions, with every address replaced by `redacted@example.com`                                                                                          |

`unrelated` and `uncertain` stay in `sqlite/coverage.sqlite` and stay out of the JSON. Q3 in the JSON is 3,034 mentions: 1,935 positive, 751 neutral, 308 negative, 40 unranked. Another 1,340 links were judged `unrelated`.

`days_since_last_mention` is whole days before `as_of`. It ignores the quarter window. A mention on 1 Oct can make the status "2 days ago" while the company file, which is Q3 only, stops on 30 Sep.

## Four companies

### BriefCam — last mentioned 16 days ago

[`companies/briefcam.json`](companies/briefcam.json). Four Q3 mentions, all from the article body. Two negative, two neutral.

- Negative, 14 Sep, Chicago Tribune: [Letters: The Tribune Editorial Board is right to question the proliferation of Flock cameras](https://www.chicagotribune.com/2026/09/14/letters-091426-flock-cameras/). The letter then argues against Cook County buying BriefCam.
- Neutral, 18 Sep, FutureScot: [Police Scotland explores AI-powered CCTV search in Aberdeen pilot](https://futurescot.com/police-scotland-explores-ai-powered-cctv-search-in-aberdeen-pilot/).

### Eko Health — last mentioned 53 days ago

[`companies/eko-health.json`](companies/eko-health.json). Three Q3 mentions.

- Negative, 12 Aug, Phys.org: [Human clinicians outperform AI stethoscope in diagnosing pet heart problems](https://phys.org/news/2026-08-human-clinicians-outperform-ai-stethoscope.html).
- Positive, 29 Jul: [FDA Breakthrough Device Aortic Stenosis Screening Market](https://www.futuremarketinsights.com/reports/fda-breakthrough-device-aortic-stenosis-screening-market).

The company page also shows the overlay line, "Digital heart disease monitoring and cardiopulmonary screening (Eko Devices)".

### Lemonade — status and quarter are different clocks

[`companies/lemonade.json`](companies/lemonade.json) has 107 Q3 mentions (72 positive, 21 neutral, 14 negative). The newest row in that file is 29 Sep. `summary.json` says last mentioned **2 days** before `as_of`, because a later article sits outside Q3: 1 Oct, Simply Wall St, verdict `positive`, [Is Renters Expansion Altering The Investment Case For Lemonade (LMND)?](https://simplywall.st/stocks/us/insurance/nyse-lmnd/lemonade/news/is-renters-expansion-altering-the-investment-case-for-lemona). The dashboard shows that split on the company page: the tally is the selected window, and "last mentioned" is every visible mention.

One Q3 row is headline-only (`text_source` `title`), 29 Sep, Stock Titan: [Renters insurance in Alaska now starts at $5 a month from Lemonade](https://www.stocktitan.net/news/LMND/lemonade-expands-renters-insurance-to-co7tmwuq6bbh.html). The publisher page was blocked, so the model saw the headline.

### 3d Signals — no coverage

[`companies/3d-signals.json`](companies/3d-signals.json) has `last_mentioned_at: null` and no mentions. 104 companies are in that state. 73 of them have no stored article. The other 31 have only `unrelated` links, or articles that have not been classified yet.

## What this snapshot does not contain

The forward feed stored 510 articles with origin `daily`. None have a verdict, so `job:eligible` has nothing to mark and `alerts.json` is empty. 640 articles are still at stage `fetch`, and 2 are at `extract`. The fetch lock file names pid 99800, and that process is not running. The next `npm run job:fetch` takes the lock.
