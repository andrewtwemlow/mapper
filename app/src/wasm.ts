/**
 * Wasm module loader and thin wrapper.
 *
 * All interactions with the generated wasm-pack package go through this
 * module. No other file in the app should import directly from the generated
 * `wasm-pkg` directory.
 */

import init, {
  parse_gpx,
  parse_fit,
  parse_tcx,
  generate_combined_gpx,
  generate_map_html,
} from "./wasm-pkg/gpx_mapper.js";

/** Whether the Wasm module has been successfully initialised. */
let initialised = false;

/**
 * Initialise the WebAssembly module.
 *
 * Must be called once before any other function in this module. Subsequent
 * calls are no-ops if the module is already initialised.
 *
 * @throws If the Wasm binary cannot be fetched or instantiated.
 */
export async function initWasm(): Promise<void> {
  if (initialised) return;
  await init();
  initialised = true;
}

/**
 * A single GPS coordinate point.
 */
export interface GpsPoint {
  /** Latitude in decimal degrees. */
  lat: number;
  /** Longitude in decimal degrees. */
  lon: number;
  /** Elevation in metres above sea level, if available. */
  ele?: number;
}

/**
 * A parsed GPS track returned by the Wasm parsers.
 */
export interface ParsedTrack {
  /** Human-readable name derived from the uploaded filename stem. */
  name: string;
  /** Ordered list of GPS points. */
  points: GpsPoint[];
  /** Hex colour string for this track (e.g. `#1f77b4`). */
  colour?: string;
}

/**
 * Parse a GPX file from raw bytes.
 *
 * @param bytes - Raw file bytes as a `Uint8Array`.
 * @param filename - Original filename, used to derive the track name.
 * @returns The parsed track data.
 * @throws If the bytes cannot be parsed as a valid GPX file.
 */
export function parseGpx(bytes: Uint8Array, filename: string): ParsedTrack {
  // Safety: the Wasm function returns a value serialised from the Rust `Track`
  // struct via serde-wasm-bindgen, so the shape is guaranteed by the type system.
  const result: unknown = parse_gpx(bytes, filename);
  return result as ParsedTrack;
}

/**
 * Parse a FIT file (plain or gzip-compressed) from raw bytes.
 *
 * @param bytes - Raw file bytes as a `Uint8Array`.
 * @param filename - Original filename, used to derive the track name.
 * @returns The parsed track data.
 * @throws If the bytes cannot be parsed as a valid FIT file.
 */
export function parseFit(bytes: Uint8Array, filename: string): ParsedTrack {
  // Safety: the Wasm function returns a value serialised from the Rust `Track`
  // struct via serde-wasm-bindgen, so the shape is guaranteed by the type system.
  const result: unknown = parse_fit(bytes, filename);
  return result as ParsedTrack;
}

/**
 * Parse a TCX file (plain or gzip-compressed) from raw bytes.
 *
 * @param bytes - Raw file bytes as a `Uint8Array`.
 * @param filename - Original filename, used to derive the track name.
 * @returns The parsed track data.
 * @throws If the bytes cannot be parsed as a valid TCX file.
 */
export function parseTcx(bytes: Uint8Array, filename: string): ParsedTrack {
  // Safety: the Wasm function returns a value serialised from the Rust `Track`
  // struct via serde-wasm-bindgen, so the shape is guaranteed by the type system.
  const result: unknown = parse_tcx(bytes, filename);
  return result as ParsedTrack;
}

/**
 * Generate a combined GPX document from an array of parsed tracks.
 *
 * Each track becomes its own `<trk>` element in the output GPX 1.1 document.
 *
 * @param tracks - Array of parsed tracks to combine.
 * @returns A GPX 1.1 XML string.
 * @throws If serialisation fails.
 */
export function generateCombinedGpx(tracks: ParsedTrack[]): string {
  return generate_combined_gpx(JSON.stringify(tracks));
}

/**
 * Generate a self-contained HTML map document from an array of parsed tracks.
 *
 * The output embeds all track data inline and references Leaflet from CDN.
 *
 * @param tracks - Array of parsed tracks to render.
 * @returns An HTML document string.
 * @throws If serialisation fails.
 */
export function generateMapHtml(tracks: ParsedTrack[]): string {
  return generate_map_html(JSON.stringify(tracks));
}

/**
 * Supported file extensions and their corresponding parser functions.
 *
 * Used by the UI to dispatch uploaded files to the correct parser.
 */
export const SUPPORTED_EXTENSIONS = [".gpx", ".fit", ".fit.gz", ".tcx", ".tcx.gz"] as const;

/** Union type of all supported file extension strings. */
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

/**
 * Determine whether a filename has a supported extension.
 *
 * @param filename - The filename to check.
 * @returns `true` if the file can be parsed by the Wasm module.
 */
export function isSupportedFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Return the supported extension matched by `filename`, or `null` if none.
 *
 * Checks longer extensions first so `.fit.gz` is matched before `.gz`.
 *
 * @param filename - The filename to inspect.
 * @returns The matched extension, or `null`.
 */
export function getFileExtension(filename: string): SupportedExtension | null {
  const lower = filename.toLowerCase();
  // Sort by length descending so compound extensions (.fit.gz) match before
  // their suffixes — though none of our extensions share a plain suffix.
  const sorted = [...SUPPORTED_EXTENSIONS].sort((a, b) => b.length - a.length);
  return sorted.find((ext) => lower.endsWith(ext)) ?? null;
}
