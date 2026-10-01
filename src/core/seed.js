/**
 * @typedef {object} SeedCompany
 * @property {string} id Slug of the query name. Stable while the seed line keeps its name.
 * @property {string} displayName The seed line as given.
 * @property {string} queryName The name before any parenthetical.
 * @property {string[]} aliases The parenthetical, without a leading "formerly" or "formerly known as".
 */

/**
 * Prefixes stripped from a parenthetical, longest first. Matched after whitespace is collapsed.
 */
const FORMERLY_PREFIXES = ["formerly known as ", "formerly "];

/**
 * Parses the seed file: one company per line, blank lines ignored (ADR 0003).
 * @param {string} text Contents of the seed file.
 * @returns {SeedCompany[]} Companies in file order.
 * @throws {Error} A line is malformed, two lines share an id, or there are no companies.
 */
export function parseSeed(text) {
  const companies = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => parseSeedLine(line));

  if (companies.length === 0) {
    throw new Error("Seed has no companies");
  }
  assertUniqueIds(companies);
  return companies;
}

/**
 * Parses one seed line. `A (formerly B)`, `A (formerly known as B)`, and `A (B)` all give alias `B`.
 * @param {string} line A trimmed, non-empty seed line.
 * @returns {SeedCompany} The parsed company.
 * @throws {Error} The parenthetical is empty, nested, not at the end, or has no name before it.
 */
function parseSeedLine(line) {
  const open = line.indexOf("(");
  if (open === -1 && line.includes(")")) {
    throw new Error(`Seed line "${line}" has ")" without "("`);
  }
  if (open === -1) {
    return {
      id: slugify(line, line),
      displayName: line,
      queryName: line,
      aliases: [],
    };
  }

  const queryName = line.slice(0, open).trim();
  const inner = line.slice(open + 1, -1).trim();
  const alias = stripFormerly(inner);
  const wellFormed =
    line.endsWith(")") &&
    !inner.includes("(") &&
    !inner.includes(")") &&
    queryName !== "" &&
    alias !== "";
  if (!wellFormed) {
    throw new Error(`Seed line "${line}" must be "Name" or "Name (alias)"`);
  }
  return {
    id: slugify(queryName, line),
    displayName: line,
    queryName,
    aliases: [alias],
  };
}

/**
 * @param {string} inner Parenthetical contents, trimmed.
 * @returns {string} The alias: whitespace collapsed, without a leading "formerly" or "formerly known as".
 */
function stripFormerly(inner) {
  const text = `${inner.replaceAll(/\s+/gu, " ")} `;
  const prefix = FORMERLY_PREFIXES.find((candidate) =>
    text.toLowerCase().startsWith(candidate),
  );
  return text.slice(prefix?.length ?? 0).trim();
}

/**
 * @param {string} name Name to slug.
 * @param {string} line Seed line, for the error message.
 * @returns {string} Lowercase ASCII letters and digits joined by single dashes.
 */
function slugify(name, line) {
  const slug = name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");
  if (slug === "") {
    throw new Error(
      `Seed line "${line}" has no letters or digits to build an id from`,
    );
  }
  return slug;
}

/**
 * @param {SeedCompany[]} companies Parsed companies.
 * @throws {Error} Two companies share an id.
 */
function assertUniqueIds(companies) {
  /**
   * @type {Map<string, string>}
   */
  const seen = new Map();
  for (const company of companies) {
    const earlier = seen.get(company.id);
    if (earlier !== undefined) {
      throw new Error(
        `Seed lines "${earlier}" and "${company.displayName}" share the id "${company.id}"`,
      );
    }
    seen.set(company.id, company.displayName);
  }
}
