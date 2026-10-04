import { describe, expect, it } from "vitest";

import {
  ALERT_EMAIL,
  alertMention,
  givenDigestPaths,
  readAlerts,
  runAt,
  seedMentions,
  seedStores,
} from "../helpers/digest.js";

const ABORT_BAD =
  "CREATE TRIGGER abort_bad BEFORE INSERT ON notified WHEN NEW.guid = 'bad' BEGIN SELECT RAISE(ABORT, 'notified failed'); END";

describe("runDigest partial failure", () => {
  it("keeps an earlier digest and the retry stores only the failed one", async () => {
    const paths = givenDigestPaths();
    seedMentions(
      paths,
      [
        { displayName: "Acme", id: "acme" },
        { displayName: "Mesa", id: "mesa" },
      ],
      [
        alertMention("good", "Acme news", "positive", { companyId: "acme" }),
        alertMention("bad", "Mesa news", "negative", { companyId: "mesa" }),
      ],
      (alerts) => {
        alerts.exec(ABORT_BAD);
      },
    );

    await expect(runAt(paths)).rejects.toThrow("notified failed");
    expect(readAlerts(paths.alertsDatabase).notified).toEqual([
      { company_id: "acme", email: ALERT_EMAIL, guid: "good" },
    ]);

    seedStores(paths, (_coverage, alerts) => {
      alerts.exec("DROP TRIGGER abort_bad");
    });

    await expect(runAt(paths)).resolves.toEqual({ digests: 1 });
    expect(readAlerts(paths.alertsDatabase).notified).toEqual([
      { company_id: "acme", email: ALERT_EMAIL, guid: "good" },
      { company_id: "mesa", email: ALERT_EMAIL, guid: "bad" },
    ]);
  });
});
