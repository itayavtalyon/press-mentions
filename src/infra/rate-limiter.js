/**
 * @typedef {object} RateLimiter A token bucket of capacity 1 per host (ADR 0003).
 * @property {(host: string) => Promise<void>} take Waits for the host's next slot and reserves it.
 * @property {(host: string, ms: number) => void} pause Pushes the host's next slot at least `ms` from now.
 */

/**
 * Creates an in-memory limiter. It resets when the process exits.
 * ponytail: one process, one map. Production shares the bucket through Redis across workers.
 * @param {object} options Options.
 * @param {import("./clock.js").Clock} options.clock Time port.
 * @param {(host: string) => number} options.intervalMs Minimum milliseconds between two requests to a host.
 * @returns {RateLimiter} The limiter.
 */
export function createRateLimiter({ clock, intervalMs }) {
  /**
   * @type {Map<string, number>}
   */
  const nextSlot = new Map();
  return {
    take: async (host) => {
      const now = clock.now();
      const slot = Math.max(nextSlot.get(host) ?? now, now);
      // Reserve before awaiting, so concurrent callers queue behind each other.
      nextSlot.set(host, slot + intervalMs(host));
      if (slot > now) {
        await clock.sleep(slot - now);
      }
    },
    pause: (host, ms) => {
      nextSlot.set(host, Math.max(nextSlot.get(host) ?? 0, clock.now() + ms));
    },
  };
}
