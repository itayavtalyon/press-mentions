# Engineering notes

## Prompt evaluator

Locked with Itay on 2026-09-30. The boundaries below were corrected on 2026-10-01 after review.

### Boundaries

The next change should keep these splits. They were mixed once, and that was the mistake.

- Shared helpers live in `src/core/common.js`: `ownValue`, `defineValue`, and `isRecord`. A helper used by more than one model goes there. A helper used by one model stays in that model. Do not add another one-function utility file.
- `Classifier` in `src/core/classifier.js` builds one Ollama call and reads verdicts from the reply. It has no expected answer. Production will use this same class.
- Scoring, gold labels, and anything that exists only because we already know the right result live in the prompt-eval job. `PromptScore` in `src/jobs/prompt-eval/score.js` compares classifier verdicts with `expected_json`. Do not put `score` back on the classifier.
- Evaluation cases are rows in the evaluation SQLite database. There is no JavaScript case list and the job does not seed an empty table. An empty `cases` table fails the run. Do not recreate a `cases.js` seed.
- `SqliteDatabase` in `src/infra/database.js` opens SQLite, sets WAL and the busy timeout, and runs SQL. It does not know table names. `EvaluationStore` is the model that knows the `cases` and `scores` tables, the queries, and the writes. Another database gets its own store model on top of `SqliteDatabase`. Do not open `better-sqlite3` from a job or from core.
- A company note is optional. Store one only when we have it. The database includes a few easy cases that do carry a note, so that path is real data.
- Environment settings are read only in `src/config.js`. That includes `COVERAGE_DB`, `GOOGLE_TOKEN_MS`, the evaluation database, the Ollama host, the classifier model (`MODEL`), and the classifier prompt (`PROMPT_VERSION`, such as `v002`). Do not read those variables inside a job. `src/infra/database.js` opens SQLite. Each store knows its own tables. The prompt-eval job still scores every installed chat model and every saved prompt; the configured pair is the one classification uses.

### Behavior

- One Ollama chat call per article. The reply is a JSON object keyed by the exact company names. Verdicts are `positive`, `negative`, `neutral`, `unranked`, `unrelated`, or `uncertain`.
- Placeholders in `prompt/classifier.vNNN.txt` are `{{article}}`, `{{publisher}}`, `{{homepage}}`, and `{{candidates}}`. A company line is `Name — note` only when that company has a note.
- Each case is one SQLite row. `parameters_json` is the prompt input (article, publisher, homepage, companies). `expected_json` is the gold verdict by company name.
- `v000` is a short baseline. `v001` and `v002` are two different classifying prompts.
- Models come from the `ollama list` table. Names matching `/embed/i` are skipped. A name such as `bge-m3` is treated as a chat model.
- `OllamaClient` in `src/infra/ollama.js` lists models and sends the chat. The job injects the prompt version and the model into `Classifier`, then asks `PromptScore` to tally the reply.
- `scores` stores `model_id`, `prompt_id`, `score`, `relatedness_correct`, `seconds_per_case`, and `scored_at`.
- A point requires the expected relevance and, when the article is about the company, the expected tone. Ties break to higher relatedness, then the newer prompt version.
- Call options on `Classifier`: temperature 0, seed 0, `num_ctx` 8192. Article text is capped at 6000 characters.
- `npm run verify` does not call Ollama. `npm run job:eval` is the live run.
