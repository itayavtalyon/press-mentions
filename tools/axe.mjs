/**
 * axe-core (WCAG 2.2 A and AA, plus best practices) on every live page at `BASE_URL`, light and dark, at
 * 1280 and 390 px (`docs/ui-design.md` §11, §12). Exits 1 on any violation. Uses playwright's Chromium.
 * Run through `just ui-check`.
 */
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

import { livePages, openPage } from "./pages.mjs";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const AXE = fileURLToPath(import.meta.resolve("axe-core/axe.min.js"));
const RUN = `axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] })
  .then((result) => result.violations.map((violation) =>
    violation.id + " (" + violation.impact + "): " + violation.nodes.length + " node(s), e.g. " + violation.nodes[0].target.join(" ")))`;

/**
 * @param {import("playwright-core").Page} page Browser page.
 * @param {import("./pages.mjs").LivePage} live The page to check.
 * @returns {Promise<string[]>} One line per violated rule.
 */
async function violationsOn(page, live) {
  await openPage(page, BASE_URL, live);
  await page.addScriptTag({ path: AXE });
  const result = await page.evaluate(RUN);
  if (!Array.isArray(result)) {
    throw new TypeError(`axe returned ${String(result)} on ${live.name}`);
  }
  return result.map(String);
}

const index = await fetch(BASE_URL);
const pages = livePages(await index.text());
const browser = await chromium.launch();
const screens = /** @type {const} */ (["light", "dark"]).flatMap(
  (colorScheme) => [1280, 390].map((width) => ({ colorScheme, width })),
);
let total = 0;

for (const { colorScheme, width } of screens) {
  // The server's CSP allows only its own scripts, so the injected axe script needs the bypass.
  const context = await browser.newContext({
    bypassCSP: true,
    colorScheme,
    viewport: { height: 900, width },
  });
  const page = await context.newPage();
  for (const live of pages) {
    const violations = await violationsOn(page, live);
    total += violations.length;
    if (violations.length > 0) {
      process.stdout.write(
        `${live.name} [${colorScheme} ${String(width)}]\n  ${violations.join("\n  ")}\n`,
      );
    }
  }
  await context.close();
}

await browser.close();
process.stdout.write(
  total > 0
    ? `${String(total)} violation group(s).\n`
    : `axe: 0 violations on ${String(pages.length)} pages, light and dark, 1280 and 390 px.\n`,
);
process.exitCode = total > 0 ? 1 : 0;
