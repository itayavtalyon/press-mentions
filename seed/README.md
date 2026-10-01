# Seed and overlay

`companies.txt` is the list OurCrowd provided: 258 names, one per line, exactly as received. It is the only source of which companies exist.

`overlay.json` adds search and identity hints to 57 of those names. It never adds or removes a company: an overlay key that does not match a seed line stops the job (`src/core/overlay.js`). All 258 names were measured on 1 Oct 2026. The other 201 need no entry.

## Why the overlay exists

The seed has names only, with no domain or sector. Many names are ordinary words, and Google News returns at most 100 items per query. When a name is a common word, those 100 items are filled with other uses of the word, and the company's own stories never come back. The classifier can only reject noise it receives. It cannot recover a story the feed did not return.

Measured on 1 Oct 2026, one query per name for 1 Jul to 1 Oct 2026, the same query the backfill sends:

- 24 of the first 30 overlay names returned a full page of 100 items. Without the overlay, a full page also triggers the week split, so each of these names would send up to 150 noise items to the classifier.
- In a random sample of 10 headlines per full page, 21 names had at most one headline about the company. Examples: Harvey was mostly Harvey Weinstein and two football players named Harvey. Wave was heat waves and D-Wave. Ro was Ro Khanna. Astra was OpenAI's GPT-6 Astra. MST was Missouri S&T and Mountain Standard Time. Clinch was baseball teams clinching playoff spots.
- Four seed aliases were pure noise. `"Ludeo" OR "Edge"` returned 100 items and none mentioned Ludeo. `"Trellis"` returned 100 items, all Trellis Group or Trellis Bioscience. `"BT9"` returned only a Belfast postcode, and `"Memic"` returned footballers named Memić and MEMIC Insurance.
- Names that look like phrases flood the same way: "Scale AI", "Together AI", "People.ai", and "Spot AI" match "to scale AI", "together … AI", "people … AI", and "how to spot AI".

## Sources

Nothing in the overlay is written from memory. Every field comes from one of these:

- **OurCrowd company pages**, `https://www.ourcrowd.com/companies/<slug>`, fetched 1 Oct 2026. Each page embeds a schema.org `Organization` object. Descriptors condense its `description` and `makesOffer` fields. Executive names used as query terms come from its `member` list. Some pages live under the former name: Ludeo at `edge`, BlueCircle at `trellis`, Oshi at `plantish`, Momentis Surgical at `memic`, Xsense at `bt9`.
- **The company's own site**, when OurCrowd had no page or the page was not enough:
  - `lambda.ai`: "AI compute in the cloud".
  - `waveapps.com`: legal name "Wave Financial Inc.". The CEO, Kirk Simpson, is named on the OurCrowd page.
  - `overtime.tv`: links to `overtimeelite.com` and `overtimeselect.com`.
  - `people.ai`: redirects to `backstory.ai`, "Backstory: AI Revenue Platform for Sales Teams".
- **Google News RSS** for every count in this file: `https://news.google.com/rss/search` with `hl=en-US`, `gl=US`, `ceid=US:en`, and the window 1 Jul to 1 Oct 2026. These are the same query builder and adapter the backfill uses (`src/core/query.js`, `src/infra/google-news.js`), run on 1 Oct 2026. Relevance was judged by reading a random sample of headlines. The sample size is shown with each number.

## How it was built

1. **Identity from a source.** Each descriptor condenses the company's OurCrowd page, or its own site when there was no page (see Sources). Some identities differed from a reasonable guess:
   - Wave is Wave Financial (small-business accounting), not the African mobile money app.
   - Neura is customer-engagement AI, not robotics.
   - Fireblade is website cyber protection, not the Honda motorcycle.
   - People.ai now operates as Backstory.
2. **Aliases dropped only on evidence.** Edge, Trellis, BT9, and Memic were removed after the counts above. Every other parenthetical alias in the seed is kept.
3. **Query terms only where a measured query improved.** Terms use words from the same sources. Each candidate set was run against Google News and kept only when the share of headlines about the company went up, or the noise went down without losing visible coverage. Some took several rounds:
   - Orchard's first set included "home", which still matched Orchard Park, so "home" was dropped.
   - MeMed's first set included "viral", which matched viral memes, so it was dropped too.
   - Spot AI's "cameras" and "video" matched articles on spotting deepfakes.
   - Wave and Overtime got nothing usable from their descriptions, so their terms come from their own sites and executives.
4. **No terms where the name is already clean.** Stripe, Glean, Kando, Ludeo, Privateer, Neura, and nine third-pass names have a descriptor only.
5. **Three passes.**
   - The first covered names flagged as ordinary words.
   - The second came from building evaluation cases.
   - The third queried every remaining name once, flagged those with a full page or with headlines that rarely named the company, and read samples of those.

## Results

"Before" is the name alone. "After" is the committed overlay query. Relevant means the headline is about the company.

### First pass

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

Building the no-note evaluation cases meant querying 18 companies without an overlay entry. Five were flooded.

| Company     | Before: items | Before: relevant | After: items | After: relevant |
| ----------- | ------------: | ---------------: | -----------: | --------------: |
| Scale AI    |           100 |          3 of 12 |           22 |         7 of 10 |
| Together AI |           100 |          6 of 12 |           53 |         7 of 10 |
| Ukko        |            49 |          0 of 12 |            2 |               — |
| Crosswise   |            23 |          0 of 12 |            0 |               — |
| Powwow      |           100 |          0 of 12 |            0 |               — |

Ukko was an NHL goalie, Powwow was cultural events, and Crosswise was the ordinary word.

### Third pass

All 210 remaining names were queried once. 181 returned fewer than 30 items, and 62 of those returned none. The flagged names were read; 22 got an entry.

| Company             | Before: items | Before: relevant | After: items |      After: relevant |
| ------------------- | ------------: | ---------------: | -----------: | -------------------: |
| SSI                 |           100 |           2 of 8 |           68 |               7 of 8 |
| People.ai           |           100 |           0 of 8 |            7 | 6 of 7, as Backstory |
| Oshi                |            69 |           0 of 8 |            6 |               3 of 6 |
| MasterClass         |           100 |           0 of 8 |            9 |               2 of 9 |
| ProFuse             |            40 |           0 of 8 |            2 |               1 of 2 |
| Eko Health          |            20 |           0 of 8 |            9 |               1 of 8 |
| MeMed               |            42 |           1 of 8 |            4 |       see weaknesses |
| Future Family       |            55 |           0 of 8 |            9 |               0 of 8 |
| Spot AI             |           100 |           0 of 8 |            0 |                    — |
| Replay Technologies |            31 |           0 of 8 |            0 |                    — |
| Fireblade           |            41 |           0 of 8 |            0 |                    — |

The noise was SSI as Social Security checks, Oshi as Oshi Health and an anime, MasterClass as "a masterclass", ProFuse as "profuse sweating", Eko Health as Lagos's Ilera Eko insurance, MeMed as "memed", Future Family as the phrase, Replay Technologies as NFL instant replay, and Fireblade as the Honda motorcycle.

Two aliases were dropped: Xsense's `BT9` (9 items, all about the Belfast postcode) and Momentis Surgical's `Memic` (23 items, none relevant). Without them, Momentis returns 7 items, 4 of them about its FDA clearance. Xsense returns none.

Nine names got a descriptor and no terms. Their result sets are small, so nothing is crowded out, but the name has another meaning that the classifier should be able to reject:

- NetOp: a Danish word.
- Sotero and Ossio: people's names.
- CB4: a football position.
- Wayup: "way up".
- JUMP Bikes: "jump bikes".
- Sense Education: "make sense of education".
- Ursa Major: the constellation and a cold-storage product.
- Connected Energy: an acquisition by CLEAResult, possibly a different company of the same name.

Checked and left without an entry because the results are mostly the company: Anthropic, SpaceX, Stripe, Databricks, Cerebras, Groq, OpenEvidence, xAI, IQM, Stoke Space, TensorWave, Harbinger Motors, Quantum Machines, BioCatch, Klook, and EquipmentShare. Arrow Global's OurCrowd page is for its ACO II debt fund. The news about Arrow Global's deals is about the fund's manager, so it counts.

## How the data is used

### Fetching articles

1. `src/infra/seed-file.js` reads `companies.txt` and `overlay.json`. `src/core/overlay.js` validates the overlay and merges it into the seed companies. A malformed entry, or a key that matches no seed line, stops the job.
2. `src/infra/coverage-store.js` stores the merged company, including `descriptor` and `query_terms`, on its `companies` row.
3. `src/core/query.js` builds one Google News query per company:
   - It quotes the query name and every alias, joined with OR. An overlay `aliases` list replaces the seed's.
   - It adds the overlay `queryTerms` as a second OR group, which Google requires alongside the name.
   - It widens the date bounds by a day on each side.

   Examples:
   - `"Harvey" ("legal AI" OR "lawyers" OR "law firms")`
   - `"Ludeo"`: the overlay dropped the Edge alias.
   - `("SSI" OR "Safe Superintelligence") ("Sutskever" OR "superintelligence" OR "Daniel Levy")`
   - `"NetOp"`: a descriptor-only entry leaves the query as the name.

4. The backfill (`src/core/collect.js`) sends that query for last quarter through now. A full first page triggers the week split, and at most 150 candidates are kept per company. Fewer noise items means fewer full pages, fewer weekly queries, and less work downstream.
5. Once a company's candidates are stored, `backfilled_at` is set and the backfill skips that company afterwards. Changing the overlay after that does not re-query it (see Changing it).

### Classifying articles

1. The descriptor is the company note the classifier sees. `Classifier` in `src/core/classifier.js` renders a company with a note as `Name — note`, and a company without one as the bare name.
2. Prompt `v002` (`prompt/classifier.v002.txt`) tells the model to read the identity after the em dash and to answer `unrelated` when the article uses the name for a different entity, place, product, or ordinary word. That is how "Oshi Health" or "Ilera Eko" gets rejected even when the feed returned it.
3. Not built yet: the step that classifies collected articles must read `companies.descriptor` and pass it as that company's note. Companies without an overlay entry are sent with no note (ADR 0004).
4. The evaluation set measures the same line production will send. Every case that names an overlay company carries that company's descriptor, word for word, as its note. Cases for companies without an entry carry none. Of 139 cases, 98 carry a note and 41 do not. When a descriptor changes, the cases that name that company must be updated to match.

## What is still weak

- **Few or no stories found:**
  - Bites, Kini, Peak, MST, Silo, Launchpad, Rewire, Guild, BlueCircle, Ukko, Crosswise, and Powwow.
  - Spot AI, Replay Technologies, Fireblade, and Xsense.

  Some may be quiet, acquired, or renamed. Others may be losing recall to the terms. Without terms, each produced a page of noise with at most one relevant headline, so the trade was taken.

- **Still mostly noise:**
  - Orchard: Singapore's Orchard Road and Orchard Park.
  - Ro: GLP-1 telehealth stories that do not name Ro in the headline.
  - Near: other data-intelligence companies.
  - Future Family: general fertility coverage.

  The classifier has to reject these, using the descriptor.

- **MeMed:** the four remaining items are a hospital adopting a host-response test for bacterial versus viral infection. No headline names the maker, so they are not counted as relevant.
- **Self-published results:** CarDekho and Cyfirma return mostly articles they published themselves. They are the publisher, not the subject, so the classifier should answer `unrelated`. The fix at the source would be a `-site:` exclusion, which `src/core/query.js` does not support.
- **Shifting results:** Google's results move between calls. Tailor Brands returned 0 in the sweep and 10 an hour later. A zero means no coverage was returned at that moment, not proof that none exists.
- **Small samples:** the relevance judgments are a reading of headlines, not articles, and the samples are small.

## Changing it

Edit `overlay.json`, keyed by the exact seed line. The allowed fields are:

- `descriptor`: one line.
- `queryTerms`: strings, at least one of which must appear.
- `aliases`: replaces the seed's aliases.

Record the source and the measurement here.

The backfill does not re-query a company it already collected, so finish the overlay before the real backfill. To re-collect one company after a change, clear its marker: `UPDATE companies SET backfilled_at = NULL WHERE id = '<id>'`.

When a descriptor changes, update the evaluation cases that name that company, so their note still matches.
