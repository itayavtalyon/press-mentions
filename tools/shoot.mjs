/**
 * Viewport screenshots and the horizontal overflow check (`docs/ui-design.md` §10, §11) on the live server at
 * `BASE_URL`. It writes PNGs to `docs/shots/` and exits 1 when any page scrolls sideways at 320, 390, or
 * 640 px (640 px is 1280 px at 200% zoom). Uses playwright's Chromium. Run through `just ui-check`.
 */
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

import { livePages, openPage } from "./pages.mjs";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const SHOTS = fileURLToPath(new URL("../docs/shots/", import.meta.url));
/**
 * @type {{ tag: string, width: number, height: number, colorScheme: "light" | "dark" }[]}
 */
const SCREENS = [
  { colorScheme: "light", height: 900, tag: "desktop-light", width: 1280 },
  { colorScheme: "dark", height: 900, tag: "desktop-dark", width: 1280 },
  { colorScheme: "light", height: 844, tag: "mobile-light", width: 390 },
  { colorScheme: "dark", height: 844, tag: "mobile-dark", width: 390 },
];
const MOBILE_DARK = new Set(["index", "company", "company-dialog"]);
const OVERFLOW_WIDTHS = [320, 390, 640];
const CULPRITS = `[...document.querySelectorAll("body *")]
  .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5)
  .slice(0, 5)
  .map((element) => element.tagName + "." + element.className)
  .join(", ")`;

const index = await fetch(BASE_URL);
const pages = livePages(await index.text());
const browser = await chromium.launch();
/**
 * @type {string[]}
 */
const problems = [];

for (const screen of SCREENS) {
  const context = await browser.newContext({
    colorScheme: screen.colorScheme,
    viewport: { height: screen.height, width: screen.width },
  });
  const page = await context.newPage();
  for (const live of pages) {
    if (screen.tag === "mobile-dark" && !MOBILE_DARK.has(live.name)) {
      continue;
    }
    await openPage(page, BASE_URL, live);
    await page.screenshot({
      path: `${SHOTS}${live.name}--${screen.tag}.png`,
    });
  }
  await context.close();
}

for (const width of OVERFLOW_WIDTHS) {
  const context = await browser.newContext({
    viewport: { height: 800, width },
  });
  const page = await context.newPage();
  for (const live of pages) {
    await openPage(page, BASE_URL, live);
    const scrollWidth = Number(
      await page.evaluate("document.documentElement.scrollWidth"),
    );
    if (scrollWidth > width) {
      problems.push(
        `${live.name} @${String(width)}px: scrollWidth ${String(scrollWidth)} :: ${String(await page.evaluate(CULPRITS))}`,
      );
    }
  }
  await context.close();
}

const forced = await browser.newContext({
  colorScheme: "dark",
  forcedColors: "active",
  viewport: { height: 900, width: 1280 },
});
const forcedPage = await forced.newPage();
const forcedPages = pages.filter(({ name }) => MOBILE_DARK.has(name));
for (const live of forcedPages) {
  await openPage(forcedPage, BASE_URL, live);
  await forcedPage.screenshot({
    path: `${SHOTS}${live.name}--forced-colors.png`,
  });
}
await forced.close();

const keyboard = await browser.newContext({
  viewport: { height: 600, width: 1280 },
});
const keyboardPage = await keyboard.newPage();
await keyboardPage.goto(BASE_URL);
await keyboardPage.keyboard.press("Tab");
await keyboardPage.screenshot({ path: `${SHOTS}index--focus-skip-link.png` });
// Brand, Companies, Review, then the checked Time window radio. An arrow auto-submits (§7.3).
for (let tab = 0; tab < 4; tab += 1) {
  await keyboardPage.keyboard.press("Tab");
}
await keyboardPage.keyboard.press("ArrowRight");
await keyboardPage.waitForURL(/window=/u);
await keyboardPage.screenshot({ path: `${SHOTS}index--focus-segment.png` });
await keyboard.close();

await browser.close();
process.stdout.write(
  problems.length > 0
    ? `OVERFLOW:\n${problems.join("\n")}\n`
    : `No horizontal overflow at 320, 390, or 640 px on ${String(pages.length)} pages.\n`,
);
process.exitCode = problems.length > 0 ? 1 : 0;
