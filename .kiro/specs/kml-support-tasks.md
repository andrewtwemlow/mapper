# KML Support — Implementation Tasks

## Task 1: Rust KML parser ✅

Add `crate/src/kml.rs` with a `parse_kml(data: &[u8]) -> Result<Track, MapperError>` function.

- Detect gzip magic bytes (`\x1f\x8b`) and decompress before parsing (reuse the same approach as `fit.rs` or `tcx.rs`).
- Use `quick-xml` to walk the document and collect `<coordinates>` text content from inside `<LineString>` elements.
- Parse each coordinate tuple (`lon,lat[,ele]`), skip tuples where lat/lon are out of range (lat outside ±90, lon outside ±180), and treat 0.0 as valid.
- Accumulate all points from all `<LineString>` elements in the file into a single `Track`.
- Return `MapperError::NoTrackPoints` when no valid points are found.
- Strip XML namespace prefixes when matching element names (local name comparison, same pattern as `gpx.rs`).
- Add `#[cfg(test)]` tests covering all cases listed in R9 of the spec.
- Wire the new module into `crate/src/lib.rs` with `mod kml;` and a `pub use kml::parse_kml;`.
- Run `cd crate && cargo test` and fix any failures before marking done.

## Task 2: Wasm export for KML ✅

Export `parse_kml` across the Wasm boundary from `crate/src/lib.rs`.

- Add a `#[wasm_bindgen]` wrapper function `parse_kml(data: &[u8]) -> Result<JsValue, JsValue>` following the exact same pattern as the existing `parse_gpx`, `parse_fit`, and `parse_tcx` exports.
- Run `wasm-pack build --target web --out-dir ../app/src/wasm-pkg` from `crate/` to regenerate the wasm package.
- Patch the generated `.d.ts` to replace `any` with `unknown` on the new export (as per the wasm-pack lessons-learned entry): `sed -i 's/): any;/): unknown;/g' app/src/wasm-pkg/gpx_mapper.d.ts`.
- Run `cd crate && cargo test` to confirm no regressions.

## Task 3: TypeScript wasm wrapper and file routing ✅

Update `app/src/wasm.ts` and `app/src/ui.ts` to handle KML files.

- Add `parseKml(bytes: Uint8Array): Track` to `wasm.ts` mirroring `parseGpx`, `parseFit`, `parseTcx`.
- Extend the file-extension routing in `wasm.ts` (or wherever `.gpx` / `.fit` / `.tcx` dispatch lives) so `.kml` routes to `parseKml` and `.kml.gz` also routes to `parseKml` (the Rust function handles decompression).
- Update the `accept` attribute on the file input in `app/index.html` (or wherever it is set) to include `.kml,.kml.gz`.
- Update `app/src/ui.ts` to include `.kml` and `.kml.gz` in any extension allowlist / validation logic.
- Run `cd app && npm run build` and fix any TypeScript or ESLint errors before marking done.

## Task 4: Add `.kml.gz` test data file ✅

Create a gzip-compressed KML file in `test-data/` for `.kml.gz` E2E coverage.

- Compress the existing `test-data/bd29c115c93aaad665e3cc1435391eaf.kml` with gzip: `gzip -k -c test-data/bd29c115c93aaad665e3cc1435391eaf.kml > test-data/bd29c115c93aaad665e3cc1435391eaf.kml.gz`.
- Verify the file exists and is non-empty.
- No code changes are needed; the test-data helper picks up the new file automatically once `kmlGzFiles()` is implemented in the next task.

## Task 5: Update test-data helper and E2E tests ✅

Add `kmlFiles()` and `kmlGzFiles()` to the shared test-data helper and extend the upload and download E2E specs.

- In `tests/e2e/test-data.ts`, add and export:
  - `kmlFiles()` — returns sorted absolute paths of `*.kml` files in `test-data/`.
  - `kmlGzFiles()` — returns sorted absolute paths of `*.kml.gz` files in `test-data/`.
- In `tests/e2e/upload.spec.ts`, add two tests (guarded with `test.skip` when the helper array is empty):
  - Upload a `.kml` file via drag-and-drop or click; assert the track appears on the map.
  - Upload a `.kml.gz` file; assert the track appears on the map.
- In `tests/e2e/download.spec.ts`, add two tests (guarded with `test.skip` when `kmlFiles()` is empty):
  - After uploading a KML file, the downloaded combined GPX contains a `<trk>` with `<name>` matching `fileStem(kmlFiles()[0])`.
  - After uploading a KML file, the downloaded HTML contains the track data JSON blob.
- Build and preview the app (`cd app && npm run build && npm run preview`), then run `cd tests/e2e && npx playwright test upload.spec.ts download.spec.ts` and fix any failures.

## Task 6: Update README ✅

Update `README.md` to list KML and KML.gz as supported input formats alongside GPX, FIT, and TCX.

- Find the section that lists supported file formats and add `.kml` and `.kml.gz` entries consistent with the existing format of that section.
