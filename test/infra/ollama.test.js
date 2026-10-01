import { describe, expect, it } from "vitest";

import { OllamaClient } from "../../src/infra/ollama.js";

/**
 * @type {import("../../src/core/classifier.js").ClassifierRequest}
 */
const REQUEST = {
  format: {
    additionalProperties: false,
    properties: {},
    required: [],
    type: "object",
  },
  model: "qwen2.5:14b",
  options: { num_ctx: 8192, seed: 0, temperature: 0 },
  prompt: "hello",
  think: false,
};

describe("OllamaClient.list", () => {
  it("runs ollama list against the configured host", async () => {
    /**
     * @type {object[]}
     */
    const seen = [];
    const client = new OllamaClient("http://127.0.0.1:9", {
      execFile: async (file, commandArguments, options) => {
        seen.push({ commandArguments, file, host: options.env.OLLAMA_HOST });
        return { stdout: "NAME ID\n" };
      },
    });

    await expect(client.list({})).resolves.toBe("NAME ID\n");
    expect(seen).toEqual([
      {
        commandArguments: ["list"],
        file: "ollama",
        host: "http://127.0.0.1:9",
      },
    ]);
  });

  it("throws when the command returns no text", async () => {
    const client = new OllamaClient("http://127.0.0.1:9", {
      execFile: async () =>
        /** @type {{ stdout: string }} */ (
          /** @type {unknown} */ ({ stdout: undefined })
        ),
    });

    await expect(client.list({})).rejects.toThrow(/no text/u);
  });
});

describe("OllamaClient.chat", () => {
  it("sends one chat request and returns the reply text", async () => {
    /**
     * @type {object[]}
     */
    const seen = [];
    const client = new OllamaClient("http://127.0.0.1:9", {
      client: /** @type {import("ollama").Ollama} */ (
        /** @type {unknown} */ ({
          chat: async (/** @type {object} */ request) => {
            seen.push(request);
            return { message: { content: "{}" } };
          },
        })
      ),
    });

    await expect(client.chat(REQUEST)).resolves.toBe("{}");
    expect(seen[0]).toMatchObject({ stream: false, think: false });
  });

  it("throws when the reply has no text", async () => {
    const client = new OllamaClient("http://127.0.0.1:9", {
      client: /** @type {import("ollama").Ollama} */ (
        /** @type {unknown} */ ({
          chat: async () => ({ message: {} }),
        })
      ),
    });

    await expect(client.chat(REQUEST)).rejects.toThrow(/content is missing/u);
  });
});

describe("OllamaClient.chatModels", () => {
  it("skips embedding models and keeps chat models", () => {
    expect(
      OllamaClient.chatModels(
        "NAME ID\nqwen2.5:14b a\nnomic-embed-text:latest b\n",
      ),
    ).toEqual({
      chat: ["qwen2.5:14b"],
      skipped: ["nomic-embed-text:latest"],
    });
  });

  it("throws when every installed model is an embedding model", () => {
    expect(() =>
      OllamaClient.chatModels("NAME ID\nnomic-embed-text:latest b\n"),
    ).toThrow(/no installed chat models/u);
  });
});
