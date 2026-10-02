import request from "supertest";
import { describe, expect, it } from "vitest";

import { readAssets } from "../../src/server/app.js";
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

  it("answers HEAD with headers and no body", async () => {
    const { app } = givenApp();
    const get = await request(app).get("/");
    const head = await request(app).head("/");

    expect(head.status).toBe(200);
    expect(head.headers["content-length"]).toBe(get.headers["content-length"]);
    expect(head.text).toBeUndefined();
  });
});

describe("static files", () => {
  it("serves the stylesheet as read at startup", async () => {
    const response = await request(givenApp().app).get("/app.css");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/css; charset=utf-8");
    expect(response.text).toBe(readText(`${ASSETS}app.css`));
  });

  it.each(["/app.js", "/name-filter.js", "/subscribe.js"])(
    "serves the page script module %s",
    async (path) => {
      const response = await request(givenApp().app).get(path);

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toBe(
        "text/javascript; charset=utf-8",
      );
      expect(response.text).toBe(readText(`${ASSETS}${path.slice(1)}`));
    },
  );

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
