import { defineValue, isRecord, ownValue } from "./common.js";

/**
 * Verdicts a classifier reply may use. Scoring against an expected result lives in the prompt-eval job.
 * @type {readonly string[]}
 */
export const VERDICT_NAMES = [
  "positive",
  "negative",
  "neutral",
  "unranked",
  "unrelated",
  "uncertain",
];

const TOKENS = [
  "{{article}}",
  "{{publisher}}",
  "{{homepage}}",
  "{{candidates}}",
];

/**
 * @typedef {object} PromptVersion
 * @property {string} id Version id, such as `v000`.
 * @property {number} version Numeric version.
 * @property {string} body Prompt file text.
 */

/**
 * @typedef {object} Company
 * @property {string} name Company name.
 * @property {string} [extra] Note that helps the model. Omitted when we have none.
 */

/**
 * @typedef {object} PromptParameters
 * @property {string} article Article body or title.
 * @property {string} publisher Publication name.
 * @property {string} homepage Publication homepage.
 * @property {Company[]} companies Companies judged on this article.
 */

/**
 * @typedef {object} ClassifierRequest
 * @property {string} model Installed model name.
 * @property {string} prompt Rendered prompt.
 * @property {false} think Thinking is off for this call.
 * @property {{ type: string, properties: Record<string, { type: string, enum: string[] }>, required: string[], additionalProperties: boolean }} format JSON schema for the reply.
 * @property {{ temperature: number, seed: number, num_ctx: number }} options Sampling options.
 */

/**
 * Builds one classification call and reads the reply. It does not know the expected result.
 */
export class Classifier {
  static temperature = 0;
  static seed = 0;
  static numCtx = 8192;
  static articleCap = 6000;

  /**
   * @param {string} model Installed model name.
   * @param {PromptVersion} prompt Prompt version to inject.
   * @param {PromptParameters} parameters Prompt inputs for one article.
   * @returns {ClassifierRequest} Chat request.
   */
  request(model, prompt, parameters) {
    const names = parameters.companies.map((company) => company.name);
    const rendered = fillPrompt(prompt.body, {
      article: capArticle(parameters.article),
      candidates: companyLines(parameters.companies),
      homepage: parameters.homepage,
      publisher: parameters.publisher,
    });

    return {
      format: verdictSchema(names),
      model,
      options: {
        num_ctx: Classifier.numCtx,
        seed: Classifier.seed,
        temperature: Classifier.temperature,
      },
      prompt: rendered,
      think: false,
    };
  }

  /**
   * @param {string} reply Model reply body.
   * @param {string[]} names Company names sent in the call.
   * @returns {Map<string, string>} Verdict by company name. A missing or unknown value is `uncertain`.
   */
  verdicts(reply, names) {
    return verdictsFromReply(reply, names);
  }
}

/**
 * @param {string} text Article body or title.
 * @returns {string} Text cut to the classifier budget.
 */
function capArticle(text) {
  return text.length <= Classifier.articleCap
    ? text
    : text.slice(0, Classifier.articleCap);
}

/**
 * @param {Company[]} companies Companies for this call.
 * @returns {string} One company per line. A note is added only when present.
 */
function companyLines(companies) {
  return companies
    .map((company) => {
      return company.extra === undefined || company.extra === ""
        ? company.name
        : `${company.name} \u{2014} ${company.extra}`;
    })
    .join("\n");
}

/**
 * @param {string[]} names Company names.
 * @returns {ClassifierRequest["format"]} Ollama `format` schema.
 */
function verdictSchema(names) {
  /**
   * @type {ClassifierRequest["format"]["properties"]}
   */
  const properties = {};

  for (const name of names) {
    defineValue(properties, name, { enum: [...VERDICT_NAMES], type: "string" });
  }

  return {
    additionalProperties: false,
    properties,
    required: [...names],
    type: "object",
  };
}

/**
 * @param {string} template Prompt file body.
 * @param {{ article: string, publisher: string, homepage: string, candidates: string }} fields Values.
 * @returns {string} Prompt ready to send.
 */
function fillPrompt(template, fields) {
  for (const token of TOKENS) {
    if (!template.includes(token)) {
      throw new Error(`prompt is missing ${token}`);
    }
  }

  const values = [
    fields.article,
    fields.publisher,
    fields.homepage,
    fields.candidates,
  ];

  for (const value of values) {
    if (value.includes("{{")) {
      throw new Error("prompt field contains a placeholder token");
    }
  }

  return template
    .split("{{article}}")
    .join(fields.article)
    .split("{{publisher}}")
    .join(fields.publisher)
    .split("{{homepage}}")
    .join(fields.homepage)
    .split("{{candidates}}")
    .join(fields.candidates);
}

/**
 * @param {string} raw Model reply body.
 * @returns {object} A JSON object. Unusable replies become an empty object.
 */
function parseReplyObject(raw) {
  try {
    const value = JSON.parse(raw);

    if (isRecord(value)) {
      return value;
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
  }

  return {};
}

/**
 * @param {object} parsed Reply object.
 * @param {string} name Company name.
 * @returns {string} A known verdict, or `uncertain`.
 */
function verdictOrUncertain(parsed, name) {
  const value = ownValue(parsed, name);

  return typeof value !== "string" || !VERDICT_NAMES.includes(value)
    ? "uncertain"
    : value;
}

/**
 * @param {string} raw Model reply body.
 * @param {string[]} names Company names sent in the call.
 * @returns {Map<string, string>} Verdict by company name.
 */
function verdictsFromReply(raw, names) {
  const parsed = parseReplyObject(raw);
  /**
   * @type {Map<string, string>}
   */
  const verdicts = new Map();

  for (const name of names) {
    verdicts.set(name, verdictOrUncertain(parsed, name));
  }

  return verdicts;
}
