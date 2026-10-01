import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

describe("loadConfig defaults", () => {
  it("uses the local database, host, model, and prompt version", () => {
    expect(loadConfig({}, "/work")).toEqual({
      databasePath: "/work/data/evaluation.sqlite",
      model: "gemma4:12b",
      ollamaHost: "http://127.0.0.1:11434",
      promptVersion: "v002",
    });
  });

  it("keeps an absolute database path and a configured model", () => {
    expect(
      loadConfig(
        {
          EVAL_DB: "/var/lib/evaluation.sqlite",
          MODEL: "qwen2.5:14b",
          PROMPT_VERSION: "v000",
        },
        "/work",
      ),
    ).toEqual({
      databasePath: "/var/lib/evaluation.sqlite",
      model: "qwen2.5:14b",
      ollamaHost: "http://127.0.0.1:11434",
      promptVersion: "v000",
    });
  });
});

describe("loadConfig checks", () => {
  it("rejects an empty database path", () => {
    expect(() => loadConfig({ EVAL_DB: "" }, "/work")).toThrow(
      /EVAL_DB is empty/u,
    );
  });

  it("rejects an empty Ollama host", () => {
    expect(() => loadConfig({ OLLAMA_HOST: "" }, "/work")).toThrow(
      /OLLAMA_HOST is empty/u,
    );
  });

  it("rejects an empty model name", () => {
    expect(() => loadConfig({ MODEL: "" }, "/work")).toThrow(/MODEL is empty/u);
  });

  it("rejects a prompt version that is not vNNN", () => {
    expect(() => loadConfig({ PROMPT_VERSION: "" }, "/work")).toThrow(
      /PROMPT_VERSION is empty/u,
    );
    expect(() => loadConfig({ PROMPT_VERSION: "2" }, "/work")).toThrow(
      /not a prompt version/u,
    );
  });
});
