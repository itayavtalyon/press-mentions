/* eslint-disable security/detect-non-literal-fs-filename -- Prompt files are read from the prompt directory by the classifier.vNNN.txt name rule. */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILE_PATTERN = /^classifier\.v(\d{3})\.txt$/u;

const TOKENS = [
  "{{article}}",
  "{{publisher}}",
  "{{homepage}}",
  "{{candidates}}",
];

/**
 * @returns {string} Repository `prompt` directory.
 */
function defaultDirectory() {
  return fileURLToPath(new URL("../../../prompt/", import.meta.url));
}

/**
 * @param {string} body Prompt text.
 * @param {string} id Prompt id.
 * @throws {Error} A required placeholder is missing.
 */
function assertPlaceholders(body, id) {
  for (const token of TOKENS) {
    if (!body.includes(token)) {
      throw new Error(`prompt ${id} is missing ${token}`);
    }
  }
}

/**
 * @param {string} name File name.
 * @param {string} directory Directory that contains it.
 * @returns {import("../../core/classifier.js").PromptVersion} Prompt.
 */
function promptFromFile(name, directory) {
  const match = FILE_PATTERN.exec(name);

  if (match === null) {
    throw new Error(`prompt file ${name} is not classifier.vNNN.txt`);
  }

  const versionText =
    /**
     * @type {string}
     */
    (match[1]);
  const body = readFileSync(path.join(directory, name), "utf8");
  const id = `v${versionText}`;
  assertPlaceholders(body, id);

  return { body, id, version: Number(versionText) };
}

/**
 * Load `classifier.vNNN.txt` files, oldest version first.
 * @param {string} [directory] Prompt directory. Defaults to the repository folder.
 * @returns {import("../../core/classifier.js").PromptVersion[]} Prompts.
 */
export function loadPromptFiles(directory = defaultDirectory()) {
  const names = readdirSync(directory);

  if (names.length === 0) {
    throw new Error("no classifier prompts");
  }

  const prompts = names.map((name) => promptFromFile(name, directory));
  prompts.sort((left, right) => left.version - right.version);

  return prompts;
}
/* eslint-enable security/detect-non-literal-fs-filename -- Prompt paths are limited to classifier.vNNN.txt names. */
