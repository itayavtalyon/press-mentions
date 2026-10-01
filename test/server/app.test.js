import { fileURLToPath } from "node:url";

import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp, readAssets } from "../../src/server/app.js";
import {
  addCompany,
  addMention,
  givenCoverageStore,
} from "../helpers/coverage.js";
import { readText } from "../helpers/files.js";

const NOW = new Date("2026-10-05T12:00:00.000Z");
const ASSETS = fileURLToPath(new URL("../../src/ui/browser/", import.meta.url));
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

/**
 * @param {import("better-sqlite3").Database} [coverage] Coverage store. Defaults to one company with one mention.
 * @returns {{ app: ReturnType<typeof createApp>, logged: string[] }} The request handler and its log lines.
 */
const givenApp = (coverage = givenStoredMention()) => {
  /**
   * @type {string[]}
   */
  const logged = [];
  const app = createApp({
    assets: readAssets(ASSETS),
    clock: { now: () => NOW.getTime(), sleep: async () => {} },
    coverage,
    log: (event) => {
      logged.push(event);
    },
  });
  return { app, logged };
};

/**
 * @returns {import("better-sqlite3").Database} A store with Acme and one positive mention last quarter.
 */
const givenStoredMention = () => {
  const database = givenCoverageStore();
  addCompany(database, {
    backfilledAt: "2026-10-02T09:00:00.000Z",
    displayName: "Acme",
    id: "acme",
  });
  addMention(database, {
    companyId: "acme",
    guid: "g1",
    publishedAt: "2026-09-01T00:00:00.000Z",
    verdict: "positive",
  });
  return database;
};

describe("GET /", () => {
  it("renders the index from the store with the security headers", async () => {
    const response = await request(givenApp().app).get("/");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(response.headers["content-security-policy"]).toBe(CSP);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.text).toContain("1 mention, 1 rated");
    expect(response.text).toContain("Collecting since 1 Jul 2026");
  });

  it("answers 400 for a bad range and keeps the typed dates", async () => {
    const response = await request(givenApp().app).get(
      "/?window=custom&from=2026-09-30&to=2026-07-01",
    );

    expect(response.status).toBe(400);
    expect(response.text).toContain("Check the dates");
    expect(response.text).toContain('value="2026-09-30"');
  });

  it("answers 400 for an unknown verdict", async () => {
    const response = await request(givenApp().app).get("/?verdict=bogus");

    expect(response.status).toBe(400);
    expect(response.text).toContain("Check the filters");
  });

  it("answers HEAD with headers and no body", async () => {
    const { app } = givenApp();
    const get = await request(app).get("/");
    const head = await request(app).head("/");

    expect(head.status).toBe(200);
    expect(head.headers["content-length"]).toBe(get.headers["content-length"]);
    expect(head.text).toBeUndefined();
  });

  it("says collection has not run on an empty store", async () => {
    const response = await request(givenApp(givenCoverageStore()).app).get("/");

    expect(response.status).toBe(200);
    expect(response.text).toContain("Collection has not run yet.");
  });
});

describe("static files", () => {
  it("serves the stylesheet as read at startup", async () => {
    const response = await request(givenApp().app).get("/app.css");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/css; charset=utf-8");
    expect(response.text).toBe(readText(`${ASSETS}app.css`));
  });

  it("refuses to read a directory without the stylesheet", () => {
    expect(() => readAssets("/nonexistent/press-monitor/")).toThrow(
      /app\.css/u,
    );
  });
});

describe("other requests", () => {
  it("answers 404 with the page for an unknown path", async () => {
    const response = await request(givenApp().app).get("/nope");

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(response.text).toContain("Page not found");
  });

  it.each([
    ["post", "/"],
    ["delete", "/app.css"],
  ])("answers %s %s with 405 and the allowed methods", async (method, path) => {
    const response = await request(givenApp().app)[
      method === "post" ? "post" : "delete"
    ](path);

    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe("GET, HEAD");
  });

  it("answers 500 with the error page when the store fails, and logs it", async () => {
    const coverage = givenStoredMention();
    const { app, logged } = givenApp(coverage);
    coverage.close();

    const response = await request(app).get("/");

    expect(response.status).toBe(500);
    expect(response.text).toContain("Something went wrong");
    expect(response.text).not.toContain("Collecting since");
    expect(logged).toEqual(["server.error"]);
  });
});
