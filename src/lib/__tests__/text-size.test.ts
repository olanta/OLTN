import { describe, expect, it } from "vitest";
import { DEFAULT_TEXT_SIZE, normalizeTextSize, TEXT_SIZES } from "../text-size";

describe("normalizeTextSize", () => {
  it("keeps predefined values", () => {
    for (const size of TEXT_SIZES) expect(normalizeTextSize(size)).toBe(size);
  });

  it("snaps arbitrary values to the closest preset", () => {
    expect(normalizeTextSize(13)).toBe(12);
    expect(normalizeTextSize(15)).toBe(16);
    expect(normalizeTextSize(17)).toBe(16);
    expect(normalizeTextSize(99)).toBe(24);
  });

  it("falls back to the default for invalid values", () => {
    expect(normalizeTextSize(undefined)).toBe(DEFAULT_TEXT_SIZE);
    expect(normalizeTextSize(Number.NaN)).toBe(DEFAULT_TEXT_SIZE);
  });
});
