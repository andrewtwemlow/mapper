/**
 * Runtime test data helpers.
 *
 * Reads the `test-data/` directory at runtime rather than hardcoding filenames.
 * This means tests continue to work as files are added, removed, or renamed.
 *
 * Usage:
 *   import { gpxFiles, fitGzFiles, tcxGzFiles, TEST_DATA_DIR } from "./test-data.js";
 *   // gpxFiles()[0] — first available GPX file (full absolute path)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/** Absolute path to the shared test data directory. */
export const TEST_DATA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test-data",
);

/**
 * Return all files in `test-data/` whose names end with the given suffix,
 * sorted alphabetically for deterministic ordering across runs.
 *
 * Returns full absolute paths ready for use with `setInputFiles`.
 *
 * @param suffix - Lowercase file extension to filter by (e.g. `".gpx"`).
 */
function filesWithSuffix(suffix: string): string[] {
  return fs
    .readdirSync(TEST_DATA_DIR)
    .filter((f) => f.toLowerCase().endsWith(suffix))
    .sort()
    .map((f) => path.join(TEST_DATA_DIR, f));
}

/**
 * All `.gpx` files in `test-data/`, sorted alphabetically.
 * Throws if none are present — tests require at least one GPX file.
 */
export function gpxFiles(): string[] {
  const files = filesWithSuffix(".gpx");
  if (files.length === 0) {
    throw new Error("No .gpx files found in test-data/. Add at least one.");
  }
  return files;
}

/**
 * All `.fit.gz` files in `test-data/`, sorted alphabetically.
 * Returns an empty array when none are present — callers must skip
 * format-specific tests when the array is empty.
 */
export function fitGzFiles(): string[] {
  return filesWithSuffix(".fit.gz");
}

/**
 * All `.tcx.gz` files in `test-data/`, sorted alphabetically.
 * Returns an empty array when none are present — callers must skip
 * format-specific tests when the array is empty.
 */
export function tcxGzFiles(): string[] {
  return filesWithSuffix(".tcx.gz");
}

/**
 * All `.fit` files (uncompressed) in `test-data/`, sorted alphabetically.
 */
export function fitFiles(): string[] {
  // Exclude .fit.gz — only plain .fit files
  return filesWithSuffix(".fit").filter((f) => !f.endsWith(".fit.gz"));
}

/**
 * All `.tcx` files (uncompressed) in `test-data/`, sorted alphabetically.
 */
export function tcxFiles(): string[] {
  return filesWithSuffix(".tcx").filter((f) => !f.endsWith(".tcx.gz"));
}

/**
 * All `.kml` files (uncompressed) in `test-data/`, sorted alphabetically.
 * Returns an empty array when none are present — callers must skip
 * format-specific tests when the array is empty.
 */
export function kmlFiles(): string[] {
  return filesWithSuffix(".kml").filter((f) => !f.endsWith(".kml.gz"));
}

/**
 * All `.kml.gz` files in `test-data/`, sorted alphabetically.
 * Returns an empty array when none are present — callers must skip
 * format-specific tests when the array is empty.
 */
export function kmlGzFiles(): string[] {
  return filesWithSuffix(".kml.gz");
}

/**
 * Derive the filename stem (basename without extension) from an absolute path.
 *
 * Handles compound extensions like `.fit.gz`, `.tcx.gz`, and `.kml.gz` by
 * stripping the longest known suffix first.
 *
 * @param filePath - Absolute path as returned by the `*Files()` helpers.
 * @returns The stem, e.g. `"de3fc74259df4b7ca204a73c1dd15eb8"`.
 */
export function fileStem(filePath: string): string {
  const base = path.basename(filePath);
  for (const ext of [".fit.gz", ".tcx.gz", ".kml.gz", ".gpx", ".fit", ".tcx", ".kml"]) {
    if (base.toLowerCase().endsWith(ext)) {
      return base.slice(0, base.length - ext.length);
    }
  }
  return base;
}
