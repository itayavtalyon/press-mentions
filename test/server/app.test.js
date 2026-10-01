import request from "supertest";
import { describe, expect, it } from "vitest";

import { readAssets } from "../../src/server/app.js";
import { givenCoverageStore } from "../helpers/coverage.js";
import { readText } from "../helpers/files.js";
import { ASSETS, givenApp, givenStoredMention } from "../helpers/server.js";

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

describe("GET /", () => {
  it("renders the index from the store with the security headers", async () => {
    const response = await request(givenApp().app).get("/");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(response.headers["content-security-policy"]).toBe(CSP);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["referrer-policy"]).toBe("same-origin");
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
    const response = await request(
      givenApp({ coverage: givenCoverageStore() }).app,
    ).get("/");

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
    const { app, logged } = givenApp({ coverage });
    coverage.close();

    const response = await request(app).get("/");

    expect(response.status).toBe(500);
    expect(response.text).toContain("Something went wrong");
    expect(response.text).not.toContain("Collecting since");
    expect(logged).toEqual(["server.error"]);
  });
});

describe("company routes", () => {
  it("renders the company page from the store", async () => {
    const response = await request(givenApp().app).get("/companies/acme");

    expect(response.status).toBe(200);
    expect(response.text).toContain("<title>Acme · Press Monitor</title>");
    expect(response.text).toContain("Acme raises a round");
  });

  it("answers 400 for bad filters on the company page", async () => {
    const response = await request(givenApp().app).get(
      "/companies/acme?window=week",
    );

    expect(response.status).toBe(400);
    expect(response.text).toContain("Check the filters");
  });

  it.each([
    ["/companies/missing", "Company not found"],
    ["/companies/Acme", "Page not found"],
    ["/companies/acme/extra", "Page not found"],
  ])("answers 404 for %s", async (path, heading) => {
    const response = await request(givenApp().app).get(path);

    expect(response.status).toBe(404);
    expect(response.text).toContain(heading);
  });

  it.each([
    ["post", "/companies/acme", "GET, HEAD"],
    ["get", "/companies/acme/subscriptions", "POST"],
  ])("answers %s %s with 405 and Allow: %s", async (method, path, allow) => {
    const agent = request(givenApp().app);
    const response = await (method === "post"
      ? agent.post(path)
      : agent.get(path));

    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe(allow);
  });
});
