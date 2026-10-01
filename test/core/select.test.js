import { describe, expect, it } from "vitest";

import { selectRoundRobin } from "../../src/core/select.js";

/**
 * @param {...string} ids Item ids.
 * @returns {{ guid: string }[]} Items.
 */
const items = (...ids) => ids.map((guid) => ({ guid }));

/**
 * @param {{ guid: string }[]} picked Selected items.
 * @returns {string[]} Their ids.
 */
const guids = (picked) => picked.map((item) => item.guid);

describe("selectRoundRobin", () => {
  it("takes the first of each list, then the second of each", () => {
    const picked = selectRoundRobin([items("a1", "a2"), items("b1", "b2")], 10);

    expect(guids(picked)).toEqual(["a1", "b1", "a2", "b2"]);
  });

  it("keeps going on the longer lists after a short one runs out", () => {
    const picked = selectRoundRobin([items("a1"), items("b1", "b2", "b3")], 10);

    expect(guids(picked)).toEqual(["a1", "b1", "b2", "b3"]);
  });

  it("stops at the cap in the middle of a round", () => {
    const picked = selectRoundRobin(
      [items("a1", "a2"), items("b1", "b2"), items("c1")],
      4,
    );

    expect(guids(picked)).toEqual(["a1", "b1", "c1", "a2"]);
  });

  it("skips a guid it already took", () => {
    const picked = selectRoundRobin([items("x", "a2"), items("x", "b2")], 10);

    expect(guids(picked)).toEqual(["x", "a2", "b2"]);
  });

  it("returns nothing for no lists", () => {
    expect(selectRoundRobin([], 10)).toEqual([]);
  });
});
