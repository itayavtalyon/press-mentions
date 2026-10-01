/**
 * Markup (ADR 0008): the escaping `html` tag and `safeHref`. Every feed-derived string reaches a page
 * through here, escaped.
 */

/**
 * Markup that is already escaped. Only `html` makes one.
 */
class Html {
  /**
   * @type {string}
   */
  #text;

  /**
   * @param {string} text Escaped markup.
   */
  constructor(text) {
    this.#text = text;
  }

  /**
   * @returns {string} The markup.
   */
  toString() {
    return this.#text;
  }
}

/**
 * @typedef {Html | string | number | false | undefined} Fragment
 *   Strings and numbers are escaped. A nested `html` fragment is not. `false` and `undefined` print nothing.
 * @typedef {Fragment | Fragment[]} Interpolation
 */

/**
 * Tagged template for HTML. Every interpolated value is escaped unless it came from `html` itself.
 * @param {readonly string[]} strings Literal markup.
 * @param {...Interpolation} values Values to place between it.
 * @returns {Html} The markup.
 */
export function html(strings, ...values) {
  return new Html(
    strings.reduce(
      (text, part, index) => text + render(values[index - 1]) + part,
    ),
  );
}

/**
 * @param {string} raw A feed-derived URL.
 * @returns {string | undefined} The normalized URL when it is absolute `http:` or `https:`, else undefined.
 */
export function safeHref(raw) {
  const url = URL.canParse(raw) ? new URL(raw) : undefined;
  return url && (url.protocol === "http:" || url.protocol === "https:")
    ? url.href
    : undefined;
}

/**
 * @param {Interpolation} value One interpolated value, or a list of them.
 * @returns {string} Escaped text, or the markup of a nested fragment.
 */
function render(value) {
  if (value instanceof Html) {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => render(item)).join("");
  }
  return value === undefined || value === false
    ? ""
    : escapeHtml(String(value));
}

/**
 * @param {string} text Any text.
 * @returns {string} The text, safe in element content and in a double- or single-quoted attribute.
 */
function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
