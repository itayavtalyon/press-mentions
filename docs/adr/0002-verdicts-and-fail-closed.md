# 0002. Verdicts and fail closed

Date: 2026-09-30

## Status

Accepted

## Context

Ordinary-word company names make irrelevant articles the main quality risk. Some publisher pages are unreadable, and the product still needs a volume count. Alerts, sentiment tallies, and "last mentioned" cannot all treat those rows the same way.

## Decision

A candidate is a feed item returned for a company. A mention is a candidate whose stored verdict is `positive`, `negative`, `neutral`, or `unranked`.

The company must be a subject of the article: its news, product, deal, people, or results. A passing reference, such as a list of AI labs or "as SpaceX did", is `unrelated`. A namesake (another company, a person, a place, or an ordinary word) is `unrelated`. Tone is toward the company, not the mood of the article.

The model decides `unranked`, including for title-only rows. A headline with a clear tone ("X raises $100M") gets that tone. `unranked` means the text is too thin to judge. `text_source` is shown next to each mention, so a reader knows when the verdict came from a headline.

| Verdict                           | Meaning                                          | Dashboard                 | Sentiment tally | Last mentioned | Alert                  |
| --------------------------------- | ------------------------------------------------ | ------------------------- | --------------- | -------------- | ---------------------- |
| `positive`, `negative`, `neutral` | About the company, tone known                    | Shown                     | Counted         | Yes            | Yes, if new (ADR 0007) |
| `unranked`                        | About the company, not enough text to score tone | Shown                     | Omitted         | Yes            | Yes, if new (ADR 0007) |
| `unrelated`                       | Model judged it not about the company            | Hidden                    | Omitted         | No             | No                     |
| `uncertain`                       | Model could not judge, or the reply was unusable | Hidden, same as unrelated | Omitted         | No             | No                     |

`uncertain` sets a review flag and keeps the raw model text. A `/review` page lists every flagged row with its company, title, link, text source, and raw model reply, so hidden rows are visible to an operator (ADR 0008). A flagged row is not added to the scored labeled set until a person writes the expected verdict. A confident `unrelated` is not flagged. The same prompt version does not classify that row again.

Volume is shown as a mention count plus how many of those have a tone, for example "18 mentions, 11 rated."

## Consequences

Title-only rows can be `unranked` and can alert. A headline the model accepts will page a subscriber. Fail-closed rows disappear from the product and remain available for labeling. Keyword scraping of free-text replies is not used, so a sentence like "not positive" cannot become a label.
