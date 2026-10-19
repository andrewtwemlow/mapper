---
inclusion: auto
name: testing
description: Test strategy, Playwright setup, Vitest configuration, and requirements for the GPX Mapper project
---

# Testing Strategy

## Layers

| Layer | Tool | Location | When run |
| --- | --- | --- | --- |
| Rust unit tests | `cargo test` | `crate/src/` (`#[cfg(test)]`) | pre-commit, CI |
| JS/TS unit tests | Vitest 4 | `tests/unit/` | pre-commit, CI |
| End-to-end / browser | Playwright | `tests/e2e/` | CI, on-demand locally |

---

## Rust Unit Tests

All logic in the Rust crate must be tested at the unit level using `#[cfg(test)]` modules in the same file as the code being tested.

**Required coverage:**

- GPX parsing (`parse_gpx`): valid file, missing coordinates, malformed XML, empty file.
- FIT parsing (`parse_fit`): plain `.fit`, gzipped `.fit.gz`, missing GPS fields, corrupt file.
- TCX parsing (`parse_tcx`): plain `.tcx`, gzipped `.tcx.gz`, missing position elements, corrupt file.
- Combined GPX generation (`generate_combined_gpx`): single track, multiple tracks, track naming from filename stem, valid GPX 1.1 namespace.
- HTML map generation (`generate_map_html`): output contains Leaflet CDN script tag, output contains track data JSON blob, output contains all CartoDB tile URL variants.
- Coordinate validation: lat/lon at 0° (valid, not falsy), out-of-range values, null/missing values.

**Running:**

```bash
cd crate && cargo test
```

---

## JS/TS Unit Tests (Vitest)

Unit tests for the TypeScript layer live in `tests/unit/`. They test pure logic that does not require a real browser (colour cycling, file extension detection, GPX XML structure, etc.).

**Config:** `tests/unit/vitest.config.ts`

**Required coverage:**

- `getFileExtension(filename)`: all supported extensions, unknown extension, no extension.
- `assignTrackColour(index, palette)`: cycling at index > palette length, custom palette.
- `parseTrackData(wasmResult)`: valid result, empty result, error result.
- `buildDownloadUrl(blob, filename)`: correct MIME type for GPX, correct MIME type for HTML.

**Running:**

```bash
cd tests/unit && npx vitest run
```

---

## End-to-End Tests (Playwright)

E2E tests run against the built app served locally. They are the primary verification layer for user-facing behaviour.

### Setup

Playwright config: `tests/e2e/playwright.config.ts`

Browsers tested: **Chromium** and **Firefox** only (matching browser targets).

Base URL: `http://localhost:4173` (Vite preview server).

Before running E2E tests, build and preview the app:

```bash
cd app && npm run build && npm run preview
```

Then in a separate terminal:

```bash
cd tests/e2e && npx playwright test
```

### Test files

Test files are saved permanently in `tests/e2e/` and committed to the repository. They are **not** regenerated on each run. When requirements change, the relevant test files must be updated to match.

### Required E2E Test Scenarios

Each scenario below maps to a test file in `tests/e2e/`. When implementing or updating tests, verify each scenario matches the current documented requirements.

#### `health.spec.ts` — Health Endpoint

> **Requires the Docker container, not the Vite preview server.** Run with `BASE_URL=http://localhost:8080`.

- [ ] `GET /health` returns `200 OK`.
- [ ] `GET /health` response has `Content-Type: application/json`.
- [ ] `GET /health` body is `{"status":"ok"}`.

**Running against Docker:**

```bash
docker build -t gpx-mapper .
docker run -d -p 8080:80 --name gpx-mapper-test gpx-mapper
BASE_URL=http://localhost:8080 npx playwright test health.spec.ts
docker rm -f gpx-mapper-test
```

#### `upload.spec.ts` — File Upload

- [ ] Drag-and-drop a single `.gpx` file onto the upload area; track appears on map.
- [ ] Click-to-upload a single `.gpx` file; track appears on map.
- [ ] Upload a `.fit.gz` file; track appears on map.
- [ ] Upload a `.tcx.gz` file; track appears on map.
- [ ] Upload multiple files at once; all tracks appear on map.
- [ ] Upload an unsupported file type; error message shown per-file, other files unaffected.
- [ ] Upload a corrupt/malformed file; error message shown, other files unaffected.

#### `map.spec.ts` — Map Rendering

- [ ] Map renders on page load (Leaflet container present).
- [ ] Default tile style is `CartoDB.DarkMatter`.
- [ ] Tile style selector shows all four options.
- [ ] Switching tile style updates the map tiles.
- [ ] After upload, map auto-fits bounds to show all tracks.
- [ ] Each track renders as a polyline with the correct colour from the default palette.

#### `colours.spec.ts` — Track Colours

- [ ] Each uploaded track has a colour swatch / picker in the track list.
- [ ] Default colours follow the 10-colour palette in upload order.
- [ ] Changing a track colour via the picker updates the polyline colour on the map.
- [ ] Colours persist if additional tracks are uploaded after a colour change.

#### `download.spec.ts` — Downloads

- [ ] "Download GPX" link is present after at least one track is uploaded.
- [ ] Downloaded GPX file is valid XML with GPX 1.1 namespace.
- [ ] Downloaded GPX contains one `<trk>` per uploaded file.
- [ ] Each `<trk>` has a `<name>` matching the original filename stem.
- [ ] "Download Map" link is present after at least one track is uploaded.
- [ ] Downloaded HTML file contains a `<script>` tag with track data JSON.
- [ ] Downloaded HTML file contains Leaflet CDN reference.
- [ ] Downloaded HTML file opens correctly in a browser (loads map, renders tracks).

#### `accessibility.spec.ts` — Accessibility

- [ ] Upload area has an accessible label.
- [ ] Upload area is keyboard focusable (`tabindex="0"`) and operable.
- [ ] Track list items have accessible labels after upload.
- [ ] Colour pickers have accessible labels.
- [ ] Tile style selector has an accessible label.
- [ ] Download links have descriptive accessible names.
- [ ] Error messages have `role="alert"` and `aria-live="polite"`.
- [ ] Map container has an accessible label.
- [ ] CartoDB API key input has an accessible label.
- [ ] API key info button has an accessible label.
- [ ] API key tooltip has `role="tooltip"`.

#### `carto.spec.ts` — CartoDB API Key

> See also `.kiro/steering/carto-api.md` for full API reference.
> Live tile tests require `CARTO_API_KEY` set in the environment; they skip automatically when absent.

- [ ] API key input field is visible on page load.
- [ ] API key input has correct accessible label.
- [ ] API key section has a section heading.
- [ ] Info button is visible next to the input and has an accessible label.
- [ ] Tooltip is hidden by default.
- [ ] Clicking the info button reveals the tooltip.
- [ ] Tooltip contains the security warning text ("embedded", "Caution").
- [ ] Clicking the info button again hides the tooltip.
- [ ] Without API key, tile URLs have no `key=` query parameter.
- [ ] With API key, tile URLs contain `?key=<value>`.
- [ ] Clearing the key reverts tile URLs to plain CartoDB URLs.
- [ ] Switching tile style after entering a key preserves `?key=` in new URLs.
- [ ] *(live, requires `CARTO_API_KEY`)* Tile request with real key returns HTTP 200.
- [ ] Without API key, downloaded HTML contains no `key=` in tile URLs.
- [ ] With API key, downloaded HTML embeds `?key=<value>` in all four tile style variants.
- [ ] Changing the key after upload regenerates the download with the new key.
- [ ] App remains fully functional (upload, map, downloads) without an API key.

---

## Playwright Configuration Requirements

```typescript
// tests/e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: 'npm run preview --prefix app',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## Test Data

Sample files for tests live in `test-data/` at the repo root. Filenames are not stable — never hardcode them in test files.

### `tests/e2e/test-data.ts` helper

All E2E specs import from this shared helper instead of referencing filenames directly:

```typescript
import { gpxFiles, fitGzFiles, tcxGzFiles, fileStem, TEST_DATA_DIR } from "./test-data.js";

// First available GPX file — full absolute path, ready for setInputFiles()
const file = gpxFiles()[0];

// Derive the track name the app will use (filename without extension)
const stem = fileStem(file);
```

The helper reads the directory at runtime using `fs.readdirSync` and returns sorted arrays of absolute paths filtered by extension. When a format has no files, the array is empty and tests must skip gracefully:

```typescript
test("upload a FIT.GZ file", async ({ page }) => {
  const files = fitGzFiles();
  test.skip(files.length === 0, "No .fit.gz files in test-data/");
  // ...
});
```

**Rules:**
- Never hardcode a filename from `test-data/` in a spec file.
- Use `gpxFiles()[0]` / `gpxFiles()[1]` for first/second file; guard with `test.skip(files.length < 2, ...)` when two are needed.
- Use `fileStem(file)` when asserting against the track name embedded in GPX or HTML output.
- When adding new test data files, no spec changes are needed — the helper picks them up automatically.

---

## Test / Requirements Sync Rule

**When the documented requirements change, update the relevant test files before marking the task done.**

Before closing any implementation task that touches user-facing behaviour:

1. Re-read the scenario checklists in this file.
2. Confirm the existing Playwright test for that scenario exercises the updated behaviour.
3. If the test is missing or no longer accurate, update `tests/e2e/<scenario>.spec.ts` to match.

This is enforced by the `PostTaskExec` Kiro hook.
