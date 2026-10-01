import path from "node:path";

import { ownValue } from "./core/common.js";

const DEFAULT_DATABASE = "data/evaluation.sqlite";
const DEFAULT_HOST = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "gemma4:12b";
const DEFAULT_PROMPT_VERSION = "v002";
const PROMPT_VERSION_PATTERN = /^v\d{3}$/u;

/**
 * @typedef {object} AppConfig
 * @property {string} databasePath Evaluation SQLite path.
 * @property {string} ollamaHost Ollama host.
 * @property {string} model Classifier model name.
 * @property {string} promptVersion Classifier prompt id, such as `v002`.
 */

/**
 * Read every environment setting. Jobs do not read these variables themselves.
 * @param {Record<string, string | undefined>} environment Process environment.
 * @param {string} cwd Working directory for a relative database path.
 * @returns {AppConfig} Settings.
 */
export function loadConfig(environment, cwd) {
  const databasePath = setting(environment, "EVAL_DB", DEFAULT_DATABASE);

  return {
    databasePath: path.isAbsolute(databasePath)
      ? databasePath
      : path.join(cwd, databasePath),
    model: setting(environment, "MODEL", DEFAULT_MODEL),
    ollamaHost: setting(environment, "OLLAMA_HOST", DEFAULT_HOST),
    promptVersion: promptVersion(environment),
  };
}

/**
 * @param {Record<string, string | undefined>} environment Process environment.
 * @param {string} name Variable name.
 * @param {string} fallback Value used when the variable is absent.
 * @returns {string} Configured text.
 */
function setting(environment, name, fallback) {
  const value = ownValue(environment, name);

  if (value === "") {
    throw new Error(`${name} is empty`);
  }

  return typeof value === "string" ? value : fallback;
}

/**
 * @param {Record<string, string | undefined>} environment Process environment.
 * @returns {string} Prompt id, such as `v002`.
 */
function promptVersion(environment) {
  const value = setting(environment, "PROMPT_VERSION", DEFAULT_PROMPT_VERSION);

  if (!PROMPT_VERSION_PATTERN.test(value)) {
    throw new Error("PROMPT_VERSION is not a prompt version");
  }

  return value;
}
