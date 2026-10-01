import { loadConfig } from "../../config.js";
import { SqliteDatabase } from "../../infra/database.js";
import { OllamaClient } from "../../infra/ollama.js";

import { loadPromptFiles } from "./prompts.js";
import { runPromptEval } from "./run.js";
import { EvaluationStore } from "./store.js";

/**
 * @returns {Promise<number>} Process status.
 */
async function main() {
  const config = loadConfig(process.env, process.cwd());
  const code = await runPromptEval({
    cwd: process.cwd(),
    env: process.env,
    loadPrompts: loadPromptFiles,
    monotonicMs: () => performance.now(),
    now: () => new Date(),
    ollama: new OllamaClient(config.ollamaHost),
    openStore: (databasePath) =>
      new EvaluationStore(new SqliteDatabase(databasePath)),
    stderr: (text) => {
      console.error(text);
    },
    stdout: (text) => {
      console.log(text);
    },
  });

  return code;
}

// eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit -- The shell needs the eval status.
process.exit(await main());
