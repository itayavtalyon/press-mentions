import { describe, expect, it } from "vitest";

import { defineValue, isRecord, ownValue } from "../../src/core/common.js";

describe("common property helpers", () => {
  it("reads and writes an own property", () => {
    const record = {};
    defineValue(record, "Harvey", "positive");

    expect(ownValue(record, "Harvey")).toBe("positive");
    expect(ownValue(record, "missing")).toBeUndefined();
  });

  it("accepts a plain object and rejects other values", () => {
    expect(isRecord({ name: "Harvey" })).toBe(true);
    expect(isRecord(JSON.parse("null"))).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord("Harvey")).toBe(false);
  });
});
