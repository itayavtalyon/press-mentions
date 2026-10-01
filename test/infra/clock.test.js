import { describe, expect, it, vi } from "vitest";

import { systemClock } from "../../src/infra/clock.js";

describe("systemClock", () => {
  it("reads the system time", () => {
    vi.useFakeTimers({ now: 1_234_567 });
    try {
      expect(systemClock.now()).toBe(1_234_567);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves sleep after the delay", async () => {
    vi.useFakeTimers();
    try {
      const slept = systemClock.sleep(5000);
      await vi.advanceTimersByTimeAsync(5000);

      await expect(slept).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
