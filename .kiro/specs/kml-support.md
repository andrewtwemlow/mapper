# KML Support

## Overview

Add support for KML (`.kml`) files to GPX Mapper. Users should be able to upload `.kml` files the same way they upload GPX, FIT, and TCX files. All track coordinate data is extracted from the file and rendered on the map, and the tracks are included in the combined GPX and HTML map downloads.

KML files may also be gzip-compressed (`.kml.gz`) and must be supported in that form as well.

## Requirements

### R1 — File acceptance

- The file upload area must accept `.kml` and `.kml.gz` files alongside the existing formats.
- The upload input's `accept` attribute and any MIME-type / extension checks in the JS layer must include `.kml` and `.kml.gz`.
- Uploading any other file extension must still show an error, unchanged from current behaviour.

### R2 — Rust parser (`parse_kml`)

- Implement `parse_kml(data: &[u8]) -> Result<Track, MapperError>` in `crate/src/kml.rs`.
- The function must handle both plain KML bytes and gzip-compressed bytes (detect by magic bytes `\x1f\x8b`).
- Extract coordinate sequences from KML `<LineString><coordinates>` elements. Each `<coordinates>` block contains space-separated tuples in `longitude,latitude[,altitude]` order.
- A file may contain multiple `<Placemark>` elements each containing a `<LineString>`. All coordinates from all `<LineString>` elements in the file must be combined into a single `Track`.
- Coordinates with invalid or out-of-range latitude/longitude values must be skipped; they must not cause the parse to fail.
- A file with no extractable coordinate pairs must return `MapperError::NoTrackPoints`.
- Altitude values, when present, must be stored as elevation on the `TrackPoint`. When absent, elevation must be `None`.
- The parser must handle both the OGC KML 2.2 namespace (`http://www.opengis.net/kml/2.2`) and the legacy Google namespace (`http://earth.google.com/kml/2.2`), as well as namespace-free KML.

### R3 — Wasm export

- Export `parse_kml(data: &[u8]) -> Result<JsValue, JsValue>` from `crate/src/lib.rs` following the same pattern as `parse_gpx`, `parse_fit`, and `parse_tcx`.

### R4 — TypeScript wasm wrapper (`wasm.ts`)

- Add a `parseKml(bytes: Uint8Array): Track` function to `app/src/wasm.ts` following the same pattern as the existing parsers.
- Extend the file-extension routing logic so `.kml` and `.kml.gz` files are dispatched to `parseKml`.

### R5 — UI (`ui.ts`)

- Add `.kml` and `.kml.gz` to the list of accepted extensions in the upload handler.
- No other UI changes are required; KML tracks use the same colour cycling, track list entry, and colour picker as all other formats.

### R6 — Combined GPX output

- KML-sourced tracks must appear in the combined GPX download as `<trk>` elements, with `<name>` set to the original filename stem (e.g. `my-route` for `my-route.kml`), the same as all other formats.

### R7 — HTML map output

- KML-sourced tracks must be included in the embedded JSON track-data blob in the downloaded HTML map.

### R8 — test-data helper

- Update `tests/e2e/test-data.ts` to export a `kmlFiles()` function (and `.kml.gz` via `kmlGzFiles()`) following the same pattern as `gpxFiles()`, `fitGzFiles()`, and `tcxGzFiles()`.

### R9 — Rust unit tests

Add `#[cfg(test)]` unit tests in `crate/src/kml.rs` covering:

- Valid KML with a single `<LineString>` returns the correct number of track points.
- Valid KML with multiple `<Placemark>` / `<LineString>` elements returns the combined point count.
- KML with altitude values stores elevation on each point.
- KML without altitude values leaves elevation as `None`.
- Gzip-compressed `.kml.gz` bytes are decompressed and parsed correctly.
- A file with no `<LineString>` elements returns `MapperError::NoTrackPoints`.
- Coordinates with latitude or longitude outside ±90/±180 are skipped.
- Coordinate at 0°, 0° is treated as valid (not falsy-skipped).
- Namespace-free KML is parsed correctly.
- Malformed XML returns an error (not a panic).

### R10 — E2E tests

Update `tests/e2e/upload.spec.ts` to add:

- Upload a `.kml` file; track appears on map.
- Upload a `.kml.gz` file; track appears on map.

Update `tests/e2e/download.spec.ts` to add:

- After uploading a KML file, the downloaded combined GPX contains a `<trk>` with `<name>` matching the KML filename stem.
- After uploading a KML file, the downloaded HTML contains track data from that file.

All new E2E tests must use `kmlFiles()` / `kmlGzFiles()` from the test-data helper and guard with `test.skip` when the array is empty.

### R11 — README update

Update `README.md` to list KML and KML.gz as supported input formats.

## Out of scope

- KML `<Point>` and `<Polygon>` geometry — only `<LineString>` tracks are supported.
- KML `<MultiGeometry>` elements.
- KMZ (zipped KML archive) files — this is a separate format and not part of this task.
- Preserving KML style information (colours, widths) in any output format.
- Nested `<Folder>` structures beyond what is needed to reach `<Placemark>` elements.

## Test data

The file `test-data/bd29c115c93aaad665e3cc1435391eaf.kml` is already in the repository and must be used by the E2E tests via the `kmlFiles()` helper. A compressed `.kml.gz` version of this file (or any other valid KML route) should be added for `.kml.gz` coverage.
