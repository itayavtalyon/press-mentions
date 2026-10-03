import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

/**
 * Readability treats `0` as "use the default of 500" (`options.charThreshold || 500`).
 * `1` is the smallest value that keeps any non-empty text. The extract job trims and
 * takes the title path when nothing remains (ADR 0006). There is no further threshold.
 */
const MIN_CHARACTERS = 1;

/**
 * Reads article text with Mozilla Readability on a linkedom document (ADR 0003).
 * @param {string} html Publisher page.
 * @returns {string} Readability text, or empty when the page has none.
 */
export function extractArticleText(html) {
  const { document } = parseHTML(html);
  // An empty body parses as a document with no element. Readability throws on that.
  if (!document.documentElement) {
    return "";
  }
  const article = new Readability(document, {
    charThreshold: MIN_CHARACTERS,
  }).parse();
  return article?.textContent ?? "";
}
