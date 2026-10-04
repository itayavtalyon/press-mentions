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

/**
 * @param {import("better-sqlite3").Database} database Alerts store.
 * @param {string} email Address.
 * @param {string} mentionIds Canonical guid set.
 * @returns {void}
 */
function insertPending(database, email, mentionIds) {
  database
    .prepare(
      `INSERT INTO outbox (email, company_id, body, created_at, status, mention_ids)
       VALUES (?, 'acme', 'body', '2026-10-04T12:00:00.000Z', 'pending', ?)`,
    )
    .run(email, mentionIds);
}

describe("outbox", () => {
  it("treats a case-different email as the same mention set", () => {
    const database = givenStore();
    insertPending(database, "Reader@Example.com", '["g1"]');

    expect(() =>
      insertPending(database, "reader@example.com", '["g1"]'),
    ).toThrow("UNIQUE constraint failed");
  });

  it("stores a different mention set for the same email and company", () => {
    const database = givenStore();
    insertPending(database, "reader@example.com", '["g1"]');
    insertPending(database, "reader@example.com", '["g2"]');

    expect(
      database
        .prepare("SELECT mention_ids FROM outbox ORDER BY id")
        .pluck()
        .all(),
    ).toEqual(['["g1"]', '["g2"]']);
  });

  it("requires a null sent_at while pending and a sent_at when sent", () => {
    const database = givenStore();

    expect(() =>
      database
        .prepare(
          `INSERT INTO outbox (email, company_id, body, created_at, status, mention_ids, sent_at)
           VALUES ('a@example.com', 'acme', 'body', ?, 'pending', '["g1"]', ?)`,
        )
        .run("2026-10-04T12:00:00.000Z", "2026-10-04T12:00:00.000Z"),
    ).toThrow("CHECK constraint failed");
    expect(() =>
      database
        .prepare(
          `INSERT INTO outbox (email, company_id, body, created_at, status, mention_ids)
           VALUES ('a@example.com', 'acme', 'body', ?, 'sent', '["g1"]')`,
        )
        .run("2026-10-04T12:00:00.000Z"),
    ).toThrow("CHECK constraint failed");
  });
});
