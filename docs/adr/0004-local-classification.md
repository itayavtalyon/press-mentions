# 0004. Local classification

Date: 2026-09-30

## Status

Accepted

## Context

Sentiment and relevance must run on a local Ollama model. The machine has `qwen2.5:14b`, `qwen3.5:9b`, and `gemma4:12b`. Generic names require a relevance judgment. The full corpus can afford one classification, not a tournament.

## Decision

One call per article, temperature 0, Ollama asked for JSON. The prompt receives the article text (body or title), the publisher name, the publisher homepage, and the candidate company names. When the overlay has a descriptor for a candidate (ADR 0003), the prompt pairs the name with that one line, so "Harvey — legal AI startup" can be told apart from Harvey Norman. The prompt states the mention rule from ADR 0002: the company is a subject, and a passing reference or a namesake is `unrelated`. It does not receive a longer per-company dossier. Gold labels from the labeled set are not pasted into the prompt.

The reply is a JSON object whose keys are those exact company names and whose values are `positive`, `negative`, `neutral`, `unranked`, `unrelated`, or `uncertain`. Unknown keys are ignored. A missing candidate is `uncertain` for that company only. Other keys in the same object still count. A company attached later causes one new call. Verdicts already stored for the other companies stay.

Call options: `format` is a JSON schema built per call, with the candidate names as required properties and the verdict enum as their type, so Ollama constrains decoding instead of the parser guessing. `think: false`, because the qwen3.5 family otherwise spends tokens reasoning before the JSON. `seed` is fixed next to temperature 0. The article text is cut to a fixed character budget and `num_ctx` is set explicitly, because Ollama silently truncates a prompt longer than its context window, and the instructions can be the part that gets dropped.

A parse failure is stored as `uncertain` with the raw text and the review flag. There is no keyword fallback and no second guess.

The live model id and prompt version are `LIVE_MODEL` and `LIVE_PROMPT_VERSION` in `src/core/classifier.js`. Today they are `gemma4:12b` and `v002`. A person edits them by hand. They are not environment variables. The eval program does not read them and does not edit them. A running process keeps the pair it loaded. The next process reclassifies rows stored under a different pair, and it does not refetch those articles.

Call options on `Classifier` are temperature 0, seed 0, `num_ctx` 8192, and an article cap of 6000 characters. `think` is false. The program does not edit those either.

Saved prompts are `prompt/classifier.vNNN.txt`. Each file must contain `{{article}}`, `{{publisher}}`, `{{homepage}}`, and `{{candidates}}`. A company line is the name, or `Name — note` when the case has a note. The note is optional.

The note is the overlay descriptor (`seed/overlay.json`, stored as `companies.descriptor`). Not built yet: the classify stage reads each candidate's descriptor and passes it to `Classifier` as that company's note, and a candidate without a descriptor gets no note. An eval case for a company in the overlay uses the overlay descriptor, word for word, as its note, so the eval measures the line production will send. Which name the classify stage sends, the seed line or the query name, is not decided.

The eval program lists installed models with `ollama list`, skips names matching `/embed/i`, and fails when no chat model remains. It then loops models, then prompt files, then cases. It does not stop at the three models installed on this machine.

Cases live only in the evaluation SQLite `cases` table (`id`, `position`, `parameters_json`, `expected_json`). There is no JavaScript seed. An empty table fails the run. A person inserts the rows. `scores` stores `model_id`, `prompt_id`, `score`, `relatedness_correct`, `seconds_per_case`, and `scored_at`, unique on model, prompt, and time. `seconds_per_case` is the run's elapsed milliseconds divided by the case count, then by 1000.

A gold label of `uncertain` throws. A missing key in the reply counts as `uncertain` for that company. Relevance is `related` for `positive`, `negative`, `neutral`, and `unranked`; `unrelated` for `unrelated`; and `unknown` for `uncertain`. Relatedness counts a match of those buckets. When the gold label is `unrelated`, a point is awarded only if the reply is `unrelated`. When the gold label is about the company, a point is awarded only if the reply equals that verdict. Ties break to the higher relatedness count, then to the newer `vNNN`. If that still ties, the program prints the tie and does not pick a model by name.

The labeled set is a regression set stored as cases: article text, publisher, homepage, company names, an optional note, and the expected verdict. It starts from a hand-labeled sample of about 40 articles, including a Harvey company story and a Harvey non-company story, and grows when a real miss or a flagged `uncertain` row is labeled. Those rows are inserted into `cases`. They are not a JavaScript list.

## Consequences

Shared articles cost one call for the companies known at the time, plus another call if a new company appears. The corpus is not multiplied by the number of historical prompts. The README must name the winning model, why it won, the prompt shape, and the tally, and must say the set is not a random sample of the quarter. Which model wins is an empirical result, not decided here.
