import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import { openAlertsStore, subscribe } from "../../src/infra/alerts-store.js";
import { givenTemporaryDirectory } from "../helpers/files.js";

const givenStore = () => {
  const database = openAlertsStore(
    path.join(givenTemporaryDirectory(), "alerts.sqlite"),
  );
  onTestFinished(() => {
    database.close();
  });
  return database;
};

/**
 * @param {import("better-sqlite3").Database} database Alerts store.
 * @returns {unknown[]} Every subscription.
 */
const subscriptions = (database) =>
  database
    .prepare("SELECT company_id, email FROM subscriptions ORDER BY rowid")
    .all();

describe("subscribe", () => {
  it("stores the address as typed", () => {
    const database = givenStore();

    expect(subscribe(database, "acme", "Itay@Example.com")).toBe("created");
    expect(subscriptions(database)).toEqual([
      { company_id: "acme", email: "Itay@Example.com" },
    ]);
  });

  it("treats a case-different address as the same subscription", () => {
    const database = givenStore();
    subscribe(database, "acme", "Itay@Example.com");

    expect(subscribe(database, "acme", "itay@example.COM")).toBe("exists");
    expect(subscriptions(database)).toHaveLength(1);
  });

  it("subscribes the same address to another company", () => {
    const database = givenStore();
    subscribe(database, "acme", "itay@example.com");

    expect(subscribe(database, "parcel", "itay@example.com")).toBe("created");
  });
});
