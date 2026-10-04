import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ALERT_EMAIL,
  addAlertMention,
  alertMention,
  digestBody,
  givenDigestPaths,
  googleUrl,
  iso,
  NOW,
  readAlerts,
  runAt,
  seedMentions,
  seedStores,
  WINDOW_MS,
} from "../helpers/digest.js";
import { fileExists } from "../helpers/files.js";

const ACME = [{ displayName: "Acme", id: "acme" }];

describe("runDigest enqueue", () => {
  it("enqueues one pending row and one notified row for an eligible mention", async () => {
    const paths = givenDigestPaths();
    seedMentions(paths, ACME, [
      alertMention("g1", "Round", "positive", {
        publisher: "https://publisher.example/round",
      }),
    ]);

    await expect(runAt(paths)).resolves.toEqual({ digests: 1 });

    const stored = readAlerts(paths.alertsDatabase);
    const alertFiles = path.join(process.cwd(), "data", "alerts");
    expect(stored.notified).toEqual([
      { company_id: "acme", email: ALERT_EMAIL, guid: "g1" },
    ]);
    expect(stored.outbox).toEqual([
      {
        body: digestBody(ALERT_EMAIL, "Acme", [
          "Round\nhttps://publisher.example/round\nVerdict: positive",
        ]),
        company_id: "acme",
        created_at: iso(NOW),
        email: ALERT_EMAIL,
        id: 1,
        mention_ids: '["g1"]',
        // eslint-disable-next-line unicorn/no-null -- SQLite returns NULL as null.
        sent_at: null,
        status: "pending",
      },
    ]);
    expect(stored.subscriptions).toEqual([
      { company_id: "acme", email: ALERT_EMAIL },
    ]);
    expect(fileExists(alertFiles)).toBe(false);
    expect(fileExists(`${paths.coverageDatabase}.digest.lock`)).toBe(false);
  });
});

describe("runDigest body", () => {
  it("adds the unranked tone and falls back to the Google URL", async () => {
    const paths = givenDigestPaths();
    const body = digestBody(ALERT_EMAIL, "Acme", [
      `Empty link\n${googleUrl("empty")}\nVerdict: positive`,
      `Quiet raise\n${googleUrl("u1")}\nVerdict: unranked\nTone: unranked`,
    ]);
    seedMentions(paths, ACME, [
      alertMention("empty", "Empty link", "positive", {
        hoursAgo: 2,
        publisher: "",
      }),
      alertMention("u1", "Quiet raise", "unranked", {
        hoursAgo: 1,
        publisher: "google",
      }),
    ]);

    await runAt(paths);

    const stored = readAlerts(paths.alertsDatabase);
    expect(stored.outbox).toEqual([
      expect.objectContaining({
        body,
        mention_ids: '["empty","u1"]',
        status: "pending",
      }),
    ]);
  });
});

describe("runDigest order", () => {
  it("orders items negative, positive, neutral, unranked, and newest first", async () => {
    const paths = givenDigestPaths();
    seedMentions(paths, ACME, [
      alertMention("n-new", "Newer", "negative", { hoursAgo: 1 }),
      alertMention("n-old", "Older", "negative", { hoursAgo: 2 }),
      alertMention("n-a", "Tied A", "negative", { hoursAgo: 2 }),
      alertMention("n-b", "Tied B", "negative", { hoursAgo: 2 }),
      alertMention("p1", "Positive", "positive", { hoursAgo: 3 }),
      alertMention("m1", "Neutral", "neutral", { hoursAgo: 4 }),
      alertMention("r1", "Unranked", "unranked", { hoursAgo: 5 }),
    ]);

    await runAt(paths);

    const row = readAlerts(paths.alertsDatabase).outbox[0];
    expect(row?.body).toBe(
      digestBody(ALERT_EMAIL, "Acme", [
        "Newer\nhttps://publisher.example/n-new\nVerdict: negative",
        "Tied A\nhttps://publisher.example/n-a\nVerdict: negative",
        "Tied B\nhttps://publisher.example/n-b\nVerdict: negative",
        "Older\nhttps://publisher.example/n-old\nVerdict: negative",
        "Positive\nhttps://publisher.example/p1\nVerdict: positive",
        "Neutral\nhttps://publisher.example/m1\nVerdict: neutral",
        "Unranked\nhttps://publisher.example/r1\nVerdict: unranked\nTone: unranked",
      ]),
    );
    expect(row?.mention_ids).toBe(
      '["m1","n-a","n-b","n-new","n-old","p1","r1"]',
    );
  });
});

describe("runDigest window", () => {
  it("keeps the closed 72-hour window and skips hidden verdicts", async () => {
    const paths = givenDigestPaths();
    const body = digestBody(ALERT_EMAIL, "Acme", [
      "Inside\nhttps://publisher.example/inside\nVerdict: positive",
      "Edge\nhttps://publisher.example/edge\nVerdict: positive",
    ]);
    seedMentions(paths, ACME, [
      alertMention("edge", "Edge", "positive", {
        publishedAt: iso(NOW - WINDOW_MS),
      }),
      alertMention("inside", "Inside", "positive", { hoursAgo: 1 }),
      alertMention("hidden-unrelated", "Unrelated", "unrelated"),
      alertMention("hidden-uncertain", "Uncertain", "uncertain"),
      alertMention("ineligible", "Ineligible", "positive", {
        alertEligible: 0,
      }),
      alertMention("old", "Old", "positive", {
        publishedAt: iso(NOW - WINDOW_MS - 1),
      }),
      alertMention("clock", "Now", "positive", { publishedAt: iso(NOW) }),
    ]);

    await runAt(paths);

    const stored = readAlerts(paths.alertsDatabase);
    expect(stored.notified.map((row) => row.guid)).toEqual(["edge", "inside"]);
    expect(stored.outbox).toEqual([
      expect.objectContaining({ body, mention_ids: '["edge","inside"]' }),
    ]);
  });
});

describe("runDigest rerun", () => {
  it("inserts nothing new on a second run", async () => {
    const paths = givenDigestPaths();
    seedMentions(paths, ACME, [alertMention("g1", "Round", "positive")]);

    await runAt(paths);
    await expect(runAt(paths)).resolves.toEqual({ digests: 0 });

    const stored = readAlerts(paths.alertsDatabase);
    expect(stored.notified).toHaveLength(1);
    expect(stored.outbox).toHaveLength(1);
  });

  it("enqueues only the new mention for the same email and company", async () => {
    const paths = givenDigestPaths();
    seedMentions(paths, ACME, [
      alertMention("g1", "First story", "positive", { hoursAgo: 2 }),
    ]);
    await runAt(paths);
    seedStores(paths, (coverage) => {
      addAlertMention(
        coverage,
        alertMention("g2", "Second story", "negative", {
          hoursAgo: 1,
          publisher: "https://publisher.example/second",
        }),
      );
    });

    await expect(runAt(paths)).resolves.toEqual({ digests: 1 });

    const stored = readAlerts(paths.alertsDatabase);
    const second = stored.outbox[1];
    expect(stored.notified.map((row) => row.guid)).toEqual(["g1", "g2"]);
    expect(stored.outbox.map((row) => row.mention_ids)).toEqual([
      '["g1"]',
      '["g2"]',
    ]);
    expect(second?.body).toBe(
      digestBody(ALERT_EMAIL, "Acme", [
        "Second story\nhttps://publisher.example/second\nVerdict: negative",
      ]),
    );
  });
});
