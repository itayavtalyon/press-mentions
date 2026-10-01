/**
 * @typedef {object} OverlayEntry
 * @property {string} [descriptor] One line that tells the company apart from namesakes.
 * @property {string[]} [queryTerms] Terms that narrow the Google query.
 * @property {string[]} [aliases] Replaces the aliases parsed from the seed line.
 */

/**
 * @typedef {import("./seed.js").SeedCompany & { descriptor: string | undefined, queryTerms: string[] }} Company
 */

/**
 * Validates the parsed overlay file (ADR 0003).
 * @param {unknown} value Parsed JSON.
 * @returns {Map<string, OverlayEntry>} Entries keyed by seed line.
 * @throws {Error} The value or an entry has the wrong shape.
 */
export function parseOverlay(value) {
  if (!isPlainObject(value)) {
    throw new Error("Overlay must be a JSON object keyed by seed line");
  }
  return new Map(
    Object.entries(value).map(([line, entry]) => [
      line,
      parseEntry(line, entry),
    ]),
  );
}

/**
 * Adds descriptors and query terms to the seed. The overlay never adds or removes a company.
 * @param {import("./seed.js").SeedCompany[]} seed Companies from the seed file.
 * @param {Map<string, OverlayEntry>} overlay Entries keyed by seed line.
 * @returns {Company[]} The seed companies, in seed order, with overlay fields applied.
 * @throws {Error} An overlay entry matches no seed line.
 */
export function applyOverlay(seed, overlay) {
  const lines = new Set(seed.map((company) => company.displayName));
  for (const line of overlay.keys()) {
    if (!lines.has(line)) {
      throw new Error(
        `Overlay entry "${line}" matches no seed line. The overlay cannot add a company`,
      );
    }
  }

  return seed.map((company) => {
    const entry = overlay.get(company.displayName) ?? {};
    return {
      ...company,
      aliases: entry.aliases ?? company.aliases,
      descriptor: entry.descriptor,
      queryTerms: entry.queryTerms ?? [],
    };
  });
}

/**
 * @param {string} line Seed line the entry is keyed by.
 * @param {unknown} entry Raw entry.
 * @returns {OverlayEntry} The validated entry.
 */
function parseEntry(line, entry) {
  if (!isPlainObject(entry)) {
    throw new Error(`Overlay entry "${line}" must be an object`);
  }
  const { descriptor, queryTerms, aliases, ...unknown } = entry;
  const [unknownField] = Object.keys(unknown);
  if (unknownField !== undefined) {
    throw new Error(
      `Overlay entry "${line}" has unknown field "${unknownField}"`,
    );
  }

  return {
    ...(descriptor !== undefined && {
      descriptor: requireText(descriptor, `${line}.descriptor`),
    }),
    ...(queryTerms !== undefined && {
      queryTerms: requireTextList(queryTerms, `${line}.queryTerms`),
    }),
    ...(aliases !== undefined && {
      aliases: requireTextList(aliases, `${line}.aliases`),
    }),
  };
}

/**
 * @param {unknown} value Candidate.
 * @param {string} field Field path, for the error message.
 * @returns {string} The value, when it is a non-blank string.
 */
function requireText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Overlay field "${field}" must be a non-blank string`);
  }
  return value;
}

/**
 * @param {unknown} value Candidate.
 * @param {string} field Field path, for the error message.
 * @returns {string[]} The value, when it is an array of non-blank strings.
 */
function requireTextList(value, field) {
  if (!Array.isArray(value)) {
    throw new TypeError(`Overlay field "${field}" must be an array of strings`);
  }
  return value.map((item, index) => requireText(item, `${field}[${index}]`));
}

/**
 * @param {unknown} value Candidate.
 * @returns {value is Record<string, unknown>} True for a non-null, non-array object.
 */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
