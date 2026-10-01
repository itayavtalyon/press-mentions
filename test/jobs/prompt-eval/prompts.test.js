/* eslint-disable security/detect-non-literal-fs-filename -- The test writes a throwaway prompt directory. */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadPromptFiles } from "../../../src/jobs/prompt-eval/prompts.js";

describe("loadPromptFiles", () => {
  it("loads the repository prompts, oldest version first", () => {
    const prompts = loadPromptFiles();

    expect(prompts.map((prompt) => prompt.id)).toEqual([
      "v000",
      "v001",
      "v002",
    ]);
    expect(prompts[0]?.body.includes("namesake")).toBe(false);
    expect(prompts[1]?.body.includes("namesake")).toBe(true);
    expect(prompts[0]?.body.length).toBeLessThan(prompts[1]?.body.length ?? 0);
  });

  it("rejects a file that is not a classifier version", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "prompts-"));
    writeFileSync(path.join(directory, "notes.txt"), "hello");

    expect(() => loadPromptFiles(directory)).toThrow(/not classifier/u);
  });

  it("rejects a prompt that is missing a placeholder", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "prompts-"));
    writeFileSync(path.join(directory, "classifier.v000.txt"), "hello");

    expect(() => loadPromptFiles(directory)).toThrow(
      /missing \{\{article\}\}/u,
    );
  });

  it("rejects an empty prompt directory", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "prompts-"));

    expect(() => loadPromptFiles(directory)).toThrow(/no classifier prompts/u);
  });
});
/* eslint-enable security/detect-non-literal-fs-filename -- The throwaway directory is only used in this file. */
