import path from "node:path";
import { fileURLToPath } from "node:url";

import { onTestFinished } from "vitest";

import { openAlertsStore } from "../../src/infra/alerts-store.js";
import { createApp, readAssets } from "../../src/server/app.js";

import { addCompany, addMention, givenCoverageStore } from "./coverage.js";
import { givenTemporaryDirectory } from "./files.js";

const NOW = new Date("2026-10-05T12:00:00.000Z");
export const ASSETS = fileURLToPath(
  new URL("../../src/ui/browser/", import.meta.url),
);

/**
 * @returns {import("better-sqlite3").Database} An empty alerts store, closed after the test.
 */
function givenAlertsStore() {
  const database = openAlertsStore(
    path.join(givenTemporaryDirectory(), "alerts.sqlite"),
  );
  onTestFinished(() => {
    database.close();
  });
  return database;
}

/**
 * @returns {import("better-sqlite3").Database} A coverage store with Acme and one positive mention last quarter.
 */
export function givenStoredMention() {
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
    title: "Acme raises a round",
    verdict: "positive",
  });
  return database;
}

/**
 * @param {{ coverage?: import("better-sqlite3").Database, alerts?: import("better-sqlite3").Database }} [stores]
 *   Stores. Default to one stored mention and an empty alerts store.
 * @returns {{ app: ReturnType<typeof createApp>, alerts: import("better-sqlite3").Database, logged: string[] }}
 *   The request handler, its alerts store, and its log events.
 */
export function givenApp(stores = {}) {
  /**
   * @type {string[]}
   */
  const logged = [];
  const alerts = stores.alerts ?? givenAlertsStore();
  const app = createApp({
    alerts,
    assets: readAssets(ASSETS),
    clock: { now: () => NOW.getTime(), sleep: async () => {} },
    coverage: stores.coverage ?? givenStoredMention(),
    log: (event) => {
      logged.push(event);
    },
  });
  return { alerts, app, logged };
}
