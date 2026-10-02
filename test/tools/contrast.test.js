import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { checkContrast, ratio, readTokens } from "../../tools/contrast.mjs";

// eslint-disable-next-line security/detect-non-literal-fs-filename -- The served stylesheet, a repository file.
const APP_CSS = readFileSync(
  new URL("../../src/ui/browser/app.css", import.meta.url),
  "utf8",
);

describe("ratio", () => {
  it("is 21:1 for black on white in either order and 1:1 for a color on itself", () => {
    expect(ratio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(ratio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(ratio("#1d4ed8", "#1d4ed8")).toBe(1);
  });
});

describe("readTokens", () => {
  it("reads light tokens from :root and lets the dark block override them", () => {
    const tokens = readTokens(`
:root {
  --text: #111111;
  --bg: #FFFFFF;
  --space-1: 0.25rem;
}
@media (prefers-color-scheme: dark) {
  :root {
    --text: #eeeeee;
  }
}
`);

    expect(Object.fromEntries(tokens.light)).toEqual({
      bg: "#ffffff",
      text: "#111111",
    });
    expect(Object.fromEntries(tokens.dark)).toEqual({
      bg: "#ffffff",
      text: "#eeeeee",
    });
  });

  it("throws when the stylesheet has no dark block", () => {
    expect(() => readTokens(":root { --text: #111111; }")).toThrow(
      "prefers-color-scheme: dark",
    );
  });

  it("throws when the stylesheet has no :root block", () => {
    expect(() => readTokens("body { color: red; }")).toThrow(":root");
  });
});

describe("checkContrast", () => {
  it("passes every pair in the served stylesheet, light and dark", () => {
    const { failures, report } = checkContrast(APP_CSS);

    expect(failures).toBe(0);
    expect(report).toContain("| light | text `#151a22` | bg `#f6f7f9` |");
    expect(report).toContain("| dark | text `#e6e9ef` | bg `#0e1116` |");
    expect(report).toMatch(/0 failing pair\(s\)\.$/u);
  });

  it("fails a pair under its minimum and counts it", () => {
    const { failures, report } = checkContrast(
      APP_CSS.replace("--muted: #545e6e", "--muted: #aaaaaa"),
    );

    expect(failures).toBeGreaterThan(0);
    expect(report).toMatch(
      /\| light \| muted `#aaaaaa` \| bg `#f6f7f9` \| [\d.]+:1 \| 4\.5:1 \| \*\*FAIL\*\* \|/u,
    );
    expect(report).toContain(`${failures} failing pair(s).`);
  });

  it("names a token the pairs need when the stylesheet lacks it", () => {
    const css = APP_CSS.replaceAll(/--badge-bg: #[\da-f]{6};/gu, "");

    expect(() => checkContrast(css)).toThrow("--badge-bg");
  });
});
