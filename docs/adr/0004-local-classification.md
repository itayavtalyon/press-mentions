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

The live model id and prompt version are constants in code. An offline program reads a model name, runs every saved prompt on the labeled set, writes `model id`, `prompt id`, `score`, and `date` to the evaluation store, prints the scores, and marks the winner. A point requires the expected relevance outcome and, when the case is about the company, the expected tone. Ties break to the higher count of correct relatedness decisions, then to the newer prompt version. The program does not edit the constants. A running process keeps the pair it loaded. The next process reclassifies rows stored under a different pair, and it does not refetch those articles.

The labeled set is a regression set: company, text, text source, and expected verdict. It starts from a hand-labeled sample of about 40 articles, including a Harvey company story and a Harvey non-company story, and grows when a real miss or a flagged `uncertain` row is labeled.

## Consequences

Shared articles cost one call for the companies known at the time, plus another call if a new company appears. The corpus is not multiplied by the number of historical prompts. The README must name the winning model, why it won, the prompt shape, and the tally, and must say the set is not a random sample of the quarter. Which model wins is an empirical result, not decided here.
