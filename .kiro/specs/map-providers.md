# Spec: Multi-Provider Map Tiles

## Overview

Replace the current CartoDB-only tile system with a multi-provider tile system. Users select a provider from a dropdown; the UI conditionally reveals provider-specific controls (style picker, API key input) only when that provider requires them.

### Providers

| Key | Label | Styles | API key? | Default? |
|---|---|---|---|---|
| `none` | None | — | No | **Yes** |
| `carto` | CartoDB | Dark Matter, Dark Matter (No Labels), Positron, Voyager | Optional | No |
| `osm` | OpenStreetMap | Standard | No | No |
| `mapbox` | MapBox | Streets, Outdoors, Satellite, Satellite Streets | Required | No |

The **None** provider renders a plain white background — a plain Leaflet map with no tile layer. This is the new default, replacing the current CartoDB DarkMatter default.

---

## Requirements

### R1 — Provider selector

- The sidebar contains a **Map Provider** `<select>` (id `provider-selector`) listing all four providers in the order above.
- On page load the selected provider is **None**.
- Changing the provider immediately updates the live map.

### R2 — Conditional controls

- A **Map Style** `<select>` (id `tile-selector`) is shown only when the selected provider has multiple styles (CartoDB, MapBox). It is hidden for OpenStreetMap and None.
- An **API key** section is shown only when the selected provider requires or accepts a key (CartoDB, MapBox). It is hidden for OpenStreetMap and None.
- The API key label and placeholder text are provider-specific:
  - CartoDB: label `CartoDB API Key`, placeholder `Enter your CartoDB API key`, input id `carto-api-key`.
  - MapBox: label `MapBox Access Token`, placeholder `pk.eyJ1…`, input id `mapbox-api-key`.
- Hiding a control means it is not rendered in the DOM (or is `display: none` / `visibility: hidden` with `aria-hidden="true"`), not merely visually obscured.

### R3 — None provider

- No tile layer is added to the Leaflet map.
- The map background is white (Leaflet's default when no tile layer is present).
- No API key field or style selector is shown.
- Track polylines render correctly on the white background.

### R4 — OpenStreetMap provider

- Tile URL template: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
- Attribution: `&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors`
- Max zoom: 19.
- No API key required or shown.
- No style selector shown (single style).

### R5 — CartoDB provider

- Preserves all existing CartoDB behaviour: four styles, optional API key with `?key=` query parameter, debounced input, tooltip warning.
- Default style remains Dark Matter when CartoDB is selected.

### R6 — MapBox provider

- Tile URL template (Raster Tiles v1): `https://api.mapbox.com/styles/v1/mapbox/{style_id}/tiles/{z}/{x}/{y}?access_token={token}`
- Supported styles and their `style_id` values:

  | Label | style_id |
  |---|---|
  | Streets | `streets-v12` |
  | Outdoors | `outdoors-v12` |
  | Satellite | `satellite-v9` |
  | Satellite Streets | `satellite-streets-v12` |

- Default style: Streets.
- The access token is optional in the same way as the CartoDB key — when empty the tile layer is still added and the upstream service handles the failure gracefully.
- The token is passed as the `access_token` query parameter, not appended as `?key=`.
- Max zoom: 22.
- Attribution: `&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors`

### R7 — Persistence within session

- When the user switches away from a provider and back, the previously entered API key / token and the previously selected style are restored.

### R8 — HTML map export

- The `generate_map_html` Wasm function gains a `provider` parameter (string key) and a `mapbox_token` parameter alongside the existing `carto_api_key` parameter.
- The exported HTML embeds all four providers as options and defaults to whichever provider was active when the export was triggered.
- For the **None** provider, no tile layer is added in the exported map.
- For **MapBox**, if no token was provided the tile layer is still embedded — the upstream service handles the failure gracefully, same as CartoDB.

### R9 — Accessibility

- The provider selector, style selector, and API key inputs all have associated `<label>` elements or `aria-label` attributes.
- Conditional sections use `aria-hidden="true"` when hidden so assistive technology skips them.

### R10 — No breaking changes to existing tests

- Existing CartoDB E2E tests (`carto.spec.ts`) continue to pass. The CartoDB API key input id (`carto-api-key`) and section heading text are unchanged.
- The tile selector (`#tile-selector`) continues to work when CartoDB is the active provider.

---

## Design

### Data model changes (`map.ts`)

Introduce a `Provider` type and expand `TileLayerConfig`:

```typescript
/** Identifies a map tile provider. */
export type ProviderId = "none" | "carto" | "osm" | "mapbox";

/** Top-level provider descriptor. */
export interface ProviderConfig {
  label: string;
  requiresApiKey: boolean;   // controls API key section visibility
  apiKeyLabel?: string;
  apiKeyPlaceholder?: string;
  apiKeyInputId?: string;
  styles?: Record<string, TileLayerConfig>;  // present only for multi-style providers
  defaultStyle?: string;
}
```

`TILE_LAYERS` is renamed to `CARTO_TILE_LAYERS` (CartoDB only). A new `PROVIDERS` map contains all four providers. `DEFAULT_PROVIDER` is `"none"`.

`MapHandle` gains:
- `setProvider(providerId: ProviderId): void` — switches the active provider, removing the old tile layer and adding the new one.
- `setMapboxToken(token: string): void`
- `getMapboxToken(): string`
- The existing `setTileStyle`, `setApiKey`, and `getApiKey` methods are retained for CartoDB compat.

### UI changes (`ui.ts`)

- `renderAppShell` renders the **Map Provider** section above the existing Map Style section.
- The **CartoDB API Key** section and the **Map Style** section are conditionally shown/hidden based on the selected provider.
- A new **MapBox Access Token** section (hidden by default) is shown when MapBox is selected.
- `setupProviderSelector` wires the provider `<select>` to `mapHandle.setProvider` and toggles the visibility of dependent sections.
- `updateDownloads` passes the active provider and MapBox token to `generateMapHtml`.

### Rust / Wasm changes (`html.rs`, `lib.rs`)

The `generate` function signature becomes:

```rust
pub fn generate(
    tracks: &[Track],
    provider: &str,          // "none" | "carto" | "osm" | "mapbox"
    carto_api_key: &str,
    mapbox_token: &str,
) -> Result<String, MapperError>
```

The exported HTML:
- Embeds all provider configs as a `PROVIDERS` JS object.
- Sets `var DEFAULT_PROVIDER = "<provider>";` so the map opens on the correct provider.
- Renders a provider selector control in the exported HTML for post-export switching.

The `generate_map_html` Wasm export in `lib.rs` gains the new parameters and propagates them.

---

## Tasks

### Task 1 — Extend the Rust `generate` function signature and HTML template

- Update `generate` in `crate/src/html.rs` to accept `provider`, `carto_api_key`, and `mapbox_token`.
- Add OSM and MapBox tile URL constants.
- Update the embedded HTML `<script>` to include all provider configs, the MapBox token (when non-empty), the active provider, and a provider selector UI.
- Update the Wasm export `generate_map_html` in `lib.rs` to pass all three new parameters.
- Fix the generated `gpx_mapper.d.ts` declaration to use `unknown` (per coding standards).
- Run `cargo check` to verify; run the crate unit tests (`cargo test`).

### Task 2 — Update `map.ts` with multi-provider support

- Add `ProviderId`, `ProviderConfig`, and `PROVIDERS` exports.
- Rename `TILE_LAYERS` → `CARTO_TILE_LAYERS` (keep `TILE_LAYERS` as a re-export alias for backward compat with any tests that reference it directly).
- Change `DEFAULT_TILE_STYLE` to `DEFAULT_PROVIDER = "none"`.
- Update `MapHandle` interface: add `setProvider`, `setMapboxToken`, `getMapboxToken`.
- Implement the new methods in `initMap`, including the "no tile layer" behaviour for the None provider.
- Run TypeScript build (`npm run build`) and confirm no type errors.

### Task 3 — Update `ui.ts` with conditional provider controls

- Update `renderAppShell` to render the **Map Provider** selector and separate **CartoDB API Key** and **MapBox Access Token** sections; all sections that are provider-conditional start hidden except the provider selector itself.
- Implement `setupProviderSelector` to toggle section visibility and call `mapHandle.setProvider`.
- Update `setupApiKeyInput` to handle both CartoDB and MapBox key inputs.
- Update `updateDownloads` to pass provider and MapBox token to `generateMapHtml`.
- Preserve `#carto-api-key` input id and all CartoDB section IDs/headings for backward compat.
- Run `npm run build`; confirm no type errors or lint errors.

### Task 4 — Update `wasm.ts` to thread the new parameters

- Update the `generateMapHtml` wrapper in `wasm.ts` to accept and pass `provider` and `mapboxToken` alongside `cartoApiKey`.
- Update all call sites in `ui.ts`.

### Task 5 — Update E2E tests

- Update `carto.spec.ts`: add a step that selects the CartoDB provider before interacting with the API key field (so tests pass with None as the new default).
- Add `providers.spec.ts`:
  - Provider selector is visible on load.
  - Default provider is None (no tile images in `.leaflet-tile-pane`).
  - Switching to OpenStreetMap adds tile images with `tile.openstreetmap.org` in `src`.
  - Switching to CartoDB shows the API key section and style selector; switching away hides them.
  - Switching to MapBox shows the token input but not the CartoDB key input; tiles are added immediately (upstream soft-fails on empty token).
  - Entering a MapBox token loads tiles with `api.mapbox.com` in `src`.
  - Switching back to None removes tile images.
  - Session persistence: entering a token, switching to None, then back to MapBox restores the token.

### Task 6 — Update steering and README

- Create `.kiro/steering/mapbox-api.md` (manual inclusion) documenting the MapBox Raster Tiles v1 URL format, the `access_token` parameter, style IDs, and any gotchas (tile size, `@2x` retina suffix).
- Create `.kiro/steering/osm-api.md` (manual inclusion) documenting the OSM tile URL, usage policy (rate limits, attribution requirement), and the Nominatim acceptable use note.
- Update `README.md` to document all four providers and the optional API key / token requirement.
