import path from "node:path";

import { describe, expect, it } from "vitest";

import { openAlertsStore } from "../../src/infra/alerts-store.js";
import { givenLog } from "../helpers/fakes.js";
import { fileExists, givenFile } from "../helpers/files.js";
import {
  deliver,
  givenMailPaths,
  hoursBefore,
  insertOutbox,
  insertSent,
  iso,
  NOW,
  outbox,
  RETAIN_MS,
} from "../helpers/mail.js";

const BODY =
  "To: alerts@example.com\nAcme\n\nRound\nhttps://publisher.example/round\nVerdict: positive\n";

describe("runMail send", () => {
  it("logs the stored body once and leaves the row sent", async () => {
    const { alertsDatabase, directory } = givenMailPaths();
    const database = openAlertsStore(alertsDatabase);
    const alertFiles = path.join(process.cwd(), "data", "alerts");
    const coverageDatabase = path.join(directory, "coverage.sqlite");
    insertOutbox(database, {
      body: BODY,
      createdAt: hoursBefore(1),
      mentionIds: '["g1"]',
    });
    database.close();
    const { events, log } = givenLog();

    await expect(deliver(alertsDatabase, log)).resolves.toEqual({ sent: 1 });

    expect(events).toEqual([{ event: "mail.sent", fields: { body: BODY } }]);
    expect(outbox(alertsDatabase)).toEqual([
      {
        body: BODY,
        id: 1,
        mention_ids: '["g1"]',
        sent_at: iso(NOW),
        status: "sent",
      },
    ]);

    const again = givenLog();
    await expect(deliver(alertsDatabase, again.log)).resolves.toEqual({
      sent: 0,
    });
    expect(again.events).toEqual([]);
    expect(fileExists(alertFiles)).toBe(false);
    expect(fileExists(coverageDatabase)).toBe(false);
  });
});

describe("runMail claim", () => {
  it("does not log when the pending update changes zero rows", async () => {
    const { alertsDatabase } = givenMailPaths();
    const database = openAlertsStore(alertsDatabase);
    insertOutbox(database, {
      body: "first",
      createdAt: hoursBefore(2),
      mentionIds: '["g1"]',
    });
    insertOutbox(database, {
      body: "second",
      createdAt: hoursBefore(1),
      mentionIds: '["g2"]',
    });
    const { events, log } = givenLog();

    await deliver(alertsDatabase, (event, fields = {}) => {
      log(event, fields);
      database
        .prepare(
          "UPDATE outbox SET status = 'sent', sent_at = ? WHERE body = 'second'",
        )
        .run(iso(NOW));
    });

    expect(events).toEqual([{ event: "mail.sent", fields: { body: "first" } }]);
    database.close();
  });

  it("claims the oldest pending row first", async () => {
    const { alertsDatabase } = givenMailPaths();
    const database = openAlertsStore(alertsDatabase);
    insertOutbox(database, {
      body: "newer",
      createdAt: hoursBefore(1),
      mentionIds: '["g2"]',
    });
    insertOutbox(database, {
      body: "older",
      createdAt: hoursBefore(2),
      mentionIds: '["g1"]',
    });
    database.close();
    const { events, log } = givenLog();

    await deliver(alertsDatabase, log);

    expect(events.map((entry) => entry.fields.body)).toEqual([
      "older",
      "newer",
    ]);
  });
});

describe("runMail retention", () => {
  it("deletes sent rows older than 96 hours and keeps the rest", async () => {
    const { alertsDatabase } = givenMailPaths();
    const database = openAlertsStore(alertsDatabase);
    insertSent(database, "old", '["old"]', RETAIN_MS + 1);
    insertSent(database, "cutoff", '["cutoff"]', RETAIN_MS);
    insertSent(database, "young", '["young"]', RETAIN_MS - 1);
    insertOutbox(database, {
      body: "waiting",
      createdAt: iso(NOW - RETAIN_MS - 1),
      mentionIds: '["waiting"]',
    });
    database
      .prepare(
        "INSERT INTO notified (email, company_id, guid) VALUES ('alerts@example.com', 'acme', 'kept')",
      )
      .run();
    database.close();

    await deliver(alertsDatabase, givenLog().log);

    const alerts = openAlertsStore(alertsDatabase);
    try {
      expect(alerts.prepare("SELECT guid FROM notified").pluck().all()).toEqual(
        ["kept"],
      );
    } finally {
      alerts.close();
    }
    expect(outbox(alertsDatabase)).toEqual([
      {
        body: "young",
        id: 3,
        mention_ids: '["young"]',
        sent_at: iso(NOW - RETAIN_MS + 1),
        status: "sent",
      },
      {
        body: "waiting",
        id: 4,
        mention_ids: '["waiting"]',
        sent_at: iso(NOW),
        status: "sent",
      },
    ]);
  });
});

describe("runMail failure", () => {
  it("leaves later rows pending when a send throws", async () => {
    const { alertsDatabase } = givenMailPaths();
    const database = openAlertsStore(alertsDatabase);
    insertOutbox(database, {
      body: "first",
      createdAt: hoursBefore(2),
      mentionIds: '["g1"]',
    });
    insertOutbox(database, {
      body: "second",
      createdAt: hoursBefore(1),
      mentionIds: '["g2"]',
    });
    database.close();
    const { log } = givenLog();

    await expect(
      deliver(alertsDatabase, (event, fields) => {
        log(event, fields);
        throw new Error("log failed");
      }),
    ).rejects.toThrow("log failed");

    expect(outbox(alertsDatabase)).toEqual([
      {
        body: "first",
        id: 1,
        mention_ids: '["g1"]',
        sent_at: iso(NOW),
        status: "sent",
      },
      {
        body: "second",
        id: 2,
        mention_ids: '["g2"]',
        // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
        sent_at: null,
        status: "pending",
      },
    ]);
  });
});

describe("runMail lock", () => {
  it("names the holder and does not open the store", async () => {
    const { alertsDatabase, directory } = givenMailPaths();
    const coverageDatabase = path.join(directory, "coverage.sqlite");
    givenFile(directory, "alerts.sqlite.mail.lock", String(process.pid));

    await expect(deliver(alertsDatabase, givenLog().log)).rejects.toThrow(
      `Process ${process.pid} holds ${alertsDatabase}.mail.lock`,
    );
    expect(fileExists(alertsDatabase)).toBe(false);
    expect(fileExists(coverageDatabase)).toBe(false);
  });

  it("runs while digest holds its own lock", async () => {
    const { alertsDatabase, directory } = givenMailPaths();
    const database = openAlertsStore(alertsDatabase);
    insertOutbox(database, {
      body: "queued",
      createdAt: hoursBefore(1),
      mentionIds: '["g1"]',
    });
    database.close();
    givenFile(directory, "alerts.sqlite.digest.lock", String(process.pid));

    await expect(deliver(alertsDatabase, givenLog().log)).resolves.toEqual({
      sent: 1,
    });

    const rows = outbox(alertsDatabase);
    expect(fileExists(`${alertsDatabase}.digest.lock`)).toBe(true);
    expect(rows[0]?.status).toBe("sent");
  });
});
