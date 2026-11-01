---
inclusion: manual
name: osm-api
description: Reference for OpenStreetMap tile usage policy, URL format, attribution requirements, and known gotchas. Activate when working on OSM tile configuration or OpenStreetMap-related code.
---

# OpenStreetMap Tile API

## Overview

GPX Mapper uses [OpenStreetMap](https://www.openstreetmap.org) raster tiles for the OpenStreetMap provider. Tiles are served by the OSM tile infrastructure at `tile.openstreetmap.org` and fetched directly by Leaflet in the browser. **No API key is required.**

## Tile URL Format

```
https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
```

| Segment | Description |
|---|---|
| `{s}` | Subdomain, one of `a`, `b`, `c` — Leaflet rotates through them automatically |
| `{z}` | Zoom level |
| `{x}`, `{y}` | Tile coordinates |

No authentication parameter is needed. Pass `""` as the API key — there is no key to append.

## Attribution

OSM tiles **require** the following attribution, both in the live Leaflet map and in any exported HTML:

```
&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors
```

This must be passed as the `attribution` option when creating the Leaflet `TileLayer`. Omitting it violates the [OpenStreetMap copyright policy](https://www.openstreetmap.org/copyright).

## Max Zoom

The OSM tile server supports zoom levels up to **19**. Set `maxZoom: 19` on the Leaflet tile layer.

## Usage Policy

The tile service at `tile.openstreetmap.org` is a **shared public resource** intended for light development and personal use. Key rules from the [OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/):

- **Do not use for heavy or automated tile fetching.** Bulk downloads, crawlers, or applications with high traffic must use a self-hosted tile server (e.g. via [OpenMapTiles](https://openmaptiles.org/)) or a commercial tile provider.
- **Cache tiles where possible.** Leaflet handles client-side tile caching automatically.
- **Display a valid attribution.** Always show the copyright notice (see above).
- **Do not hardcode tile server hostnames** in ways that bypass the `{s}` subdomain rotation.

For GPX Mapper's expected use case (a personal tool for occasional track visualisation), the OSM public tile server is appropriate. If the tool is deployed publicly at any scale, evaluate switching to a self-hosted or commercial tile provider.

## Implementation Notes

### No token or key handling needed

Unlike CartoDB and MapBox, OSM tiles carry no authentication parameter. The `buildTileUrl` / `apply_api_key` helpers in `map.ts` and `html.rs` should be bypassed entirely for OSM — just use the URL template as-is.

### Single style

OSM has only one tile style (the standard "Mapnik" rendering). There is no style selector for this provider. The `tile-selector` `<select>` element is hidden when OSM is the active provider.

### Subdomains in Leaflet

Pass `subdomains: 'abc'` (or rely on Leaflet's default) when creating the tile layer:

```typescript
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
}).addTo(map);
```

## What OSM Is Not

- **Nominatim** (geocoding/search) is a separate OSM service with its own [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/). GPX Mapper does not use Nominatim.
- **Overpass API** (data queries) is also separate. GPX Mapper does not use it.

## Common Mistakes

| Mistake | Correct |
|---|---|
| Appending `?key=` to OSM tile URLs | No authentication parameter — use the URL as-is |
| `maxZoom: 22` | `maxZoom: 19` for OSM |
| Omitting attribution | Always include `© OpenStreetMap contributors` with link |
| Using OSM tiles for high-traffic deployment | Evaluate a self-hosted or commercial provider at scale |
| Hardcoding `a.tile.openstreetmap.org` | Use `{s}.tile.openstreetmap.org` so Leaflet rotates subdomains |

## Testing

When writing tests for OSM tile behaviour:

- Assert that tile `src` attributes contain `tile.openstreetmap.org`.
- Assert that tile `src` attributes do **not** contain any `?key=` or `?access_token=` query parameter.
- No live HTTP assertion is necessary for OSM — the structural URL check is sufficient.
