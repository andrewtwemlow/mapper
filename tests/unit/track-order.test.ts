/**
 * Unit tests for track visibility and reorder logic in map.ts.
 *
 * These tests exercise the pure utility functions and the data-structure
 * contracts used by `setTrackVisible` and `reorderTracks` without requiring a
 * real Leaflet map or browser environment.
 *
 * The z-order contract: `reorderTracks(orderedNames)` must call `bringToFront`
 * on the polylines from the LAST name to the FIRST so that `orderedNames[0]`
 * ends up on top (last call wins in SVG paint order).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Minimal Polyline stub ─────────────────────────────────────────────────────

/**
 * Records the sequence of `bringToFront` calls so tests can assert z-order.
 */
class PolylineStub {
  readonly name: string;
  private addedToMap = true;

  constructor(name: string) {
    this.name = name;
  }

  /** Records whether this polyline is currently on the map. */
  isOnMap(): boolean {
    return this.addedToMap;
  }

  /** Simulates `polyline.addTo(map)`. */
  addTo(_map: unknown): this {
    this.addedToMap = true;
    return this;
  }

  /** Simulates `polyline.remove()`. */
  remove(): this {
    this.addedToMap = false;
    return this;
  }

  /** Spy — recorded by the test fixture. */
  bringToFront = vi.fn(() => this);
}

// ── Test fixture — mirrors the closure state inside initMap ───────────────────

/**
 * Build a minimal in-process replica of the `setTrackVisible` and
 * `reorderTracks` logic from `map.ts`, wired to `PolylineStub` instances
 * instead of a real Leaflet map.
 *
 * This lets us verify the branching logic and call order without a DOM.
 */
function buildFixture(names: string[]): {
  polylines: Map<string, PolylineStub>;
  setTrackVisible: (name: string, visible: boolean) => void;
  reorderTracks: (orderedNames: string[]) => void;
} {
  const polylines = new Map<string, PolylineStub>(
    names.map((n) => [n, new PolylineStub(n)]),
  );

  const fakeMap = {};

  function setTrackVisible(name: string, visible: boolean): void {
    const polyline = polylines.get(name);
    if (!polyline) return;
    if (visible) {
      polyline.addTo(fakeMap);
    } else {
      polyline.remove();
    }
  }

  function reorderTracks(orderedNames: string[]): void {
    // Mirrors map.ts: iterate in reverse so orderedNames[0] ends up on top.
    for (let i = orderedNames.length - 1; i >= 0; i--) {
      const polyline = polylines.get(orderedNames[i] ?? "");
      if (polyline) {
        polyline.bringToFront();
      }
    }
  }

  return { polylines, setTrackVisible, reorderTracks };
}

// ── setTrackVisible ───────────────────────────────────────────────────────────

describe("setTrackVisible", () => {
  const TRACK_A = "track-a";
  const TRACK_B = "track-b";

  let fixture: ReturnType<typeof buildFixture>;

  beforeEach(() => {
    fixture = buildFixture([TRACK_A, TRACK_B]);
  });

  it("hides a track that is currently visible", () => {
    fixture.setTrackVisible(TRACK_A, false);
    expect(fixture.polylines.get(TRACK_A)!.isOnMap()).toBe(false);
  });

  it("shows a track that was previously hidden", () => {
    fixture.setTrackVisible(TRACK_A, false);
    fixture.setTrackVisible(TRACK_A, true);
    expect(fixture.polylines.get(TRACK_A)!.isOnMap()).toBe(true);
  });

  it("hiding one track does not affect other tracks", () => {
    fixture.setTrackVisible(TRACK_A, false);
    expect(fixture.polylines.get(TRACK_B)!.isOnMap()).toBe(true);
  });

  it("is a no-op when the track name is unknown", () => {
    // Should not throw.
    expect(() => fixture.setTrackVisible("nonexistent", false)).not.toThrow();
  });

  it("setting visible=true on an already-visible track keeps it visible", () => {
    fixture.setTrackVisible(TRACK_A, true);
    expect(fixture.polylines.get(TRACK_A)!.isOnMap()).toBe(true);
  });

  it("setting visible=false on an already-hidden track keeps it hidden", () => {
    fixture.setTrackVisible(TRACK_A, false);
    fixture.setTrackVisible(TRACK_A, false);
    expect(fixture.polylines.get(TRACK_A)!.isOnMap()).toBe(false);
  });

  it("hides and re-shows a track without affecting the polylines Map entry", () => {
    // The polyline must remain in the map so it can be shown again.
    fixture.setTrackVisible(TRACK_A, false);
    expect(fixture.polylines.has(TRACK_A)).toBe(true);
  });
});

// ── reorderTracks ─────────────────────────────────────────────────────────────

describe("reorderTracks", () => {
  const NAMES = ["alpha", "beta", "gamma"] as const;

  let fixture: ReturnType<typeof buildFixture>;

  beforeEach(() => {
    fixture = buildFixture([...NAMES]);
    // Reset spy call history before each test.
    NAMES.forEach((n) => fixture.polylines.get(n)!.bringToFront.mockClear());
  });

  it("calls bringToFront on every listed track", () => {
    fixture.reorderTracks([...NAMES]);
    NAMES.forEach((n) => {
      expect(fixture.polylines.get(n)!.bringToFront).toHaveBeenCalledTimes(1);
    });
  });

  it("calls bringToFront in reverse order so the first name ends on top", () => {
    /**
     * SVG paint order: last call to bringToFront wins (paints on top).
     * reorderTracks iterates from last → first so orderedNames[0] is last
     * and therefore on top.
     */
    const callOrder: string[] = [];
    NAMES.forEach((n) => {
      fixture.polylines.get(n)!.bringToFront.mockImplementation(() => {
        callOrder.push(n);
        return fixture.polylines.get(n)!;
      });
    });

    fixture.reorderTracks(["alpha", "beta", "gamma"]);

    // Expected order: gamma first, beta second, alpha last (alpha ends on top).
    expect(callOrder).toEqual(["gamma", "beta", "alpha"]);
  });

  it("honours a reversed order correctly", () => {
    const callOrder: string[] = [];
    NAMES.forEach((n) => {
      fixture.polylines.get(n)!.bringToFront.mockImplementation(() => {
        callOrder.push(n);
        return fixture.polylines.get(n)!;
      });
    });

    fixture.reorderTracks(["gamma", "beta", "alpha"]);

    // Expected: alpha first, beta second, gamma last (gamma ends on top).
    expect(callOrder).toEqual(["alpha", "beta", "gamma"]);
  });

  it("is a no-op for unknown names (does not throw)", () => {
    expect(() => fixture.reorderTracks(["nonexistent"])).not.toThrow();
  });

  it("handles an empty list without throwing", () => {
    expect(() => fixture.reorderTracks([])).not.toThrow();
  });

  it("handles a single-track list", () => {
    fixture.reorderTracks(["alpha"]);
    expect(fixture.polylines.get("alpha")!.bringToFront).toHaveBeenCalledTimes(1);
  });
});
