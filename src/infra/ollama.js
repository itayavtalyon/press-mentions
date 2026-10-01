import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { Ollama } from "ollama";

const execFileText = promisify(execFile);
const EMBEDDING_NAME = /embed/iu;

/**
 * @typedef {object} ExecResult
 * @property {string} stdout Text printed by `ollama list`.
 */

/**
 * @typedef {import("../core/classifier.js").ClassifierRequest} ClassifierRequest
 */

/**
 * @typedef {object} OllamaPorts
 * @property {import("ollama").Ollama} [client] Chat client. Defaults to one for `host`.
 * @property {(file: string, commandArguments: string[], options: { encoding: "utf8", env: Record<string, string | undefined> }) => Promise<ExecResult>} [execFile] `ollama list` runner. Defaults to the CLI.
 */

/**
 * Installed models and one chat completion. Callers do not talk to Ollama directly.
 */
export class OllamaClient {
  /**
   * @param {string} text `ollama list` table.
   * @returns {{ chat: string[], skipped: string[] }} Chat models, and embedding models left out.
   * @throws {Error} No chat model is installed.
   */
  static chatModels(text) {
    /**
     * @type {string[]}
     */
    const chat = [];
    /**
     * @type {string[]}
     */
    const skipped = [];

    for (const name of modelNames(text)) {
      if (EMBEDDING_NAME.test(name)) {
        skipped.push(name);
        continue;
      }

      chat.push(name);
    }

    if (chat.length === 0) {
      throw new Error("no installed chat models");
    }

    return { chat, skipped };
  }

  /**
   * @type {string}
   */
  #host;

  /**
   * @type {import("ollama").Ollama}
   */
  #client;

  /**
   * @type {NonNullable<OllamaPorts["execFile"]>}
   */
  #execFile;

  /**
   * @param {string} host Ollama host, including the scheme.
   * @param {OllamaPorts} [ports] Replacements for tests.
   */
  constructor(host, ports = {}) {
    this.#host = host;
    this.#client = ports.client ?? new Ollama({ host });
    this.#execFile = ports.execFile ?? execFileText;
  }

  /**
   * @param {Record<string, string | undefined>} environment Environment for the child process.
   * @returns {Promise<string>} `ollama list` table.
   */
  async list(environment) {
    const result = await this.#execFile("ollama", ["list"], {
      encoding: "utf8",
      env: { ...environment, OLLAMA_HOST: this.#host },
    });

    if (typeof result.stdout !== "string") {
      throw new TypeError("ollama list returned no text");
    }

    return result.stdout;
  }

  /**
   * @param {ClassifierRequest} request Built classifier request.
   * @returns {Promise<string>} Reply text.
   */
  async chat(request) {
    const response = await this.#client.chat({
      format: request.format,
      messages: [{ content: request.prompt, role: "user" }],
      model: request.model,
      options: request.options,
      stream: false,
      think: false,
    });
    const content = response.message?.content;

    if (typeof content !== "string") {
      throw new TypeError("Ollama reply content is missing");
    }

    return content;
  }
}

/**
 * @param {string} text `ollama list` table.
 * @returns {string[]} Model names in table order, including embedding models.
 */
function modelNames(text) {
  /**
   * @type {string[]}
   */
  const names = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();

    if (trimmed === "" || trimmed.startsWith("NAME")) {
      continue;
    }

    const name =
      /**
       * @type {string}
       */
      (trimmed.split(/\s+/u, 1)[0]);
    names.push(name);
  }

  return names;
}
