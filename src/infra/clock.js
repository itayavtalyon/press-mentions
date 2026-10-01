/**
 * @typedef {object} Clock The time port, so tests never wait on the wall clock.
 * @property {() => number} now Milliseconds since the epoch.
 * @property {(ms: number) => Promise<void>} sleep Resolves after `ms` milliseconds.
 */

/**
 * @type {Clock}
 */
export const systemClock = {
  now: () => Date.now(),
  sleep: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
};
