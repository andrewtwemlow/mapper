/**
 * Unit tests for the colour palette utilities in app/src/colours.ts.
 *
 * Tests are pure logic with no DOM or Wasm dependencies.
 */

import { describe, it, expect } from "vitest";
import { assignTrackColour, DEFAULT_COLOURS } from "../../app/src/colours.js";

/** Total number of colours in the default palette. */
const PALETTE_SIZE = DEFAULT_COLOURS.length;

describe("assignTrackColour", () => {
  it("returns the first palette colour for index 0", () => {
    expect(assignTrackColour(0)).toBe(DEFAULT_COLOURS[0]);
  });

  it("returns the second palette colour for index 1", () => {
    expect(assignTrackColour(1)).toBe(DEFAULT_COLOURS[1]);
  });

  it("returns the last palette colour for index PALETTE_SIZE - 1", () => {
    expect(assignTrackColour(PALETTE_SIZE - 1)).toBe(
      DEFAULT_COLOURS[PALETTE_SIZE - 1],
    );
  });

  it("cycles back to index 0 when index equals PALETTE_SIZE", () => {
    expect(assignTrackColour(PALETTE_SIZE)).toBe(DEFAULT_COLOURS[0]);
  });

  it("cycles correctly for index > PALETTE_SIZE", () => {
    expect(assignTrackColour(PALETTE_SIZE + 1)).toBe(DEFAULT_COLOURS[1]);
  });

  it("cycles correctly for large indices", () => {
    /** Arbitrarily large index to verify cycling behaviour. */
    const LARGE_INDEX = 105;
    const expected = DEFAULT_COLOURS[LARGE_INDEX % PALETTE_SIZE];
    expect(assignTrackColour(LARGE_INDEX)).toBe(expected);
  });

  it("uses the provided custom palette", () => {
    const customPalette = ["#aaaaaa", "#bbbbbb", "#cccccc"] as const;
    expect(assignTrackColour(0, customPalette)).toBe("#aaaaaa");
    expect(assignTrackColour(1, customPalette)).toBe("#bbbbbb");
    expect(assignTrackColour(3, customPalette)).toBe("#aaaaaa");
  });

  it("falls back to DEFAULT_COLOURS[0] when an empty palette is provided", () => {
    expect(assignTrackColour(0, [])).toBe(DEFAULT_COLOURS[0]);
  });
});

describe("DEFAULT_COLOURS", () => {
  it("contains exactly 10 colours", () => {
    /** Required palette size per project spec. */
    const REQUIRED_PALETTE_SIZE = 10;
    expect(DEFAULT_COLOURS).toHaveLength(REQUIRED_PALETTE_SIZE);
  });

  it("all entries are valid CSS hex colour strings", () => {
    const hexColourPattern = /^#[0-9a-f]{6}$/i;
    DEFAULT_COLOURS.forEach((colour) => {
      expect(colour).toMatch(hexColourPattern);
    });
  });

  it("all entries are unique", () => {
    const unique = new Set(DEFAULT_COLOURS);
    expect(unique.size).toBe(DEFAULT_COLOURS.length);
  });
});
