import request from "supertest";
import { describe, expect, it } from "vitest";

import { givenApp } from "../helpers/server.js";

const PATH = "/companies/acme/subscriptions";
const FORM = "application/x-www-form-urlencoded";

/**
 * @param {import("better-sqlite3").Database} alerts Alerts store.
 * @returns {unknown[]} Every subscription.
 */
const subscriptions = (alerts) =>
  alerts.prepare("SELECT company_id, email FROM subscriptions").all();

/**
 * @param {string} body Form body.
 * @param {Record<string, string>} [headers] Extra request headers.
 * @returns {Promise<{ response: import("supertest").Response, alerts: import("better-sqlite3").Database }>}
 *   The answer and the alerts store it wrote to.
 */
const post = async (body, headers = {}) => {
  const { alerts, app } = givenApp();
  const response = await request(app)
    .post(PATH)
    .set({ "Content-Type": FORM, ...headers })
    .send(body);
  return { alerts, response };
};

describe("subscribe form post", () => {
  it("stores one subscription and shows the company page with a banner", async () => {
    const { alerts, response } = await post("email=Itay%40Example.com");

    expect(response.status).toBe(200);
    expect(response.text).toContain(
      "<title>Subscribed: Acme · Press Monitor</title>",
    );
    expect(response.text).toContain("Subscribed Itay@Example.com to Acme.");
    expect(subscriptions(alerts)).toEqual([
      { company_id: "acme", email: "Itay@Example.com" },
    ]);
  });

  it("says an address is already subscribed, ignoring case", async () => {
    const { alerts, app } = givenApp();
    await request(app).post(PATH).type("form").send("email=itay%40example.com");

    const response = await request(app)
      .post(PATH)
      .type("form")
      .send("email=ITAY%40example.com");

    expect(response.status).toBe(200);
    expect(response.text).toContain("ITAY@example.com is already subscribed.");
    expect(subscriptions(alerts)).toHaveLength(1);
  });

  it.each([
    [
      "email=itay%40example",
      "Email address: enter an address like name@example.com.",
    ],
    ["other=1", "Email address: enter your email address."],
  ])(
    "refuses %s with 400 and the form open in the page",
    async (body, message) => {
      const { alerts, response } = await post(body);

      expect(response.status).toBe(400);
      expect(response.text).toContain(
        "<title>Error: Acme · Press Monitor</title>",
      );
      expect(response.text).toContain(message);
      expect(response.text).toContain('class="subscribe-inline card"');
      expect(subscriptions(alerts)).toEqual([]);
    },
  );
});

describe("subscribe guard and limits", () => {
  it.each([
    { "Sec-Fetch-Site": "cross-site" },
    { Origin: "https://evil.example" },
    { Origin: "null" },
  ])("blocks %j with 403 and stores nothing", async (headers) => {
    const { alerts, response } = await post(
      "email=itay%40example.com",
      headers,
    );

    expect(response.status).toBe(403);
    expect(response.text).toContain("Request blocked");
    expect(subscriptions(alerts)).toEqual([]);
  });

  it("accepts a post whose Origin matches the Host", async () => {
    const { alerts, response } = await post("email=itay%40example.com", {
      Host: "127.0.0.1:3000",
      Origin: "http://127.0.0.1:3000",
      "Sec-Fetch-Site": "same-origin",
    });

    expect(response.status).toBe(200);
    expect(subscriptions(alerts)).toHaveLength(1);
  });

  it("answers 415 when the post has no Content-Type", async () => {
    const { alerts, app } = givenApp();

    const response = await request(app).post(PATH);

    expect(response.status).toBe(415);
    expect(subscriptions(alerts)).toEqual([]);
  });

  it.each(["application/json", "text/plain"])(
    "answers 415 for Content-Type %s",
    async (type) => {
      const { alerts, response } = await post('{"email":"a@b.co"}', {
        "Content-Type": type,
      });

      expect(response.status).toBe(415);
      expect(subscriptions(alerts)).toEqual([]);
    },
  );
});

describe("subscribe body limits", () => {
  it("answers 413 for a body over 4 KiB and stores nothing", async () => {
    const { alerts, response } = await post(
      `email=a%40b.co&pad=${"x".repeat(4096)}`,
    );

    expect(response.status).toBe(413);
    expect(subscriptions(alerts)).toEqual([]);
  });

  it("answers 404 for an unknown company and stores nothing", async () => {
    const { alerts, app } = givenApp();

    const response = await request(app)
      .post("/companies/missing/subscriptions")
      .type("form")
      .send("email=a%40b.co");

    expect(response.status).toBe(404);
    expect(response.text).toContain("Company not found");
    expect(subscriptions(alerts)).toEqual([]);
  });
});

describe("subscribe for the page script", () => {
  it.each([
    [
      "email=itay%40example.com",
      200,
      { message: "Subscribed itay@example.com to Acme.", outcome: "created" },
    ],
    [
      "email=bad",
      400,
      {
        field: "email",
        message: "Email address: enter an address like name@example.com.",
        outcome: "invalid",
      },
    ],
  ])("answers JSON for %s", async (body, status, json) => {
    const { response } = await post(body, { Accept: "application/json" });

    expect(response.status).toBe(status);
    expect(response.headers["content-type"]).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.body).toEqual(json);
  });

  it("answers JSON for an existing subscription", async () => {
    const { app } = givenApp();
    await request(app).post(PATH).type("form").send("email=a%40b.co");

    const response = await request(app)
      .post(PATH)
      .type("form")
      .set("Accept", "application/json")
      .send("email=A%40b.co");

    expect(response.body).toEqual({
      message: "A@b.co is already subscribed.",
      outcome: "exists",
    });
  });
});
