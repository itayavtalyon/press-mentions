import request from "supertest";
import { describe, expect, it } from "vitest";

import { addMention, givenCoverageStore } from "../helpers/coverage.js";
import { givenApp, givenStoredMention } from "../helpers/server.js";

describe("index page", () => {
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
  it("says collection has not run on an empty store", async () => {
    const response = await request(
      givenApp({ coverage: givenCoverageStore() }).app,
    ).get("/");

    expect(response.status).toBe(200);
    expect(response.text).toContain("Collection has not run yet.");
  });
});

describe("company pages", () => {
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

describe("review page", () => {
  it("lists uncertain rows with their raw reply and counts them in the nav", async () => {
    const coverage = givenStoredMention();
    addMention(coverage, {
      companyId: "acme",
      guid: "u1",
      publishedAt: "2026-09-02T00:00:00.000Z",
      rawResponse: "not json <b>",
      title: "Acme maybe",
      verdict: "uncertain",
    });

    const response = await request(givenApp({ coverage }).app).get("/review");

    expect(response.status).toBe(200);
    expect(response.text).toContain("<title>Review · Press Monitor</title>");
    expect(response.text).toContain("not json &lt;b&gt;");
    expect(response.text).toContain(", 1 flagged");
  });

  it("says nothing is flagged on an empty store", async () => {
    const response = await request(
      givenApp({ coverage: givenCoverageStore() }).app,
    ).get("/review");

    expect(response.status).toBe(200);
    expect(response.text).toContain("Nothing is flagged.");
  });

  it("answers 405 for a post", async () => {
    const response = await request(givenApp().app).post("/review");

    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe("GET, HEAD");
  });
});
