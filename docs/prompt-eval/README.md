# Prompt evaluation

This is how a model and a prompt become the pair collection uses. The program does not edit that pair. A person does, after reading a finished run.

## What a run does

`npm run job:eval` needs a local Ollama server. It reads `EVAL_DB` (default `data/evaluation.sqlite`) and every `prompt/classifier.vNNN.txt` file.

1. `ollama list` supplies the models. A name matching `/embed/i` is skipped. If no chat model remains, the run exits 1.
2. The loop is models, then prompts from oldest version to newest, then cases in stored order.
3. Each case is one article. `Classifier` builds one chat call, the same call production will use: temperature 0, seed 0, `num_ctx` 8192, the article cut at 6000 characters, and `think` false. The reply schema requires every company name on the case.
4. A missing key or an unknown value counts as `uncertain` for that company. The other companies in the same reply still count.
5. One `scores` row is stored per model and prompt, all sharing the run's `scored_at`. A thrown call stores nothing and exits 1. Run the tournament again.
6. The report goes to stdout. The last line is the winner or the tie.

`prompt/` may contain only `classifier.vNNN.txt` files. Any other file name fails the run. This README stays out of that folder for that reason.

The live pair is `LIVE_MODEL` and `LIVE_PROMPT_VERSION` in `src/core/classifier.js`. Today those constants are `qwen3.5:9b` and `v001`. The eval job does not read them.

Older rows in `scores` are earlier runs, including runs against a smaller set. They do not affect the printed winner. Compare runs by `scored_at`.

## How a point is awarded

Each company on a case is one decision. `score` and `relatedness` are counts of decisions, so a case with two companies counts twice. `seconds_per_case` is that pair's chat time divided by the number of cases, not the number of decisions.

The gold label `uncertain` is rejected. A person labels the row before it is inserted.

| Gold                                             | A point                       | Relatedness                     |
| ------------------------------------------------ | ----------------------------- | ------------------------------- |
| `unrelated`                                      | The reply is `unrelated`      | The reply is in the same bucket |
| `positive`, `negative`, `neutral`, or `unranked` | The reply equals that verdict | The reply is in the same bucket |

Buckets: `positive`, `negative`, `neutral`, and `unranked` are related. `unrelated` is unrelated. `uncertain` and anything else are unknown. A wrong tone on the right company keeps the relatedness point and loses the score point.

## How the winner is chosen

Rank by higher score, then higher relatedness, then the newer `vNNN`. Model name is not a tie-break. If score, relatedness, and prompt version are still equal, the last line is `tie` and lists every remaining pair. Do not pick one of them by name.

The lines above the outcome are the totals:

```text
<model> <prompt> score=<n> of <decisions> relatedness=<n> of <decisions> seconds_per_case=<seconds>
```

Then one line per missed decision:

```text
miss <model> <prompt> <case-id> <company> expected=<gold> actual=<verdict>
```

The company name may contain spaces. `expected=` marks the gold label.

## The labeled set

Cases live only in the `cases` table. There is no JavaScript seed. An empty table fails the run.

A case is an article, a publisher, an `https` homepage, the companies judged on that article, and the gold verdict for each. When the company is in `seed/overlay.json`, its note is that descriptor, word for word, because that is the line production will send. A company that is not in the overlay has no note.

The set is hand-labeled. It is not a random sample of a quarter. Case ids use `easy-`, `medium-`, and `hard-` so a person can see which kind of decision a prompt misses. Those prefixes are not weights. Every decision counts as one.

Some articles name more than one company. The case passes only a few of them as candidates, the companies that call would judge, and each of those candidates has its own gold verdict. A name that appears in the article but is not a candidate is not scored.

- Easy: the company is obviously the subject, or obviously a namesake, and the tone is plain.
- Medium: a title with a clear tone, a thin title, or a namesake that uses the company's words.
- Hard: the company and the ordinary word appear together, a list mention beside a real subject, or a gain word inside a harm story.

`unranked` means the text is too thin to judge tone. A headline such as "Casper raises $100 million" is `positive`, not `unranked`.

## Winning pair

Run on 2026-10-01, 167 cases, 177 company decisions, three installed chat models, prompts `v000` through `v002`. Last line: `winner qwen3.5:9b v001`.

`qwen3.5:9b` `v001` and `gemma4:12b` `v002` both scored 149. Relatedness breaks the tie: 164 for `qwen3.5:9b` `v001`, 161 for `gemma4:12b` `v002`. Prompt version was not needed. No other pair scored 149.

`LIVE_MODEL` and `LIVE_PROMPT_VERSION` in `src/core/classifier.js` are `qwen3.5:9b` and `v001`. The eval job does not edit them. A later run replaces them only when a person edits the constants.

## A prompt that might score better

Read the `miss` lines for the leading pairs. A miss shared by every prompt is a case problem or a hard judgment. A miss that only the leader makes, or that an older prompt gets right, is a prompt problem.

Add the change as a new file, `prompt/classifier.v003.txt`. Keep `{{article}}`, `{{publisher}}`, `{{homepage}}`, and `{{candidates}}`. Do not edit `v000`, `v001`, or `v002`. Those stay the baseline. Run the tournament again. The newer version wins a tie on score and relatedness, so it still has to earn the score. If it does not, leave the constants alone.
