import { defineValue, isRecord, ownValue } from "../../core/common.js";

import { PromptScore } from "./score.js";

/**
 * @typedef {import("../../core/classifier.js").Company} Company
 * @typedef {import("../../core/classifier.js").PromptParameters} PromptParameters
 */

/**
 * @typedef {object} EvalCase
 * @property {string} id Case id.
 * @property {PromptParameters} parameters Prompt inputs.
 * @property {Record<string, string>} expected Gold verdict by company name.
 */

/**
 * @param {string} text Company name.
 * @returns {boolean} True when the name would break a prompt line.
 */
function nameCannotBeRendered(text) {
  return (
    text === "" ||
    text.includes("\n") ||
    text.includes("{{") ||
    text.includes("\u{2014}")
  );
}

/**
 * @param {Company} company One company.
 * @param {EvalCase} evalCase Article that lists it.
 * @throws {Error} The company or its gold verdict cannot be used.
 */
function validateCompany(company, evalCase) {
  if (nameCannotBeRendered(company.name)) {
    throw new Error(
      `case ${evalCase.id} has a company name that cannot be rendered`,
    );
  }

  const extra = company.extra;

  if (extra !== undefined && (extra.includes("\n") || extra.includes("{{"))) {
    throw new Error(
      `case ${evalCase.id} has extra text that cannot be rendered`,
    );
  }

  const verdict = ownValue(evalCase.expected, company.name);

  if (typeof verdict !== "string" || !PromptScore.scorable(verdict)) {
    throw new Error(
      `case ${evalCase.id} expected result for ${company.name} cannot be scored`,
    );
  }
}

/**
 * @param {EvalCase} evalCase One article.
 * @throws {Error} Inputs and the expected result do not match.
 */
export function validateCase(evalCase) {
  const { companies, homepage, article } = evalCase.parameters;

  if (article === "" || evalCase.id === "") {
    throw new Error("case is missing an id or article");
  }

  if (!homepage.startsWith("https://")) {
    throw new Error(`case ${evalCase.id} homepage is not https`);
  }

  if (companies.length === 0) {
    throw new Error(`case ${evalCase.id} has no companies`);
  }

  /**
   * @type {Set<string>}
   */
  const names = new Set();

  for (const company of companies) {
    if (names.has(company.name)) {
      throw new Error(`case ${evalCase.id} repeats ${company.name}`);
    }

    names.add(company.name);
    validateCompany(company, evalCase);
  }

  if (Object.keys(evalCase.expected).length !== companies.length) {
    throw new Error(
      `case ${evalCase.id} expected result does not match the companies`,
    );
  }
}

/**
 * @param {unknown} value One company in the parameters JSON.
 * @param {string} caseId Case id, for the error.
 * @returns {Company} Company. A note is kept only when it has text.
 */
function companyFromJson(value, caseId) {
  if (!isRecord(value)) {
    throw new Error(`case ${caseId} has a company that is not an object`);
  }

  const name = ownValue(value, "name");

  if (typeof name !== "string") {
    throw new TypeError(`case ${caseId} has a company name that is not text`);
  }

  const extra = ownValue(value, "extra");

  if (extra === undefined || extra === "") {
    return { name };
  }

  if (typeof extra !== "string") {
    throw new TypeError(`case ${caseId} has extra text that is not text`);
  }

  return { extra, name };
}

/**
 * @param {unknown} value Stored JSON.
 * @param {string} caseId Case id, for the error.
 * @returns {PromptParameters} Prompt inputs.
 */
function parametersFromJson(value, caseId) {
  if (!isRecord(value)) {
    throw new TypeError(`case ${caseId} parameters are not an object`);
  }

  const article = ownValue(value, "article");
  const publisher = ownValue(value, "publisher");
  const homepage = ownValue(value, "homepage");
  const companies = ownValue(value, "companies");

  if (
    typeof article !== "string" ||
    typeof publisher !== "string" ||
    typeof homepage !== "string" ||
    !Array.isArray(companies)
  ) {
    throw new TypeError(`case ${caseId} parameters are not text`);
  }

  return {
    article,
    companies: companies.map((company) => companyFromJson(company, caseId)),
    homepage,
    publisher,
  };
}

/**
 * @param {unknown} value Stored JSON.
 * @param {Company[]} companies Companies from the parameters column.
 * @param {string} caseId Case id, for the error.
 * @returns {Record<string, string>} Gold verdict by company name.
 */
function expectedFromJson(value, companies, caseId) {
  if (!isRecord(value)) {
    throw new TypeError(`case ${caseId} expected result is not an object`);
  }

  /**
   * @type {Record<string, string>}
   */
  const expected = {};

  for (const company of companies) {
    const verdict = ownValue(value, company.name);

    if (typeof verdict !== "string") {
      throw new TypeError(
        `case ${caseId} expected result for ${company.name} is not text`,
      );
    }

    defineValue(expected, company.name, verdict);
  }

  return expected;
}

/**
 * @param {unknown} row Database row.
 * @returns {EvalCase} Case.
 */
export function caseFromRow(row) {
  if (!isRecord(row)) {
    throw new Error("stored case is not an object");
  }

  const id = ownValue(row, "id");
  const parametersJson = ownValue(row, "parameters_json");
  const expectedJson = ownValue(row, "expected_json");

  if (
    typeof id !== "string" ||
    typeof parametersJson !== "string" ||
    typeof expectedJson !== "string"
  ) {
    throw new TypeError("stored case has a field that is not text");
  }

  const parameters = parametersFromJson(JSON.parse(parametersJson), id);
  const expected = expectedFromJson(
    JSON.parse(expectedJson),
    parameters.companies,
    id,
  );
  const evalCase = { expected, id, parameters };
  validateCase(evalCase);

  return evalCase;
}
