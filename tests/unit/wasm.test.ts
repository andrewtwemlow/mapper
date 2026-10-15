/**
 * Unit tests for the pure utility functions in app/src/wasm.ts that do not
 * require the Wasm module to be initialised.
 *
 * Tests cover: file extension detection and supported file classification.
 * Parser and generator functions (parseGpx, parseFit, etc.) are covered by
 * Rust unit tests in crate/src/ and Playwright E2E tests.
 */

import { describe, it, expect } from "vitest";
import {
  isSupportedFile,
  getFileExtension,
  SUPPORTED_EXTENSIONS,
} from "../../app/src/wasm.js";

describe("isSupportedFile", () => {
  it("returns true for .gpx files", () => {
    expect(isSupportedFile("my_run.gpx")).toBe(true);
  });

  it("returns true for .fit files", () => {
    expect(isSupportedFile("activity.fit")).toBe(true);
  });

  it("returns true for .fit.gz files", () => {
    expect(isSupportedFile("10743961743.fit.gz")).toBe(true);
  });

  it("returns true for .tcx files", () => {
    expect(isSupportedFile("workout.tcx")).toBe(true);
  });

  it("returns true for .tcx.gz files", () => {
    expect(isSupportedFile("9731596976.tcx.gz")).toBe(true);
  });

  it("returns false for .txt files", () => {
    expect(isSupportedFile("notes.txt")).toBe(false);
  });

  it("returns false for .csv files", () => {
    expect(isSupportedFile("data.csv")).toBe(false);
  });

  it("returns false for files with no extension", () => {
    expect(isSupportedFile("noextension")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isSupportedFile("RUN.GPX")).toBe(true);
    expect(isSupportedFile("ACTIVITY.FIT.GZ")).toBe(true);
    expect(isSupportedFile("WORKOUT.TCX.GZ")).toBe(true);
  });
});

describe("getFileExtension", () => {
  it("returns .gpx for a GPX filename", () => {
    expect(getFileExtension("my_run.gpx")).toBe(".gpx");
  });

  it("returns .fit for a FIT filename", () => {
    expect(getFileExtension("activity.fit")).toBe(".fit");
  });

  it("returns .fit.gz for a gzipped FIT filename", () => {
    expect(getFileExtension("10743961743.fit.gz")).toBe(".fit.gz");
  });

  it("returns .tcx for a TCX filename", () => {
    expect(getFileExtension("workout.tcx")).toBe(".tcx");
  });

  it("returns .tcx.gz for a gzipped TCX filename", () => {
    expect(getFileExtension("9731596976.tcx.gz")).toBe(".tcx.gz");
  });

  it("returns null for an unsupported extension", () => {
    expect(getFileExtension("notes.txt")).toBeNull();
  });

  it("returns null for a file with no extension", () => {
    expect(getFileExtension("noextension")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(getFileExtension("RUN.GPX")).toBe(".gpx");
    expect(getFileExtension("RUN.FIT.GZ")).toBe(".fit.gz");
  });

  it("matches .fit.gz before .gz (longer extension wins)", () => {
    // If .gz were matched first, this would return .gz — but .fit.gz should win
    expect(getFileExtension("activity.fit.gz")).toBe(".fit.gz");
  });
});

describe("SUPPORTED_EXTENSIONS", () => {
  it("contains all required format extensions", () => {
    expect(SUPPORTED_EXTENSIONS).toContain(".gpx");
    expect(SUPPORTED_EXTENSIONS).toContain(".fit");
    expect(SUPPORTED_EXTENSIONS).toContain(".fit.gz");
    expect(SUPPORTED_EXTENSIONS).toContain(".tcx");
    expect(SUPPORTED_EXTENSIONS).toContain(".tcx.gz");
  });
});
