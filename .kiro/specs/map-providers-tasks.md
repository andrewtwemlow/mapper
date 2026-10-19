# Implementation Tasks: Multi-Provider Map Tiles

Spec: `map-providers.md`

---

## Task 1 — Extend the Rust `generate` function and HTML template

**Files:** `crate/src/html.rs`, `crate/src/lib.rs`, `app/src/wasm-pkg/gpx_mapper.d.ts`

- [ ] Add OSM tile URL constant and attribution constant to `html.rs`.
- [ ] Add MapBox tile URL template constant (using `{style_id}` placeholder) and the four MapBox style ID constants (`streets-v12`, `outdoors-v12`, `satellite-v9`, `satellite-streets-v12`) to `html.rs`.
- [ ] Add MapBox attribution constant to `html.rs`.
- [ ] Update `generate` signature to `generate(tracks: &[Track], provider: &str, carto_api_key: &str, mapbox_token: &str)`.
- [ ] Build the MapBox tile URL from the active style and token inside `generate`, using the same `apply_api_key`-style helper pattern but with `?access_token=` instead of `?key=`.
- [ ] Update the embedded HTML `<script>` block to include:
  - A `PROVIDERS` JS object with all four providers and their tile configs.
  - `var DEFAULT_PROVIDER = "<provider>";` set from the Rust `provider` argument.
  - A provider `<select>` control rendered in the exported HTML UI so the user can switch providers after export.
  - Correct handling for the `none` provider (no tile layer added, white background).
- [ ] Update all existing unit tests in `html.rs` that call `generate` to pass the new parameters; add new tests for:
  - OSM provider: output contains `tile.openstreetmap.org`.
  - MapBox provider with token: output contains `access_token=<token>`.
  - MapBox provider without token: tile URL present but no `access_token=` appended.
  - `none` provider: output does not add a tile layer call.
- [ ] Update `generate_map_html` export in `lib.rs` to accept `provider: &str` and `mapbox_token: &str` and pass them through to `generate`.
- [ ] Run `cargo check` — fix any errors before proceeding.
- [ ] Run `cargo test` — all tests must pass.
- [ ] After any `wasm-pack build`, correct `app/src/wasm-pkg/gpx_mapper.d.ts` so all `): any;` return types are `): unknown;`.

---

## Task 2 — Update `map.ts` with multi-provider support

**Files:** `app/src/map.ts`

- [ ] Add and export `ProviderId` type: `"none" | "carto" | "osm" | "mapbox"`.
- [ ] Add and export `ProviderConfig` interface with fields: `label`, `requiresApiKey` (boolean), `apiKeyLabel?`, `apiKeyPlaceholder?`, `apiKeyInputId?`, `styles?: Record<string, TileLayerConfig>`, `defaultStyle?`.
- [ ] Rename `TILE_LAYERS` to `CARTO_TILE_LAYERS`; keep `export const TILE_LAYERS = CARTO_TILE_LAYERS` as a backward-compat alias (existing tests reference `TILE_LAYERS` by name).
- [ ] Add OSM `TileLayerConfig` inline constant (URL, attribution, max zoom 19).
- [ ] Add MapBox tile layer config entries for all four styles (Streets, Outdoors, Satellite, Satellite Streets) using URL template `https://api.mapbox.com/styles/v1/mapbox/{styleId}/tiles/256/{z}/{x}/{y}@2x?access_token={token}`, max zoom 22, and MapBox attribution.
- [ ] Add and export `PROVIDERS: Record<ProviderId, ProviderConfig>` with all four providers populated.
- [ ] Add and export `DEFAULT_PROVIDER: ProviderId = "none"`. Keep `DEFAULT_TILE_STYLE` exported for backward compat (set it to `"DarkMatter"` as before).
- [ ] Extend `MapHandle` interface:
  - `setProvider(providerId: ProviderId): void`
  - `setMapboxToken(token: string): void`
  - `getMapboxToken(): string`
  - `getProvider(): ProviderId`
- [ ] Implement `setProvider` in `initMap`:
  - Remove the current tile layer (if any).
  - For `"none"`: add no tile layer.
  - For `"osm"`: add the OSM tile layer.
  - For `"carto"`: add the CartoDB tile layer using the current style key and API key.
  - For `"mapbox"`: build the URL from the current MapBox style and token and add the tile layer.
  - Store the new provider so `setTileStyle`, `setApiKey`, and `setMapboxToken` know which layer to rebuild.
- [ ] Implement `setMapboxToken` and `getMapboxToken` (same pattern as `setApiKey`/`getApiKey`).
- [ ] Implement `getProvider`.
- [ ] Update `initMap` so no tile layer is added on startup (default provider is `"none"`).
- [ ] Ensure `setTileStyle` only rebuilds the layer when the active provider is `"carto"` or `"mapbox"` (no-op otherwise).
- [ ] Ensure `setApiKey` only rebuilds the layer when the active provider is `"carto"`.
- [ ] Run `npm run build` from `app/` — fix all TypeScript errors before proceeding.

---

## Task 3 — Update `ui.ts` with conditional provider controls

**Files:** `app/src/ui.ts`

- [ ] Import `PROVIDERS`, `DEFAULT_PROVIDER`, and `ProviderId` from `./map.js`.
- [ ] Update `renderAppShell` to add a **Map Provider** `<section>` (id `provider-heading` on `<h2>`, `provider-selector` on `<select>`) placed above the existing Map Style section. Render one `<option>` per entry in `PROVIDERS` in the declared order; `none` is `selected` by default.
- [ ] In `renderAppShell`, wrap the existing CartoDB API Key section in a container with `id="carto-api-key-section"` and set `hidden` attribute (and `aria-hidden="true"`) by default. Preserve all existing inner element IDs/classes unchanged (`#carto-api-key`, `#api-key-tooltip`, `.api-key-field__info-btn`, `#apikey-heading`).
- [ ] In `renderAppShell`, add a new MapBox Access Token `<section>` with `id="mapbox-token-section"`, `hidden` + `aria-hidden="true"` by default, containing: `<h2 id="mapbox-heading">MapBox Access Token</h2>`, `<input id="mapbox-api-key" placeholder="pk.eyJ1…" aria-label="MapBox access token">`.
- [ ] In `renderAppShell`, set `hidden` + `aria-hidden="true"` on the Map Style section by default (it is shown only for CartoDB and MapBox).
- [ ] Add `setupProviderSelector(mapHandle)` function:
  - Wires `#provider-selector` `change` event to call `mapHandle.setProvider(value as ProviderId)`.
  - Calls a `updateConditionalSections(providerId)` helper that shows/hides `#carto-api-key-section`, `#mapbox-token-section`, and `#style-section` (add `id="style-section"` to the Map Style `<section>` in the shell) by toggling `hidden` and `aria-hidden`.
  - For `"none"` and `"osm"`: all three conditional sections hidden.
  - For `"carto"`: show `#carto-api-key-section` and `#style-section`; hide `#mapbox-token-section`.
  - For `"mapbox"`: show `#mapbox-token-section` and `#style-section`; hide `#carto-api-key-section`.
- [ ] Add `setupMapboxTokenInput(mapHandle)` function (mirrors `setupApiKeyInput`): debounced input on `#mapbox-api-key` calls `mapHandle.setMapboxToken(value)` then `updateDownloads(mapHandle)`.
- [ ] Call `setupProviderSelector(mapHandle)` and `setupMapboxTokenInput(mapHandle)` from `initUI`.
- [ ] Update `updateDownloads` to call `generateMapHtml(tracks, mapHandle.getProvider(), mapHandle.getApiKey(), mapHandle.getMapboxToken())`.
- [ ] Run `npm run build` from `app/` — fix all TypeScript and lint errors.

---

## Task 4 — Update `wasm.ts` to thread the new parameters

**Files:** `app/src/wasm.ts`

- [ ] Update `generateMapHtml` signature to `generateMapHtml(tracks: ParsedTrack[], provider: string, cartoApiKey: string, mapboxToken: string): string`.
- [ ] Pass `provider` and `mapboxToken` through to `generate_map_html(JSON.stringify(tracks), provider, cartoApiKey, mapboxToken)`.
- [ ] Update the JSDoc comment for `generateMapHtml` to document all four parameters.
- [ ] Fix the `gpx_mapper.d.ts` declaration if it was regenerated: ensure `generate_map_html` uses `unknown` not `any` as the return type.
- [ ] Run `npm run build` from `app/` — confirm no type errors.

---

## Task 5 — Update E2E tests

**Files:** `tests/e2e/carto.spec.ts`, `tests/e2e/providers.spec.ts` (new file), `tests/e2e/map.spec.ts`, `tests/e2e/accessibility.spec.ts`

### `carto.spec.ts` updates

- [ ] In `test.beforeEach`, after `page.waitForSelector("#drop-zone")`, add `await page.locator("#provider-selector").selectOption("carto")` and wait for `#carto-api-key-section` to be visible — so all existing tests run against the CartoDB provider as before.

### New `providers.spec.ts`

- [ ] Provider selector (`#provider-selector`) is present and visible on page load.
- [ ] Default selected value is `"none"`.
- [ ] With `"none"` selected: no tile images present in `.leaflet-tile-pane`, CartoDB API key section hidden, MapBox token section hidden, style selector section hidden.
- [ ] Switching to `"osm"`: tile images appear with `tile.openstreetmap.org` in `src`; API key and token sections remain hidden; style selector hidden.
- [ ] Switching to `"carto"`: CartoDB API key section visible, style selector visible, MapBox token section hidden; tile images contain `cartocdn.com`.
- [ ] Switching to `"mapbox"`: MapBox token section visible, style selector visible, CartoDB API key section hidden.
- [ ] With `"mapbox"` selected and a synthetic token entered (debounce settled): tile images contain `api.mapbox.com` and `access_token=<token>`.
- [ ] Switching from `"mapbox"` back to `"none"`: tile images removed.
- [ ] Session persistence — entering a MapBox token, switching to `"none"`, then back to `"mapbox"`: the token input retains its value and tile URLs still contain the token.
- [ ] Session persistence — selecting a CartoDB style, switching to `"osm"`, then back to `"carto"`: the previously selected style is still active in `#tile-selector`.

### `map.spec.ts` updates

- [ ] Update "Default tile style is CartoDB.DarkMatter" test: first select `carto` from `#provider-selector`, then assert the tile style. (Default map provider is now `none`, not `carto`.)
- [ ] Add test: on page load with default (`none`) provider, no tile images are present in `.leaflet-tile-pane`.

### `accessibility.spec.ts` updates

- [ ] Add: provider selector has an accessible label (`aria-label` or associated `<label>`).
- [ ] Add: MapBox token input has an accessible label.
- [ ] Add: conditional sections that are hidden carry `aria-hidden="true"`.

---

## Task 6 — Steering files and README

**Files:** `.kiro/steering/mapbox-api.md` (new), `.kiro/steering/osm-api.md` (new), `README.md`

### `.kiro/steering/mapbox-api.md`

- [x] Create with front-matter `inclusion: manual`, `name: mapbox-api`, `description: Reference for MapBox Raster Tiles v1 API usage`.
- [x] Document the raster tile URL format: `https://api.mapbox.com/styles/v1/mapbox/{style_id}/tiles/{tilesize}/{z}/{x}/{y}[@2x]?access_token={token}`.
- [x] List all supported style IDs used in this project with their labels.
- [x] Note: tile size is `256` (standard); append `@2x` for retina/HiDPI displays.
- [x] Note: `access_token` is the query parameter name — not `key`.
- [x] Note: the token starts with `pk.` (public token) or `sk.` (secret token — never embed in client-side code).
- [x] Attribution requirement: `© Mapbox © OpenStreetMap contributors`.
- [x] Link to MapBox Raster Tiles API docs.

### `.kiro/steering/osm-api.md`

- [x] Create with front-matter `inclusion: manual`, `name: osm-api`, `description: Reference for OpenStreetMap tile usage policy and URL format`.
- [x] Document the tile URL template: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`.
- [x] Attribution requirement: `© OpenStreetMap contributors` with link to `openstreetmap.org/copyright`.
- [x] Usage policy: OSM tiles are for light use only — heavy/automated requests must use a self-hosted tile server or a commercial provider. Link to the OSM Tile Usage Policy.
- [x] Note: `{s}` subdomains are `a`, `b`, `c` (Leaflet handles this automatically).
- [x] Note: Nominatim (geocoding) has a separate acceptable-use policy and is not used in this project.

### `README.md`

- [x] Add a **Map Providers** section documenting all four providers, which require API keys/tokens, and where to obtain them.
- [x] Note that the default provider is **None** (plain white background, works offline).
- [x] Note that CartoDB and MapBox API keys are optional — tiles load without one but may be rate-limited or rejected by the upstream service.
