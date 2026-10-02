import request from "supertest";
import { describe, expect, it } from "vitest";

import { livePages, openPage } from "../../tools/pages.mjs";
import {
  addCompany,
  addMention,
  givenCoverageStore,
} from "../helpers/coverage.js";
import { givenApp } from "../helpers/server.js";

/**
 * @param {import("better-sqlite3").Database} [coverage] Coverage store.
 * @returns {Promise<string[]>} The live pages for the index the server renders, each as `name path action`.
 */
async function pagesFor(coverage) {
  const { app } = givenApp(coverage === undefined ? {} : { coverage });
  const response = await request(app).get("/");
  return livePages(response.text).map(({ action, name, path }) =>
    [name, path, action].filter(Boolean).join(" "),
  );
}

const STORE_FREE = [
  "index /",
  "index-negative /?verdict=negative",
  "index-bad-date /?window=custom&from=2026-02-30&to=2026-03-01",
  "index-bad-verdict /?verdict=great",
  "review /review",
  "not-found /no-such-page",
  "company-not-found /companies/no-such-company",
];

describe("livePages", () => {
  it("lists only store-free pages when the index links no company", async () => {
    expect(await pagesFor(givenCoverageStore())).toEqual(STORE_FREE);
  });

  it("adds the first company's page, its dialog states, and its bad range", async () => {
    expect(await pagesFor()).toEqual([
      ...STORE_FREE,
      "company /companies/acme",
      "company-dialog /companies/acme dialog",
      "company-dialog-error /companies/acme dialog-error",
      "company-subscribe-error /companies/acme subscribe-error",
      "company-bad-range /companies/acme?window=custom&from=2026-03-02&to=2026-03-01",
    ]);
  });

  it("adds the last company too when it differs from the first", async () => {
    const coverage = givenCoverageStore();
    addCompany(coverage, { displayName: "Acme", id: "acme" });
    addCompany(coverage, { displayName: "Zeta & Co", id: "zeta co" });
    addMention(coverage, {
      companyId: "acme",
      guid: "g1",
      publishedAt: "2026-09-01T00:00:00.000Z",
      title: "Acme raises a round",
      verdict: "positive",
    });

    const pages = await pagesFor(coverage);

    expect(pages.at(-1)).toBe("company-last /companies/zeta%20co");
  });
});

/**
 * @returns {{ calls: string[], page: import("../../tools/pages.mjs").Driver }} A fake page that records calls.
 */
function fakePage() {
  /**
   * @type {string[]}
   */
  const calls = [];
  const record =
    (/** @type {string} */ call) =>
    async (/** @type {unknown[]} */ ...values) => {
      calls.push(
        [call, ...values.map((value) => JSON.stringify(value))].join(" "),
      );
    };
  const page = {
    evaluate: record("evaluate"),
    getByLabel: (/** @type {string} */ label) => ({
      fill: record(`fill ${label}`),
    }),
    getByRole: (
      /** @type {"button"} */ role,
      /** @type {{ name: string }} */ { name },
    ) => ({ click: record(`click ${role} ${name}`) }),
    goto: record("goto"),
    locator: (/** @type {string} */ selector) => ({
      waitFor: record(`wait ${selector}`),
    }),
    waitForURL: record("waitForURL"),
  };
  return { calls, page };
}

describe("openPage", () => {
  const BASE = "http://127.0.0.1:3999";

  it("loads a plain page from the base URL", async () => {
    const { calls, page } = fakePage();

    await openPage(page, BASE, { name: "index", path: "/?verdict=great" });

    expect(calls).toEqual(['goto "http://127.0.0.1:3999/?verdict=great"']);
  });

  it("opens the dialog and waits for its animation", async () => {
    const { calls, page } = fakePage();

    await openPage(page, BASE, {
      action: "dialog",
      name: "company-dialog",
      path: "/companies/acme",
    });

    expect(calls.slice(1)).toEqual([
      "click button Get email alerts",
      "wait dialog[open]",
      'evaluate "Promise.all(document.getAnimations().map((animation) => animation.finished))"',
    ]);
  });

  it("submits a bad address in the dialog and waits for the marked field", async () => {
    const { calls, page } = fakePage();

    await openPage(page, BASE, {
      action: "dialog-error",
      name: "company-dialog-error",
      path: "/companies/acme",
    });

    expect(calls.slice(4)).toEqual([
      'fill Email address "itay@example"',
      "click button Subscribe",
      "wait #subscribe-email[aria-invalid=true]",
    ]);
  });

  it("posts a bad address without the page script and waits for the reply page", async () => {
    const { calls, page } = fakePage();

    await openPage(page, BASE, {
      action: "subscribe-error",
      name: "company-subscribe-error",
      path: "/companies/acme",
    });

    expect(calls.slice(1)).toEqual([
      String.raw`evaluate "const form = document.querySelector(\"#subscribe form\"); form.elements.email.value = \"itay@example\"; form.submit();"`,
      'waitForURL "**/companies/acme/subscriptions"',
    ]);
  });
});
