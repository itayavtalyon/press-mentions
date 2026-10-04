import { describe, expect, it } from "vitest";

import { subscribe } from "../../src/infra/alerts-store.js";
import { openCoverageStore } from "../../src/infra/coverage-store.js";
import {
  ALERT_EMAIL,
  alertMention,
  digestBody,
  givenDigestPaths,
  iso,
  NOW,
  readAlerts,
  runAt,
  seedMentions,
} from "../helpers/digest.js";
import { fileExists, givenFile } from "../helpers/files.js";

const ACME = [{ displayName: "Acme", id: "acme" }];

describe("runDigest when the mention set is already stored", () => {
  it.each(["pending", "sent"])(
    "keeps a %s body and fills missing notified rows",
    async (status) => {
      const paths = givenDigestPaths();
      seedMentions(paths, ACME, [alertMention("g1", "Round", "positive")]);
      await runAt(paths);
      seedMentions(paths, [], [], (alerts) => {
        const sentAt = iso(NOW);
        const sql =
          status === "sent"
            ? "UPDATE outbox SET body = 'KEPT', status = 'sent', sent_at = ?"
            : "UPDATE outbox SET body = 'KEPT'";
        alerts.prepare(sql).run(...(status === "sent" ? [sentAt] : []));
        alerts.prepare("DELETE FROM notified").run();
      });

      await expect(runAt(paths)).resolves.toEqual({ digests: 1 });

      const stored = readAlerts(paths.alertsDatabase);
      expect(stored.notified).toEqual([
        { company_id: "acme", email: ALERT_EMAIL, guid: "g1" },
      ]);
      expect(stored.outbox).toEqual([
        expect.objectContaining({
          body: "KEPT",
          mention_ids: '["g1"]',
          // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
          sent_at: status === "sent" ? iso(NOW) : null,
          status,
        }),
      ]);
    },
  );
});

describe("runDigest rollback", () => {
  it("rolls back the outbox and notified rows when a write throws", async () => {
    const paths = givenDigestPaths();
    seedMentions(
      paths,
      ACME,
      [alertMention("g1", "Round", "positive")],
      (alerts) => {
        alerts
          .prepare(
            `INSERT INTO outbox (email, company_id, body, created_at, status, mention_ids)
             VALUES ('kept@example.com', 'acme', 'prior', ?, 'pending', '["old"]')`,
          )
          .run(iso(NOW));
        alerts
          .prepare(
            "INSERT INTO notified (email, company_id, guid) VALUES ('kept@example.com', 'acme', 'old')",
          )
          .run();
        alerts.exec(`
          CREATE TRIGGER abort_notified BEFORE INSERT ON notified
          BEGIN
            SELECT RAISE(ABORT, 'notified failed');
          END;
        `);
      },
    );
    const before = readAlerts(paths.alertsDatabase);

    await expect(runAt(paths)).rejects.toThrow("notified failed");

    const after = readAlerts(paths.alertsDatabase);
    expect(after.notified).toEqual(before.notified);
    expect(after.outbox).toEqual(before.outbox);
  });
});

describe("runDigest subscribers", () => {
  it("writes one row per subscriber and skips a company with nothing new", async () => {
    const paths = givenDigestPaths();
    seedMentions(
      paths,
      [
        { displayName: "Acme", id: "acme" },
        { displayName: "Mesa", id: "mesa" },
        { displayName: "Quiet", id: "quiet" },
      ],
      [
        alertMention("g1", "Acme news", "positive", { companyId: "acme" }),
        alertMention("g2", "Mesa news", "negative", { companyId: "mesa" }),
      ],
      (alerts) => {
        subscribe(alerts, "acme", "other@example.com");
        subscribe(alerts, "mesa", "other@example.com");
      },
    );

    await runAt(paths);

    const stored = readAlerts(paths.alertsDatabase);
    const first = stored.outbox[0];
    expect(first?.body).toBe(
      digestBody(ALERT_EMAIL, "Acme", [
        "Acme news\nhttps://publisher.example/g1\nVerdict: positive",
      ]),
    );
    expect(stored.notified).toHaveLength(4);
    expect(stored.outbox.map((row) => [row.email, row.company_id])).toEqual([
      [ALERT_EMAIL, "acme"],
      [ALERT_EMAIL, "mesa"],
      ["other@example.com", "acme"],
      ["other@example.com", "mesa"],
    ]);
    expect(stored.subscriptions).toEqual([
      { company_id: "acme", email: ALERT_EMAIL },
      { company_id: "acme", email: "other@example.com" },
      { company_id: "mesa", email: ALERT_EMAIL },
      { company_id: "mesa", email: "other@example.com" },
      { company_id: "quiet", email: ALERT_EMAIL },
    ]);
  });

  it("upserts ALERT_EMAIL when no mention is sent", async () => {
    const paths = givenDigestPaths();
    seedMentions(paths, [{ displayName: "Quiet", id: "quiet" }], []);

    await expect(runAt(paths)).resolves.toEqual({ digests: 0 });

    const stored = readAlerts(paths.alertsDatabase);
    expect(stored.notified).toEqual([]);
    expect(stored.outbox).toEqual([]);
    expect(stored.subscriptions).toEqual([
      { company_id: "quiet", email: ALERT_EMAIL },
    ]);
  });
});

describe("runDigest address case", () => {
  it("treats a case-different address as the stored subscription", async () => {
    const paths = givenDigestPaths();
    seedMentions(
      paths,
      ACME,
      [
        alertMention("g1", "Round", "positive", {
          publisher: "https://publisher.example/round",
        }),
      ],
      (alerts) => {
        subscribe(alerts, "acme", "Reader@Example.com");
      },
    );

    await runAt(paths, "reader@example.com");

    const stored = readAlerts(paths.alertsDatabase);
    expect(stored.notified).toEqual([
      { company_id: "acme", email: "Reader@Example.com", guid: "g1" },
    ]);
    expect(stored.outbox).toEqual([
      expect.objectContaining({
        body: digestBody("Reader@Example.com", "Acme", [
          "Round\nhttps://publisher.example/round\nVerdict: positive",
        ]),
        email: "Reader@Example.com",
      }),
    ]);
    expect(stored.subscriptions).toEqual([
      { company_id: "acme", email: "Reader@Example.com" },
    ]);
  });
});

describe("runDigest lock", () => {
  it("names the holder and does not open either store", async () => {
    const paths = givenDigestPaths();
    givenFile(
      paths.directory,
      "alerts.sqlite.digest.lock",
      String(process.pid),
    );

    await expect(runAt(paths)).rejects.toThrow(
      `Process ${process.pid} holds ${paths.alertsDatabase}.digest.lock`,
    );
    expect(fileExists(paths.alertsDatabase)).toBe(false);
    expect(fileExists(paths.coverageDatabase)).toBe(false);
    expect(fileExists(`${paths.coverageDatabase}.digest.lock`)).toBe(false);
  });

  it("runs while the mailer holds its own lock", async () => {
    const paths = givenDigestPaths();
    seedMentions(paths, ACME, [alertMention("g1", "Round", "positive")]);
    givenFile(paths.directory, "alerts.sqlite.mail.lock", String(process.pid));

    await expect(runAt(paths)).resolves.toEqual({ digests: 1 });

    const stored = readAlerts(paths.alertsDatabase);
    expect(fileExists(`${paths.alertsDatabase}.mail.lock`)).toBe(true);
    expect(fileExists(`${paths.coverageDatabase}.digest.lock`)).toBe(false);
    expect(stored.outbox[0]?.status).toBe("pending");
  });

  it("does not classify while it enqueues", async () => {
    const paths = givenDigestPaths();
    seedMentions(paths, ACME, [alertMention("g1", "Round", "positive")]);

    await runAt(paths);

    const database = openCoverageStore(paths.coverageDatabase);
    try {
      expect(
        database.prepare("SELECT verdict FROM company_articles").pluck().all(),
      ).toEqual(["positive"]);
    } finally {
      database.close();
    }
  });
});

describe("runDigest address", () => {
  it("refuses an address the subscribe form would refuse", async () => {
    const paths = givenDigestPaths();
    seedMentions(paths, ACME, [alertMention("g1", "Round", "positive")]);

    await expect(runAt(paths, "not-an-email")).rejects.toThrow(
      "ALERT_EMAIL is invalid",
    );
    expect(readAlerts(paths.alertsDatabase).subscriptions).toEqual([]);
  });

  it("stores the trimmed address", async () => {
    const paths = givenDigestPaths();
    seedMentions(paths, ACME, [alertMention("g1", "Round", "positive")]);

    await runAt(paths, "  alerts@example.com  ");

    expect(readAlerts(paths.alertsDatabase).subscriptions).toEqual([
      { company_id: "acme", email: "alerts@example.com" },
    ]);
  });
});

describe("runDigest when the alerts file is not a database", () => {
  it("closes coverage and leaves the mention as stored", async () => {
    const paths = givenDigestPaths();
    seedMentions(paths, ACME, [alertMention("g1", "Round", "positive")]);
    givenFile(paths.directory, "alerts.sqlite", "not a database");

    await expect(runAt(paths)).rejects.toThrow("file is not a database");

    const database = openCoverageStore(paths.coverageDatabase);
    try {
      expect(
        database.prepare("SELECT verdict FROM company_articles").pluck().get(),
      ).toBe("positive");
    } finally {
      database.close();
    }
  });
});
