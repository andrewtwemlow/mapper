---
inclusion: auto
name: carto-api
description: Reference for CartoDB basemap tile API usage, authentication, URL format, and known gotchas. Activate when working on map tile configuration, API key handling, or CartoDB-related code.
---

# CartoDB Basemap Tile API

## Overview

GPX Mapper uses [CartoDB basemap tiles](https://github.com/CartoDB/basemap-styles) for map rendering. Tiles are fetched directly by Leaflet in the browser — there is no server-side proxy. The tile service is rate-limited; a free API key is required.

## Authentication

### Query parameter name

CartoDB authenticates tile requests using the **`key`** query parameter:

```
https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=YOUR_KEY
```

> **Critical:** The parameter is `key`, **not** `api_key`, `apikey`, or `token`. Using the wrong parameter name causes tiles to silently fail to load (no error is thrown — Leaflet simply receives a 401 or empty response and does not render tiles).

This was the source of a bug in this project where `?api_key=` was used instead of `?key=`. The fix: always append `?key=<value>`.

### Key format

Keys issued by CARTO look like:

```
cb1_4oq5_1_<hex_string>
```

They are free tier keys (up to 5 million tile requests/month for non-commercial, 1 million for commercial). Request one at [carto.com/basemaps/apikey](https://carto.com/basemaps/apikey).

### Where the key lives

- **Local development:** `.env` file at the repo root as `CARTO_API_KEY=<value>`. This file is gitignored and must never be committed.
- **Runtime:** The user enters the key manually in the UI. It is held in memory only — never persisted to `localStorage` or cookies.
- **Exported HTML map:** The key is embedded in the downloaded `.html` file as part of the tile URL query string. The UI warns the user about this before download.

## Tile URL Templates

All four supported styles follow the same pattern — the base path changes, the `?key=` suffix is appended when a key is present:

| Style key | URL path segment | Label |
|---|---|---|
| `DarkMatter` | `dark_all` | Dark Matter |
| `DarkMatterNoLabels` | `dark_nolabels` | Dark Matter (No Labels) |
| `Positron` | `light_all` | Positron |
| `Voyager` | `rastertiles/voyager` | Voyager |

Full template:

```
https://{s}.basemaps.cartocdn.com/<path>/{z}/{x}/{y}{r}.png?key=<key>
```

Leaflet substitutes `{s}` (subdomain: `a`, `b`, `c`, `d`), `{z}`, `{x}`, `{y}`, and `{r}` (`@2x` on retina, empty otherwise) at request time.

## Implementation

### Live map (`app/src/map.ts`)

The `buildTileUrl(baseUrl, apiKey)` helper appends `?key=<value>` when the key is non-empty:

```typescript
function buildTileUrl(baseUrl: string, apiKey: string): string {
  const key = apiKey.trim();
  return key.length > 0 ? `${baseUrl}?key=${key}` : baseUrl;
}
```

`MapHandle.setApiKey(key)` removes the current tile layer and adds a fresh one with the new URL — Leaflet does not support mutating a live tile layer's URL in place.

### Exported HTML (`crate/src/html.rs`)

The `apply_api_key(url, api_key)` function applies the same `?key=` logic in Rust before embedding the tile URLs into the exported HTML document:

```rust
fn apply_api_key(url: &str, api_key: &str) -> String {
    let key = api_key.trim();
    if key.is_empty() {
        url.to_owned()
    } else {
        format!("{url}?key={key}")
    }
}
```

Called once per tile style variant during `html::generate()`.

### Debounce

The UI debounces API key input by **600 ms** (`API_KEY_DEBOUNCE_MS` in `ui.ts`) to avoid reloading tiles on every keystroke. Tests that verify tile URL changes must wait at least this long after `fill()` before asserting tile `src` attributes.

## Testing

### E2E tests (`tests/e2e/carto.spec.ts`)

Key constants used across tests:

| Constant | Value | Purpose |
|---|---|---|
| `CARTO_KEY_PARAM` | `"key"` | The correct CartoDB query param name |
| `SYNTHETIC_API_KEY` | `"test_carto_key_abc123"` | Fake key for structural URL assertions |
| `REAL_API_KEY` | `process.env["CARTO_API_KEY"]` | Real key for live HTTP 200 tile test |
| `DEBOUNCE_SETTLE_MS` | `800` | Wait after `fill()` for debounce to settle |
| `TILE_RELOAD_TIMEOUT_MS` | `5000` | `waitForFunction` timeout for tile reload |

The live tile test (`"tiles load successfully with real API key"`) is skipped automatically when `CARTO_API_KEY` is not set. To run it:

```bash
cd tests/e2e
CARTO_API_KEY=<your_key> BASE_URL=http://localhost:4173 npx playwright test carto.spec.ts --project=chromium
```

### What to test when changing tile URL logic

1. Tile `src` attributes contain `?key=<key>` after entering a key (not `?api_key=` or `?token=`).
2. Tile `src` attributes have no query string when no key is entered.
3. Changing tile style after entering a key preserves `?key=` in the new URLs.
4. Clearing the key reverts tile URLs to plain (no query string).
5. Exported HTML contains `?key=<key>` in all four tile style variants.
6. Live tile test returns HTTP 200 from `basemaps.cartocdn.com` with the real key.

## Common Mistakes

| Mistake | Correct |
|---|---|
| `?api_key=<key>` | `?key=<key>` |
| `?apikey=<key>` | `?key=<key>` |
| `?token=<key>` | `?key=<key>` |
| Mutating `TileLayer.setUrl()` in Leaflet | Remove old layer, add new `L.tileLayer(...)` |
| Asserting tile load without waiting for debounce | Wait `DEBOUNCE_SETTLE_MS` ms after `fill()` first |
| Committing `.env` | `.env` is in `.gitignore` — never commit it |
