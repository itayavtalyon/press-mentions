import { describe, expect, it } from "vitest";

import { extractArticleText } from "../../src/infra/extractor.js";

const SHORT_ARTICLE = `<!DOCTYPE html>
<html>
  <head><title>Acme raises a round</title></head>
  <body>
    <article>
      <h1>Acme raises a round</h1>
      <p>Acme announced a funding round today and will hire more staff in the city.</p>
    </article>
  </body>
</html>`;

const SCRIPT_SHELL = `<!DOCTYPE html>
<html><head><title>App</title></head><body><script>load()</script></body></html>`;

describe("extractArticleText", () => {
  it("keeps article text shorter than Readability's default 500 characters", () => {
    const text = extractArticleText(SHORT_ARTICLE);

    expect(text).toContain("Acme announced a funding round today");
    expect(text.length).toBeLessThan(500);
  });

  it("returns empty text for a script shell", () => {
    expect(extractArticleText(SCRIPT_SHELL)).toBe("");
  });
});
