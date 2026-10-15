/**
 * Track colour palette shared across the application.
 *
 * The default palette matches the 10-colour cycle used in GPX Mapper v1.
 * Colours cycle when more tracks are uploaded than palette entries.
 */

/**
 * The default 10-colour palette for track polylines.
 *
 * Sourced from the Matplotlib/D3 category10 palette for good perceptual
 * distinctness. Index 0 is used as the single-track fallback colour.
 */
export const DEFAULT_COLOURS: readonly string[] = [
  "#1f77b4",
  "#ff7f0e",
  "#2ca02c",
  "#d62728",
  "#6d20b6",
  "#8c564b",
  "#e377c2",
  "#7f7f7f",
  "#bcbd22",
  "#17becf",
] as const;

/**
 * Assign a colour from the default palette to a track by its zero-based index.
 *
 * Cycles through the palette if `index` exceeds the palette length.
 *
 * @param index - The zero-based position of the track in the upload order.
 * @param palette - The colour palette to cycle through. Defaults to {@link DEFAULT_COLOURS}.
 * @returns A CSS hex colour string (e.g. `#1f77b4`).
 */
export function assignTrackColour(
  index: number,
  palette: readonly string[] = DEFAULT_COLOURS,
): string {
  // palette[index % palette.length] is always defined for a non-empty palette.
  // The nullish fallback guards against a caller passing an empty array.
  return palette[index % palette.length] ?? DEFAULT_COLOURS[0];
}
