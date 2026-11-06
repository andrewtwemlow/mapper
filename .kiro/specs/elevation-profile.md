# Elevation Profile

## Overview

When exactly one file has been uploaded, display an elevation profile chart in a resizable panel at the bottom of the page. The chart shows elevation (metres) on the Y axis against distance along the track on the X axis.

When a second file is uploaded the panel is hidden and does not reappear unless all but one file is removed and the remaining file has elevation data.

The chart is filled with the same colour as the track's current colour (as set by the colour picker in the track list), rendered as a filled area chart rather than a plain line graph.

Mousing over the chart shows:

- The elevation at that point (in metres), displayed as a tooltip/label on or near the cursor.
- A marker on the main Leaflet map that highlights the corresponding geographic location.

## Requirements

### R1 — Show/hide rules

- The elevation panel is visible if and only if exactly one track is currently loaded **and** that track contains at least one point with a non-`None` elevation value.
- When a second track is added, the panel must be removed from the layout immediately (not just hidden with `display:none` — the vertical space must be reclaimed).
- If all tracks are removed, the panel must also be removed.
- If the user is left with exactly one track (e.g. they remove a second file) and that track has elevation data, the panel must reappear.

### R2 — Panel layout

- The panel is attached to the bottom of the viewport, below the map.
- The map and the panel share the full viewport height; their combined height must always equal 100 vh.
- The panel has a resize handle at its top edge. Dragging it resizes the panel (and the map grows/shrinks correspondingly). No explicit min/max height is required, but the panel must not be draggable to a height that makes either the map or the panel invisible (each must retain at least 60 px).
- The default height of the panel when it first appears is 200 px.
- Resizing is purely a CSS/JS concern; no state needs to be persisted across page reloads.

### R3 — Chart rendering

- The chart is rendered using a plain `<canvas>` element (no third-party charting library).
- The X axis represents cumulative distance along the track in kilometres, labelled at sensible intervals.
- The Y axis represents elevation in metres, labelled at sensible intervals.
- The chart fills the full width and height of the panel (minus a fixed padding for axis labels).
- The elevation profile is drawn as a **filled area**: a closed path from the first point down to the baseline (minimum elevation or zero, whichever is lower), along the bottom, and back up to the last point. The fill colour is the track's current colour (the same colour shown in the track list colour picker) at a reduced opacity (suggested: 0.4). The top edge of the filled area is also stroked as a solid line at full opacity using the same track colour.
- When the track colour is changed via the colour picker, the chart must redraw using the new colour immediately.
- Points without elevation are omitted (no gap bridging required).
- The chart must re-render correctly when the panel is resized.
- Axis labels must use the same font family as the rest of the UI.

### R4 — Hover interaction

- While the pointer is over the chart canvas, the nearest track point to the cursor's X position is highlighted.
- A crosshair vertical line is drawn at the highlighted point's X position on the canvas.
- The elevation of the highlighted point is displayed in a small floating label adjacent to the crosshair, showing the value rounded to the nearest metre with the unit "m" (e.g. `342 m`).
- On the main Leaflet map, a distinct circular marker (different in appearance from the normal track colour — white fill, dark border suggested) is placed at the geographic coordinates of the highlighted track point.
- The map marker must be removed when the pointer leaves the chart canvas.
- The map must **not** pan or zoom in response to hover interactions.

### R5 — Distance calculation

- Cumulative distance between consecutive track points must be calculated using the Haversine formula.
- Distance is accumulated in the TypeScript layer, not in Rust; the Rust `TrackPoint` type already exposes `lat`, `lon`, and optionally `elevation`.
- The Earth radius used must be 6371 km (consistent with any existing usage in the codebase).

### R6 — Accessibility

- The canvas element must have an `aria-label` describing its purpose (e.g. `"Elevation profile"`).
- The elevation panel container must have `role="region"` and `aria-label="Elevation profile"`.
- Keyboard navigation of the chart is out of scope for this iteration.

### R7 — TypeScript implementation

- Add a new file `app/src/elevation.ts` that owns all elevation-profile logic: computing distances, drawing the canvas chart, handling pointer events, and managing the Leaflet hover marker.
- `elevation.ts` must export a single public API used by `ui.ts`:
  - `showElevationProfile(track: Track, colour: string, map: L.Map): void` — renders the panel and chart for the given track using the supplied track colour.
  - `updateElevationColour(colour: string): void` — redraws the chart with a new colour without re-building the profile data; called when the user changes the colour via the colour picker.
  - `hideElevationProfile(): void` — removes the panel from the DOM and cleans up any Leaflet markers.
- `ui.ts` calls `showElevationProfile` when exactly one track is loaded; calls `hideElevationProfile` in all other cases.
- `ui.ts` calls `updateElevationColour` from the colour-picker `change` handler when exactly one track is loaded.
- No changes to the Rust crate or the Wasm boundary are required.

### R8 — No regressions

- All existing E2E tests must continue to pass after this change.
- The layout changes (map height becoming dynamic) must not break the map rendering or tile loading for multi-track scenarios.

## Out of scope

- Elevation profiles for multiple simultaneous tracks.
- Displaying distance or pace along with elevation.
- Exporting or saving the elevation chart.
- Animated playback along the route.
- Elevation data from any source other than what is embedded in the uploaded file.
- Smoothing or interpolation of elevation values.

## Notes

- The `Track` type (as returned by the Wasm parsers) contains an array of `TrackPoint` objects, each with `lat: number`, `lon: number`, and `elevation: number | null`. Elevation profile points with `elevation === null` are skipped when drawing the line and when computing hover elevation.
- The Leaflet map instance is already managed in `map.ts`; `elevation.ts` will need a reference to it passed in via `showElevationProfile`.
- The resize interaction should use a `mousedown` / `mousemove` / `mouseup` pattern on the resize handle, adjusting the panel's CSS height and dispatching a `resize` event on the canvas (or calling the chart redraw function) as the user drags.
