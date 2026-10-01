# Seed and overlay

`companies.txt` is the list OurCrowd provided: 258 names, one per line, exactly as received. It is the only source of which companies exist.

`overlay.json` adds search and identity hints to 35 of those names. It never adds or removes a company: an overlay key that does not match a seed line stops the job (`src/core/overlay.js`).

## Why the overlay exists

The seed has names only, with no domain or sector. Many names are ordinary words, and Google News returns at most 100 items per query. When a name is a common word, those 100 items are filled with other uses of the word, and the company's own stories never come back. The classifier can only reject noise it receives. It cannot recover a story the feed did not return.

Measured on 1 Oct 2026, one query per name for 1 Jul to 1 Oct 2026, the same query the backfill sends:

- 24 of the 30 overlay names returned a full page of 100 items. Without the overlay, a full page also triggers the week split, so each of these names would send up to 150 noise items to the classifier.
- In a random sample of 10 headlines per full page, 21 names had at most one headline about the company. Examples: Harvey was mostly Harvey Weinstein and two football players named Harvey. Wave was heat waves and D-Wave. Ro was Ro Khanna. Astra was OpenAI's GPT-6 Astra. MST was Missouri S&T and Mountain Standard Time. Clinch was baseball teams clinching playoff spots.
- Two seed aliases were pure noise. `"Ludeo" OR "Edge"` returned 100 items and none mentioned Ludeo. `"Trellis"` returned 100 items, all Trellis Group or Trellis Bioscience, none about BlueCircle.

## How it was built

1. **Identity from a source, not from memory.** Each descriptor condenses the company's OurCrowd page (`https://www.ourcrowd.com/companies/<slug>`, the schema.org `description` and `makesOffer` fields). Lambda had no OurCrowd page under any slug tried, so its descriptor comes from `lambda.ai`. Wave and Overtime also use their own sites (`waveapps.com`, `overtime.tv`). Two identities differed from a reasonable guess: Wave is Wave Financial (small-business accounting), not the African mobile money app, and Neura is customer-engagement AI, not robotics.
2. **Aliases dropped only on evidence.** Edge and Trellis were removed after the counts above. Every other parenthetical alias in the seed is kept.
3. **Query terms only where a measured query improved.** Terms use words from the same source text. Each candidate set was run against Google News and kept only when the share of headlines about the company went up, or the noise went down without losing visible coverage. It took up to three rounds. For example, Orchard's first set included "home", which still matched Orchard Park, so it was dropped. Wave and Overtime got nothing usable from their descriptions. Their own sites supplied "Wave Financial", "waveapps", and the CEO's name for Wave, and "Overtime Elite", "Overtime Select", and the founders' names for Overtime.
4. **No terms where the name is already clean.** Stripe (9 of 10 sampled headlines about the company), Glean, Kando, Ludeo, Privateer, and Neura have a descriptor only. Their pages are not full, or are mostly the company already.

## Results

"Before" is the name alone. "After" is the committed overlay query. Relevant means the headline is about the company, judged by reading it. The sample is random and its size is shown.

| Company    |      Before: items | Before: relevant | After: items | After: relevant |
| ---------- | -----------------: | ---------------: | -----------: | --------------: |
| Harvey     |                100 |          2 of 10 |           82 |          6 of 8 |
| Lambda     |                100 |          4 of 10 |           51 |          3 of 8 |
| Island     |                100 |          0 of 10 |           18 |          7 of 8 |
| Clinch     |                100 |          0 of 10 |            5 |          4 of 5 |
| Overtime   |                100 |          0 of 10 |           44 |         8 of 12 |
| Greenlight |                100 |          0 of 10 |            9 |          5 of 8 |
| Casper     |                100 |          0 of 10 |           81 |          6 of 8 |
| Lemonade   |                100 |          1 of 10 |          100 |          5 of 8 |
| Tala       |                100 |          1 of 10 |           22 |          3 of 8 |
| Astra      |                100 |          0 of 10 |           59 |          2 of 8 |
| Shield     |                100 |          0 of 10 |            2 |          1 of 2 |
| Wave       |                100 |          0 of 10 |           10 |         1 of 10 |
| Ro         |                100 |          0 of 10 |           48 |          0 of 8 |
| Orchard    |                100 |          0 of 10 |           66 |          0 of 8 |
| Near       |                100 |          0 of 10 |           40 |          0 of 8 |
| Guild      |                100 |          1 of 10 |            2 |          0 of 2 |
| Bites      |                100 |          0 of 10 |            9 |          0 of 8 |
| Peak       |                100 |          0 of 10 |            7 |          0 of 7 |
| MST        |                100 |          0 of 10 |            3 |          0 of 3 |
| Silo       |                100 |          0 of 10 |            3 |          0 of 3 |
| Kini       |                100 |          0 of 10 |            0 |               — |
| Rewire     |                100 |          0 of 10 |            0 |               — |
| Launchpad  |                100 |          0 of 10 |            0 |               — |
| Ludeo      |    100 (with Edge) |         0 of 100 |            2 |          2 of 2 |
| BlueCircle | 100 (with Trellis) |         0 of 100 |            0 |               — |

### Second pass

Building the no-note evaluation cases meant querying 18 companies that had no overlay entry. Five of them were flooded the same way, so they were added with the same method: OurCrowd page for the descriptor, then measured terms. Before is the name alone, sampled 12 headlines.

| Company     | Before: items | Before: relevant | After: items | After: relevant |
| ----------- | ------------: | ---------------: | -----------: | --------------: |
| Scale AI    |           100 |          3 of 12 |           22 |         7 of 10 |
| Together AI |           100 |          6 of 12 |           53 |         7 of 10 |
| Ukko        |            49 |          0 of 12 |            2 |               — |
| Crosswise   |            23 |          0 of 12 |            0 |               — |
| Powwow      |           100 |          0 of 12 |            0 |               — |

"Scale AI" and "Together AI" match ordinary phrases ("to scale AI-native banking", "brings the ecosystem together … AI"). Ukko was an NHL goalie, Powwow was cultural events, and Crosswise was the ordinary word. The other 13 companies checked (Databricks, Cerebras, Groq, OpenEvidence, xAI, Innoviz, Hailo, Beyond Meat, Ynsect, Freightos, Kodiak Robotics, Remilk) came back mostly about the company. Atlas Obscura came back mostly as travel stories it published itself. The company is the publisher there, not the subject, so the classifier has to reject them, and query terms would not change that. The other 210 names have not been measured.

## What is still weak

- **Few or no stories found:** Bites, Kini, Peak, MST, Silo, Launchpad, Rewire, Guild, BlueCircle, Ukko, Crosswise, and Powwow. These may be quiet companies, some acquired or renamed, or the terms may cost recall. The noise they produced without terms was 100 items with at most one relevant headline, so the trade was taken.
- **Still mostly noise:** Orchard (Singapore's Orchard Road, Orchard Park), Ro (GLP-1 telehealth stories that do not name Ro in the headline), and Near (other data-intelligence companies). The classifier has to reject these, and the descriptor tells it which company is meant.
- The relevance judgments are a reading of headlines, not of articles, and the samples are small.

## How the code uses it

- `src/infra/seed-file.js` reads both files. `src/core/overlay.js` validates the overlay and merges it into the seed companies.
- `src/core/query.js` builds the Google News query from the query name, the aliases (an overlay `aliases` list replaces the seed's), and the overlay `queryTerms`: `"Harvey" ("legal AI" OR "lawyers" OR "law firms")`. The backfill sends that query for every company.
- `src/infra/coverage-store.js` stores `descriptor` and `query_terms` on each company row.
- The descriptor is for the classifier. `Classifier` in `src/core/classifier.js` renders a company with a note as `Name — note`, and prompt `v002` tells the model to read the identity after the em dash. The step that classifies collected articles is not built yet. It must pass `companies.descriptor` as that note.

## Changing it

Edit `overlay.json`, keyed by the exact seed line. Allowed fields are `descriptor` (one line), `queryTerms` (strings, any of which must appear), and `aliases` (replaces the seed's aliases). The backfill does not re-query a company it already collected, so finish the overlay before the real backfill. To re-collect one company after a change, clear its marker: `UPDATE companies SET backfilled_at = NULL WHERE id = '<id>'`.
