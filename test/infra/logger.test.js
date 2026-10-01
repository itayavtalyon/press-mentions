import { describe, expect, it, vi } from "vitest";

import { createLogger } from "../../src/infra/logger.js";

const AT = new Date("2026-10-01T09:00:00.000Z");

describe("createLogger", () => {
  it("writes one JSON line with the time, the event, and the fields", () => {
    /**
     * @type {string[]}
     */
    const lines = [];
    const log = createLogger(
      (line) => {
        lines.push(line);
      },
      () => AT,
    );

    log("feed.failed", { company: "harvey", error: "boom" });

    expect(lines.map((line) => JSON.parse(line))).toEqual([
      {
        at: "2026-10-01T09:00:00.000Z",
        event: "feed.failed",
        company: "harvey",
        error: "boom",
      },
    ]);
  });

  it("writes an event with no fields", () => {
    /**
     * @type {string[]}
     */
    const lines = [];
    const log = createLogger(
      (line) => {
        lines.push(line);
      },
      () => AT,
    );

    log("backfill.started");

    expect(lines).toEqual([
      '{"at":"2026-10-01T09:00:00.000Z","event":"backfill.started"}',
    ]);
  });

  it("writes to standard output with the current time by default", () => {
    const print = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.useFakeTimers({ now: AT });
    try {
      createLogger()("feed.collected");

      expect(print).toHaveBeenCalledWith(
        '{"at":"2026-10-01T09:00:00.000Z","event":"feed.collected"}',
      );
    } finally {
      vi.useRealTimers();
      print.mockRestore();
    }
  });
});
