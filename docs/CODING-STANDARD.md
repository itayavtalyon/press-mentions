# Coding standard

JavaScript source, typed with JSDoc and checked by TypeScript. Do not add `.ts` files. The assignment asks for JavaScript on Node.

`eslint.config.js` and `tsconfig.json` are the mechanical half. This file is the half those tools do not enforce. An implementer follows both.

## Types

`tsconfig.json` already sets `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, and `noUnusedParameters`. JSDoc mode is `typescript`.

- No `any`. Name the type, or use `unknown` and narrow it.
- No `@ts-ignore` and no `@ts-expect-error`.
- No cast that skips a check. A cast is allowed only at a boundary, after a check, with a comment that says what was checked. Prefer a type guard.
- JSON, RSS, and model replies enter as `unknown`. A parser narrows them before any other module sees them.
- Optional means omitted. With `exactOptionalPropertyTypes`, do not assign `undefined` to an optional property.
- An index read may be missing. Handle that at the read.
- Exported functions have a JSDoc `@param` and `@returns`.
- Named exports only. Import with the `.js` extension.

## Values

- Ids, guids, and verdicts stay `string`. Do not invent branded types.
- Throw `Error` with a message that names the bad value. Do not add a Result type. Do not catch an error and continue.
- Request validation returns field problems (`src/core/filters.js`, the address rule in `src/core/dashboard.js`). Bad user input is expected output, not an error.
- The live model and prompt version are `LIVE_MODEL` and `LIVE_PROMPT_VERSION` in `src/core/classifier.js`. They are not environment variables.
- A clock and a random source are arguments on any unit a test must control. Adapters that wait or jitter take them. Do not call `Date.now` or `Math.random` inside that unit. An entry shim may construct the system clock and pass it in.

## Shape

ESLint already rejects complexity above 10, depth above 3, more than 4 parameters, functions over 60 lines, and files over 300 lines.

A model is one file and one job. The file name is the job. A reader opens that file and sees the whole job, including the helpers only that job uses.

Apply SOLID inside that shape. Do not apply it by adding a base class, a factory, or a file per function. That hides the job and makes more files.

- One reason to change. Scoring a prompt and storing a case are different models. Parsing a seed line and building that company's query are the same model.
- Change a model by editing its file. A new file is allowed for a second implementation of a port from ADR 0006 (feed, resolver, fetcher, extractor, classifier, rate limiter, sender) or for a model in the table below that does not exist yet. A new behavior of an existing model is an edit.
- No subclasses. Another implementation of a port accepts the same calls and reports failure the same way.
- A port exports the calls its caller makes. Do not add a method for a caller that does not exist.
- A job receives its ports as arguments. `src/core` does not import an adapter. The entry file wires the adapters.

Fewer files:

- Do not add a file for a function, a typedef, or a utility.
- A helper with one caller stays in that caller's file.
- `src/core/common.js` is only `ownValue`, `defineValue`, and `isRecord`. Nothing else goes there.
- One test file per model file. Do not add a test file per private function. When a model's tests pass 300 lines, they may split by scenario into `<model>-<scenario>.test.js` (decided 2026-10-02 for the pipeline jobs).
- The 300-line limit is the point where a file must be split. Split only into two models that each have their own reason to change, and name both for that reason.

| Model            | File                              | In charge of                                                                                |
| ---------------- | --------------------------------- | ------------------------------------------------------------------------------------------- |
| Company          | `src/core/company.js`             | The seed line, the overlay, and the Google query                                            |
| Collection       | `src/core/collection.js`          | UTC windows, the week slices, the 150 cap, and the backfill feed steps                      |
| Mention status   | `src/core/mention-status.js`      | How many days since a mention                                                               |
| Classifier       | `src/core/classifier.js`          | One Ollama call and the verdicts in the reply. Not the gold score                           |
| Coverage         | `src/infra/coverage-store.js`     | Companies, article rows from the feed, and company links                                    |
| Stage queue      | `src/infra/stage-queue.js`        | Which articles a text step reads, and the writes that advance its stage                     |
| Alerts           | `src/infra/alerts-store.js`       | Subscriptions, notified rows, and the outbox                                                |
| Evaluation store | `src/jobs/prompt-eval/store.js`   | The `cases` and `scores` tables                                                             |
| Prompt score     | `src/jobs/prompt-eval/score.js`   | Points and relatedness against a gold label                                                 |
| Prompts          | `src/jobs/prompt-eval/prompts.js` | Reading `prompt/classifier.vNNN.txt`                                                        |
| Evaluation run   | `src/jobs/prompt-eval/run.js`     | Looping models, prompts, and cases, and printing the winner                                 |
| HTTP             | `src/infra/http.js`               | Fetch and backoff. The token bucket stays in `src/infra/rate-limiter.js`                    |
| Article fetcher  | `src/infra/article-fetcher.js`    | Public http(s) check, then the publisher GET                                                |
| Extractor        | `src/infra/extractor.js`          | Readability text on a linkedom document                                                     |
| Google News      | `src/infra/google-news.js`        | The RSS request                                                                             |
| Resolver         | `src/infra/resolver.js`           | One article page per `sign`. `post` sends one `batchexecute` POST for the array it is given |
| Ollama           | `src/infra/ollama.js`             | Listing models and sending chat                                                             |
| SQLite           | `src/infra/database.js`           | Opening the file. It does not know table names                                              |
| Config           | `src/config.js`                   | Environment variables                                                                       |
| Filters          | `src/core/filters.js`             | The query string: window, custom dates, and verdict                                         |
| Dashboard        | `src/core/dashboard.js`           | Index order, tallies, last mentioned, collection start, the address rule                    |
| Coverage read    | `src/infra/coverage-read.js`      | Dashboard queries on the coverage store                                                     |
| Server           | `src/server/app.js`               | Host check, routes, methods, headers, static files, the 500 boundary                        |
| Page replies     | `src/server/pages.js`             | What each page reads from the stores, and its status                                        |
| Subscription     | `src/server/subscription.js`      | The subscribe POST: guard, body, address, insert, page or JSON                              |
| Markup           | `src/ui/pages/markup.js`          | The escaping `html` tag and `safeHref`                                                      |
| Page shell       | `src/ui/pages/page.js`            | UTC format helpers, `<time>`, and the layout around every page                              |
| Parts            | `src/ui/pages/parts.js`           | Components more than one page uses, and the article link rule                               |
| Filter form      | `src/ui/pages/filter-form.js`     | The filter form, its error copy, and the window sentence                                    |
| Index page       | `src/ui/pages/index-page.js`      | `GET /`                                                                                     |
| Company page     | `src/ui/pages/company-page.js`    | `GET /companies/:id`: head, summary, empty states, and outcomes                             |
| Mention list     | `src/ui/pages/mention.js`         | Verdict sections, one mention, its link, and its excerpt                                    |
| Subscribe form   | `src/ui/pages/subscribe-form.js`  | Button, dialog, inline form, banners, and every subscribe message                           |
| Review page      | `src/ui/pages/review-page.js`     | `GET /review`                                                                               |
| Message pages    | `src/ui/pages/message-pages.js`   | 404, 403, and 500                                                                           |
| Page script      | `src/ui/browser/app.js`           | Entry: local times, auto-submit, focus restore, invoker fallback                            |
| Name filter      | `src/ui/browser/name-filter.js`   | Index rows filtered by name and alias, debounced count, Clear                               |
| Subscribe dialog | `src/ui/browser/subscribe.js`     | The dialog's JSON submit and its outcome in the dialog                                      |
| Lock, clock, log | the file of that name             | That one resource                                                                           |

`seed.js`, `overlay.js`, `query.js`, `select.js`, and `collect.js` are the company and collection models before they were grouped. `rows.js` and `report.js` belong to the evaluation store and the evaluation run. When a change touches one of those files, move the code into the model file in the table and delete the old file once nothing imports it. Do not add another file beside them. Entry shims (`src/jobs/backfill.js`, `src/jobs/feed.js`, `src/jobs/unwrap.js`, `src/jobs/fetch.js`, `src/jobs/extract.js`, `src/jobs/classify.js`, `src/jobs/digest.js`, `src/jobs/prompt-eval/index.js`, `src/server/index.js`) stay thin: read config, build adapters, call one function, set the exit code.
