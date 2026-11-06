# Elevation Profile — Implementation Tasks

## Task 1: Layout — resizable bottom panel

Update `app/index.html` and `app/src/style.css` to support a resizable elevation panel below the map.

- [x] Wrap the map `<div>` and a new elevation panel `<div id="elevation-panel">` inside a flex column container that fills 100 vh.
- [x] The elevation panel starts hidden (not rendered in the layout); add it to the DOM only when needed (Task 3 handles this).
- [x] Add a resize handle element `<div class="elevation-resize-handle">` at the top edge of the panel with a grab cursor.
- [x] Write CSS so that the map always fills the remaining height (`flex: 1 1 auto`) and the panel has a fixed initial height of 200 px when visible.
- [x] Add a `<canvas id="elevation-canvas" aria-label="Elevation profile">` inside the panel.
- [x] Give the panel container `role="region"` and `aria-label="Elevation profile"`.
- [x] Run `cd app && npm run build` and fix any TypeScript/ESLint errors before marking done.

## Task 2: Elevation module — distance calculation and chart rendering

Create `app/src/elevation.ts` with distance utilities and canvas chart drawing.

- [x] Implement `haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number` using the Haversine formula with Earth radius 6371 km.
- [x] Implement `buildProfilePoints(track: Track): ProfilePoint[]` where `ProfilePoint = { distanceKm: number; elevation: number; lat: number; lon: number }`. Skip points where `elevation` is `null`. Accumulate distance from the first non-null point.
- [x] Implement `drawChart(canvas: HTMLCanvasElement, points: ProfilePoint[], colour: string): void` that:
  - [x] Clears the canvas and fills it with a background.
  - [x] Computes padding (e.g. 40 px left, 20 px right/top, 30 px bottom) for axis labels.
  - [x] Draws the elevation as a **filled area**: close the path from the last point down to the baseline, along the bottom, and back to the first point. Fill with the track colour at 0.4 opacity; stroke the top edge at full opacity with the same colour.
  - [x] Draws labelled X axis (distance in km) and Y axis (elevation in m) at sensible intervals.
  - [x] Uses the same font family as the rest of the UI (`inherit` or match the CSS variable).
- [x] Export `showElevationProfile(track: Track, colour: string, map: L.Map): void`, `updateElevationColour(colour: string): void`, and `hideElevationProfile(): void` as the public API (implementation stubs are fine for now; hover and marker are added in Task 4).
- [x] Run `cd app && npm run build` and fix any TypeScript/ESLint errors before marking done.

## Task 3: Show/hide logic and ui.ts integration

Wire `showElevationProfile` / `hideElevationProfile` into `ui.ts` and implement the show/hide rules.

- [x] In `ui.ts`, after each file upload or removal, check whether exactly one track is loaded and whether it has any non-null elevation points.
- [x] If yes: call `showElevationProfile(track, colour, map)` where `colour` is the track's current colour from the colour picker.
- [x] In all other cases (zero tracks, two or more tracks, one track with no elevation): call `hideElevationProfile()`.
- [x] Wire `updateElevationColour(newColour)` into the colour-picker `change` handler so that changing a track's colour while only one track is loaded redraws the chart.
- [x] `showElevationProfile` must insert `#elevation-panel` into the DOM (or make it visible as a flex child) and call `drawChart`. `hideElevationProfile` must remove it from the layout (set `display: none` or remove from DOM) so the map reclaims the space.
- [x] Implement the `mousedown` / `mousemove` / `mouseup` resize interaction on `.elevation-resize-handle`: dragging adjusts the panel's `height` style, enforcing a minimum of 60 px for both panel and map; after each drag step, call `drawChart` to re-render.
- [x] Run `cd app && npm run build` and verify no TypeScript/ESLint errors.

## Task 4: Hover interaction — crosshair, label, and Leaflet marker

Implement pointer hover behaviour inside `elevation.ts`.

- [x] Attach a `pointermove` listener to the canvas that, given the cursor's X offset, finds the nearest `ProfilePoint` by distance.
- [x] On the canvas, draw a vertical crosshair line at the matched point's X position and render a floating label showing the elevation rounded to the nearest metre with "m" suffix (e.g. `342 m`).
- [x] Place a Leaflet `circleMarker` (white fill, dark border, radius 6) at `{ lat, lon }` of the matched point on the map passed to `showElevationProfile`. Store the reference and replace it on each `pointermove`.
- [x] Attach a `pointerleave` listener that removes the crosshair/label from the canvas (redraw chart without overlay) and removes the Leaflet marker from the map.
- [x] The map must not pan or zoom in response to hover.
- [x] Run `cd app && npm run build` and fix any errors.
- [x] Manual smoke test: upload a single GPX/FIT/TCX file with elevation data, hover over the chart, and verify the label and map marker appear and track the cursor.

## Task 5: Regression — verify existing tests still pass

Run the full E2E suite and fix any failures caused by the layout changes.

- [x] `cd app && npm run build` (clean build).
- [x] Run `cd tests/e2e && npx playwright test` and confirm all existing tests pass.
- [x] If any test fails due to the layout change (e.g. map height or selector changes), fix the test or the layout so the test passes.
- [x] Do not introduce new E2E tests in this task; that is covered by Task 6.

## Task 6: E2E tests for elevation profile

Add E2E tests in `tests/e2e/` covering the elevation panel behaviour.

- [x] Add a new file `tests/e2e/elevation.spec.ts`.
- [x] Test: upload a single GPX file that has elevation data → elevation panel is visible.
- [x] Test: upload a second file → elevation panel is not visible.
- [x] Test: upload only a file with no elevation data → elevation panel is not visible. (Use a known no-elevation test file if available, or skip with `test.skip` and a comment if none exists.)
- [x] Use `gpxFiles()[0]` (and `[1]` for the second-file test) from `tests/e2e/test-data.ts`; guard with `test.skip` when there are fewer files than the test needs.
- [x] Run `cd tests/e2e && npx playwright test elevation.spec.ts` and fix any failures.
