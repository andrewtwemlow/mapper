---
inclusion: manual
name: mapbox-api
description: Reference for MapBox Raster Tiles v1 API usage, authentication, URL format, style IDs, and known gotchas. Activate when working on MapBox tile configuration, access token handling, or MapBox-related code.
---

# MapBox Raster Tiles API

## Overview

GPX Mapper uses [MapBox Raster Tiles v1](https://docs.mapbox.com/api/maps/raster-tiles/) for the MapBox provider. Tiles are fetched directly by Leaflet in the browser — there is no server-side proxy. A public access token is required; MapBox soft-fails with a 401 and renders no tiles when the token is absent or invalid.

## Authentication

### Query parameter name

MapBox authenticates tile requests using the **`access_token`** query parameter:

```
https://api.mapbox.com/styles/v1/mapbox/{style_id}/tiles/256/{z}/{x}/{y}@2x?access_token=YOUR_TOKEN
```

> **Critical:** The parameter is `access_token`, **not** `key`, `api_key`, or `token`. This is different from CartoDB, which uses `?key=`. Using the wrong parameter name causes tiles to silently fail to load.

### Token format

MapBox tokens come in two varieties — only public tokens should ever be embedded in client-side code:

| Prefix | Type | Use |
|---|---|---|
| `pk.eyJ1…` | Public token | ✅ Safe to embed in browser code and exported HTML |
| `sk.eyJ1…` | Secret token | ❌ Never embed in client-side code or exported files |

Tokens are created in the [MapBox account dashboard](https://account.mapbox.com/access-tokens/). Public tokens have configurable URL restrictions.

### Where the token lives

- **Local development:** `.env` file at the repo root as `MAPBOX_TOKEN=<value>`. This file is gitignored and must never be committed.
- **Runtime:** The user enters the token manually in the UI (input id `mapbox-api-key`). Held in memory only — never persisted to `localStorage` or cookies.
- **Exported HTML map:** The token is embedded in the downloaded `.html` file as part of the tile URL query string. The same security caution applies as for the CartoDB key.

## Tile URL Format

```
https://api.mapbox.com/styles/v1/mapbox/{style_id}/tiles/{tilesize}/{z}/{x}/{y}[@2x]?access_token={token}
```

| Segment | Value used in this project |
|---|---|
| `{style_id}` | One of the style IDs listed below |
| `{tilesize}` | `256` (standard resolution) |
| `[@2x]` | Append for retina/HiDPI displays; Leaflet handles this via `{r}` — use `@2x` in the URL template when setting `detectRetina: true`, otherwise omit |
| `{z}`, `{x}`, `{y}` | Substituted by Leaflet at request time |

> The `{r}` Leaflet placeholder does **not** work with MapBox Raster Tiles the same way it does with CartoDB. For MapBox, use `@2x` literally in the URL template with `detectRetina: true` set on the tile layer, or omit retina support and use the plain URL without `@2x`.

## Style IDs

The four styles used in this project and their MapBox `style_id` values:

| Label | `style_id` | Notes |
|---|---|---|
| Streets | `streets-v12` | Default street map |
| Outdoors | `outdoors-v12` | Topographic / hiking oriented |
| Satellite | `satellite-v9` | Satellite imagery, no labels |
| Satellite Streets | `satellite-streets-v12` | Satellite imagery with street labels |

The default style when switching to the MapBox provider is **Streets** (`streets-v12`).

## Token Application

### Live map (`app/src/map.ts`)

The MapBox tile URL is built by substituting the style ID into the template and appending `?access_token=<token>` when non-empty:

```typescript
function buildMapboxTileUrl(styleId: string, token: string): string {
  const base = `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/256/{z}/{x}/{y}@2x`;
  const t = token.trim();
  return t.length > 0 ? `${base}?access_token=${t}` : base;
}
```

`MapHandle.setMapboxToken(token)` removes the current tile layer and adds a fresh one with the rebuilt URL.

### Exported HTML (`crate/src/html.rs`)

The same logic is applied in Rust before embedding the tile URL into the exported HTML document — token is appended as `?access_token=<token>` when non-empty.

### Debounce

The MapBox token input is debounced by **600 ms** (same as the CartoDB key, `API_KEY_DEBOUNCE_MS` in `ui.ts`). Tests that verify tile URL changes must wait at least this long after `fill()` before asserting tile `src` attributes.

## Attribution

MapBox tiles require the following attribution string:

```
&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors
```

This must be passed as the `attribution` option when creating the Leaflet `TileLayer`. Omitting it violates the MapBox Terms of Service.

## Max Zoom

MapBox Raster Tiles support zoom levels up to **22**. Set `maxZoom: 22` on the Leaflet tile layer.

## Common Mistakes

| Mistake | Correct |
|---|---|
| `?key=<token>` | `?access_token=<token>` |
| `?token=<token>` | `?access_token=<token>` |
| Embedding a secret token (`sk.eyJ1…`) | Only embed public tokens (`pk.eyJ1…`) |
| Using `{r}` placeholder in MapBox URL | Use `@2x` literally with `detectRetina: true`, or omit retina entirely |
| `maxZoom: 19` | `maxZoom: 22` for MapBox |
| Mutating `TileLayer.setUrl()` in Leaflet | Remove old layer, add new `L.tileLayer(...)` |

## Testing

When writing tests for MapBox tile behaviour:

- Use a synthetic token (e.g. `pk.test_mapbox_token_abc123`) for structural URL assertions — no real network request needed.
- Assert that tile `src` attributes contain `access_token=<token>` (not `key=`).
- Assert that tile `src` attributes contain `api.mapbox.com`.
- Use the same `DEBOUNCE_SETTLE_MS` wait (800 ms) after `fill()` as for CartoDB tests.
- Live tile tests (HTTP 200) require a real `MAPBOX_TOKEN` env variable and should be skipped when absent, following the same pattern as `carto.spec.ts`.
