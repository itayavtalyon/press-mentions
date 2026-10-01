import { describe, expect, it } from "vitest";

import { Classifier } from "../../src/core/classifier.js";

const PROMPT = {
  body: "{{article}}\n{{publisher}}\n{{homepage}}\n{{candidates}}",
  id: "v000",
  version: 0,
};

const classifier = new Classifier();

describe("Classifier request shape", () => {
  it("injects the model and leaves a company name alone when it has no note", () => {
    const request = classifier.request("qwen2.5:14b", PROMPT, {
      article: "Harvey raised funds.",
      companies: [{ name: "Harvey" }],
      homepage: "https://techcrunch.com",
      publisher: "TechCrunch",
    });

    expect(request.think).toBe(false);
    expect(request.model).toBe("qwen2.5:14b");
    expect(request.options).toEqual({
      num_ctx: Classifier.numCtx,
      seed: Classifier.seed,
      temperature: Classifier.temperature,
    });
    expect(request.format.required).toEqual(["Harvey"]);
    expect(request.prompt.endsWith("Harvey")).toBe(true);
    expect(request.prompt).toContain("https://techcrunch.com");
    expect(request.prompt).not.toContain("\u{2014}");
  });

  it("adds a company note only when one was stored", () => {
    const request = classifier.request("qwen2.5:14b", PROMPT, {
      article: "Harvey raised funds.",
      companies: [{ extra: "legal AI startup", name: "Harvey" }],
      homepage: "https://techcrunch.com",
      publisher: "TechCrunch",
    });

    expect(request.prompt).toContain("Harvey \u{2014} legal AI startup");
  });

  it("cuts the article to the classifier budget", () => {
    const article = "a".repeat(Classifier.articleCap + 1);
    const request = classifier.request("qwen2.5:14b", PROMPT, {
      article,
      companies: [{ name: "Harvey" }],
      homepage: "https://techcrunch.com",
      publisher: "TechCrunch",
    });

    expect(request.prompt.startsWith("a".repeat(Classifier.articleCap))).toBe(
      true,
    );
    expect(request.prompt.includes("a".repeat(Classifier.articleCap + 1))).toBe(
      false,
    );
  });
});

describe("Classifier request checks", () => {
  it("rejects a prompt that is missing a placeholder", () => {
    expect(() =>
      classifier.request(
        "qwen2.5:14b",
        { ...PROMPT, body: "no tokens" },
        {
          article: "Harvey",
          companies: [{ name: "Harvey" }],
          homepage: "https://techcrunch.com",
          publisher: "TechCrunch",
        },
      ),
    ).toThrow(/missing \{\{article\}\}/u);
  });

  it("rejects an input that contains a placeholder token", () => {
    expect(() =>
      classifier.request("qwen2.5:14b", PROMPT, {
        article: "see {{article}}",
        companies: [{ name: "Harvey" }],
        homepage: "https://techcrunch.com",
        publisher: "TechCrunch",
      }),
    ).toThrow(/placeholder token/u);
  });
});

describe("Classifier verdicts", () => {
  it("reads a verdict for each company that was asked", () => {
    expect(
      classifier.verdicts('{"Harvey":"positive"}', ["Harvey"]).get("Harvey"),
    ).toBe("positive");
  });

  it("treats a reply that is not an object as uncertain", () => {
    expect(classifier.verdicts("[]", ["Harvey"]).get("Harvey")).toBe(
      "uncertain",
    );
    expect(classifier.verdicts("nope", ["Harvey"]).get("Harvey")).toBe(
      "uncertain",
    );
  });

  it("rethrows when parsing fails for a reason other than bad JSON", () => {
    expect(() =>
      classifier.verdicts(
        /** @type {string} */ (/** @type {unknown} */ (Symbol("reply"))),
        ["Harvey"],
      ),
    ).toThrow(TypeError);
  });
});
