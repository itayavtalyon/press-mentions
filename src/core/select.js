/**
 * Takes items round-robin across lists, the first of each list, then the second of each, and so on,
 * skipping a `guid` already taken, until `cap` items are taken (ADR 0003).
 * @template {{ guid: string }} T
 * @param {T[][]} lists Lists in priority order, for example one per week.
 * @param {number} cap Maximum number of items.
 * @returns {T[]} At most `cap` items with unique `guid`s.
 */
export function selectRoundRobin(lists, cap) {
  /**
   * @type {T[]}
   */
  const picked = [];
  const seen = new Set();
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let index = 0; index < longest && picked.length < cap; index += 1) {
    for (const list of lists) {
      const item = list.at(index);
      if (item === undefined || seen.has(item.guid) || picked.length >= cap) {
        continue;
      }
      seen.add(item.guid);
      picked.push(item);
    }
  }
  return picked;
}
