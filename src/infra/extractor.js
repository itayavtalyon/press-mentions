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
  let { document } = parseHTML(html);
  // An empty body parses as a document with no element. Readability throws on that.
  if (!document.documentElement) {
    return "";
  }
  document = documentRootedAtHtml(document);
  // A page can close html and then print the article. linkedom leaves that markup
  // beside the document element, and Readability throws when the candidate has no body ancestor.
  const outside = [];
  for (const node of document.childNodes) {
    if (node !== document.documentElement && node.nodeType === 1) {
      outside.push(node);
    }
  }
  for (const node of outside) {
    document.body.append(node);
  }
  const article = new Readability(document, {
    charThreshold: MIN_CHARACTERS,
  }).parse();
  return article?.textContent ?? "";
}

/**
 * A script before the doctype becomes the document element. Readability removes
 * that script, and linkedom then throws. The html element later in the page is the document.
 * @param {ReturnType<typeof parseHTML>["document"]} document Parsed page.
 * @returns {ReturnType<typeof parseHTML>["document"]} A document whose root is html, when the page has one.
 */
function documentRootedAtHtml(document) {
  for (const node of document.childNodes) {
    if (
      node !== document.documentElement &&
      node.nodeType === 1 &&
      node.tagName === "HTML"
    ) {
      return parseHTML(node.outerHTML).document;
    }
  }
  return document;
}
