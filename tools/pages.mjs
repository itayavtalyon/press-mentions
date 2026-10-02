/**
 * The live pages `tools/shoot.mjs` and `tools/axe.mjs` check (`docs/ui-design.md` §11, §12): every page and
 * state the running server can show from its coverage store, and how to bring a browser page to that state.
 */

/**
 * @typedef {"dialog" | "dialog-error" | "subscribe-error"} Action
 *   Open the subscribe dialog; submit a bad address in it; or post a bad address without the page script.
 * @typedef {{ name: string, path: string, action?: Action }} LivePage
 * @typedef {object} Driver The browser page calls `openPage` makes. A playwright `Page` has them.
 * @property {(url: string) => Promise<unknown>} goto Load a URL.
 * @property {(script: string) => Promise<unknown>} evaluate Run a script in the page.
 * @property {(role: "button", options: { name: string }) => { click(): Promise<void> }} getByRole Find a button.
 * @property {(label: string) => { fill(value: string): Promise<void> }} getByLabel Find a labeled field.
 * @property {(selector: string) => { waitFor(): Promise<void> }} locator Find an element.
 * @property {(url: string) => Promise<void>} waitForURL Wait for a navigation.
 */

const BAD_ADDRESS = "itay@example";
const COMPANY_LINK = /href="\/companies\/([^"?]+)/gu;

/**
 * @param {string} indexHtml The index page the server rendered.
 * @returns {LivePage[]} Pages without a company, then the first company's pages, then the last company's
 *   page when it differs. The index sorts by last mention, so the first company has the newest coverage.
 */
export function livePages(indexHtml) {
  const ids = Array.from(indexHtml.matchAll(COMPANY_LINK), ([, id = ""]) => id);
  const first = ids.at(0);
  const last = ids.at(-1);
  /**
   * @type {LivePage[]}
   */
  const pages = [
    { name: "index", path: "/" },
    { name: "index-negative", path: "/?verdict=negative" },
    {
      name: "index-bad-date",
      path: "/?window=custom&from=2026-02-30&to=2026-03-01",
    },
    { name: "index-bad-verdict", path: "/?verdict=great" },
    { name: "review", path: "/review" },
    { name: "not-found", path: "/no-such-page" },
    { name: "company-not-found", path: "/companies/no-such-company" },
  ];
  if (first === undefined) {
    return pages;
  }
  const company = `/companies/${first}`;
  pages.push(
    { name: "company", path: company },
    { action: "dialog", name: "company-dialog", path: company },
    { action: "dialog-error", name: "company-dialog-error", path: company },
    {
      action: "subscribe-error",
      name: "company-subscribe-error",
      path: company,
    },
    {
      name: "company-bad-range",
      path: `${company}?window=custom&from=2026-03-02&to=2026-03-01`,
    },
  );
  if (last !== first) {
    pages.push({ name: "company-last", path: `/companies/${String(last)}` });
  }
  return pages;
}

/**
 * Load one live page and bring it to its state.
 * @param {Driver} page Browser page.
 * @param {string} baseUrl Server origin.
 * @param {LivePage} live The page to open.
 * @returns {Promise<void>} Resolves when the page shows that state.
 */
export async function openPage(page, baseUrl, live) {
  await page.goto(new URL(live.path, baseUrl).href);
  if (live.action === "subscribe-error") {
    await page.evaluate(
      `const form = document.querySelector("#subscribe form"); form.elements.email.value = "${BAD_ADDRESS}"; form.submit();`,
    );
    await page.waitForURL(`**${live.path}/subscriptions`);
    return;
  }
  if (live.action === undefined) {
    return;
  }
  await page.getByRole("button", { name: "Get email alerts" }).click();
  await page.locator("dialog[open]").waitFor();
  await page.evaluate(
    "Promise.all(document.getAnimations().map((animation) => animation.finished))",
  );
  if (live.action !== "dialog-error") {
    return;
  }
  await page.getByLabel("Email address").fill(BAD_ADDRESS);
  await page.getByRole("button", { name: "Subscribe" }).click();
  await page.locator("#subscribe-email[aria-invalid=true]").waitFor();
}
