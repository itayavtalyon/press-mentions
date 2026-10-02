/**
 * Name filter on the index (`docs/ui-design.md` §6.1, §9.3): hides rows whose name and aliases do not
 * contain the typed text. The count is announced once typing pauses. It never submits and is not in the URL.
 */

/**
 * @typedef {object} NameFilterParts
 * @property {HTMLElement} block The hidden tools block.
 * @property {HTMLInputElement} input The search field.
 * @property {HTMLElement} count The live count.
 * @property {HTMLElement} table The companies table.
 * @property {HTMLElement} empty The no-match state.
 * @property {HTMLElement} query Where the no-match state repeats the query.
 * @property {HTMLButtonElement} clear The Clear filter button.
 * @property {{ row: HTMLTableRowElement, search: string }[]} rows Rows with their search text.
 */

/**
 * Filters index rows by name and alias as the reader types. The count is announced once typing pauses.
 * @param {ParentNode} root Page or fragment.
 * @param {{ delay?: number }} [options] Milliseconds before the count updates.
 * @returns {void}
 */
export function initNameFilter(root, { delay = 150 } = {}) {
  const parts = nameFilterParts(root);
  if (parts === undefined) {
    return;
  }
  const { block, input, count, table, empty, query, clear, rows } = parts;
  block.hidden = false;
  let timer = 0;
  const apply = () => {
    const typed = input.value.trim();
    const needle = typed.toLowerCase();
    let shown = 0;
    for (const { row, search } of rows) {
      row.hidden = !matches(search, needle);
      shown += row.hidden ? 0 : 1;
    }
    table.hidden = shown === 0;
    empty.hidden = shown !== 0;
    query.textContent = typed;
    return countText(shown, rows.length);
  };
  input.addEventListener("input", () => {
    const text = apply();
    clearTimeout(timer);
    timer = setTimeout(() => {
      count.textContent = text;
    }, delay);
  });
  clear.addEventListener("click", () => {
    input.value = "";
    clearTimeout(timer);
    count.textContent = apply();
    input.focus();
  });
}

/**
 * @param {string} text Lowercase name and aliases.
 * @param {string} needle Lowercase trimmed query.
 * @returns {boolean} Whether the row stays visible.
 */
export function matches(text, needle) {
  return needle === "" || text.includes(needle);
}

/**
 * @param {number} shown Rows visible.
 * @param {number} total Rows rendered.
 * @returns {string} `Showing 12 of 40 companies`.
 */
export function countText(shown, total) {
  return `Showing ${shown} of ${total} ${total === 1 ? "company" : "companies"}`;
}

/**
 * @param {ParentNode} root Page or fragment.
 * @returns {NameFilterParts | undefined} The name filter's parts, or undefined on a page without them.
 */
function nameFilterParts(root) {
  const tools = toolParts(root);
  const empty = emptyParts(root);
  const table = [...root.querySelectorAll("table")].find(
    (element) => element.id === "companies",
  );
  return tools && empty && table
    ? { ...tools, ...empty, rows: searchRows(table), table }
    : undefined;
}

/**
 * @param {ParentNode} root Page or fragment.
 * @returns {{ block: HTMLElement, input: HTMLInputElement, count: HTMLElement } | undefined} The tools block,
 *   its field, and its count.
 */
function toolParts(root) {
  const block = byAttribute(root, "data-name-filter");
  const input = block?.querySelector("input");
  const count = block?.querySelector("p");
  return block && input && count ? { block, count, input } : undefined;
}

/**
 * @param {ParentNode} root Page or fragment.
 * @returns {{ empty: HTMLElement, query: HTMLElement, clear: HTMLButtonElement } | undefined} The no-match
 *   state, where it repeats the query, and its Clear button.
 */
function emptyParts(root) {
  const empty = byAttribute(root, "data-name-filter-empty");
  const query = empty?.querySelector("span");
  const clear = empty?.querySelector("button");
  return empty && query && clear ? { clear, empty, query } : undefined;
}

/**
 * @param {HTMLTableElement} table The companies table.
 * @returns {{ row: HTMLTableRowElement, search: string }[]} Body rows with their search text.
 */
function searchRows(table) {
  return [...table.querySelectorAll("tr")].flatMap((row) =>
    row.dataset.search === undefined
      ? []
      : [{ row, search: row.dataset.search }],
  );
}

/**
 * @param {ParentNode} root Page or fragment.
 * @param {string} attribute Marker attribute.
 * @returns {HTMLDivElement | undefined} The first `div` carrying it.
 */
function byAttribute(root, attribute) {
  return [...root.querySelectorAll("div")].find((div) =>
    div.hasAttribute(attribute),
  );
}
