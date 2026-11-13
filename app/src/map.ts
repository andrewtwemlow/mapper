/**
 * Leaflet map initialisation and track rendering.
 *
 * Owns the Leaflet map instance and exposes methods for adding/removing
 * tracks, switching providers/styles, and managing API keys. No direct DOM
 * manipulation outside the map container element.
 */

import type { Map as LeafletMap, TileLayer, Polyline } from "leaflet";
import type { ParsedTrack } from "./wasm.js";
import { DEFAULT_COLOURS } from "./colours.js";

/** Leaflet is loaded from CDN and attached to `window.L` at runtime. */
declare const L: typeof import("leaflet");

// ── Tile layer config ─────────────────────────────────────────────────────────

/** A single tile style within a provider. */
export interface TileLayerConfig {
  /** Human-readable label shown in the style selector UI. */
  label: string;
  /** Leaflet tile URL template (without authentication query parameters). */
  url: string;
  /** Attribution string required by the tile licence. */
  attribution: string;
  /** Maximum zoom level supported by this tile style. */
  maxZoom: number;
}

// ── Provider types ────────────────────────────────────────────────────────────

/** Identifies a map tile provider. */
export type ProviderId = "none" | "carto" | "osm" | "mapbox";

/**
 * Top-level descriptor for a map tile provider.
 *
 * Providers with no styles (e.g. `none`) leave `styles` and `defaultStyle`
 * undefined. Single-style providers (e.g. `osm`) have exactly one entry in
 * `styles`. Multi-style providers (e.g. `carto`, `mapbox`) have more than one.
 */
export interface ProviderConfig {
  /** Human-readable provider name for the UI. */
  label: string;
  /**
   * Whether the provider accepts an API key / token.
   * Controls visibility of the key input section in the sidebar.
   */
  hasApiKey: boolean;
  /** Label for the API key / token input (e.g. "CartoDB API Key"). */
  apiKeyLabel?: string;
  /** Placeholder for the API key / token input (e.g. "Enter your API key"). */
  apiKeyPlaceholder?: string;
  /** DOM id of the API key / token input element. */
  apiKeyInputId?: string;
  /** All tile styles for this provider, keyed by style identifier. */
  styles?: Record<string, TileLayerConfig>;
  /** The style key to select by default for this provider. */
  defaultStyle?: string;
}

// ── CartoDB styles ────────────────────────────────────────────────────────────

/** Attribution shared by all CartoDB styles. */
const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

/** Maximum zoom level for CartoDB tiles. */
const CARTO_MAX_ZOOM = 19;

/**
 * All available CartoDB tile styles.
 *
 * @deprecated Use `PROVIDERS.carto.styles` instead. Retained for backward
 * compatibility with existing tests that import `TILE_LAYERS` directly.
 */
export const CARTO_TILE_LAYERS: Record<string, TileLayerConfig> = {
  DarkMatter: {
    label: "Dark Matter",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: CARTO_ATTRIBUTION,
    maxZoom: CARTO_MAX_ZOOM,
  },
  DarkMatterNoLabels: {
    label: "Dark Matter (No Labels)",
    url: "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
    attribution: CARTO_ATTRIBUTION,
    maxZoom: CARTO_MAX_ZOOM,
  },
  Positron: {
    label: "Positron",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: CARTO_ATTRIBUTION,
    maxZoom: CARTO_MAX_ZOOM,
  },
  Voyager: {
    label: "Voyager",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution: CARTO_ATTRIBUTION,
    maxZoom: CARTO_MAX_ZOOM,
  },
} as const;

/**
 * Backward-compat alias for `CARTO_TILE_LAYERS`.
 *
 * @deprecated Remaining caller: `tests/e2e/carto.spec.ts` (Task 5 of the
 * map-providers spec will migrate that test to use `PROVIDERS` and remove
 * this alias). Do not introduce new callers.
 */
export const TILE_LAYERS = CARTO_TILE_LAYERS;

/**
 * The default CartoDB style key, used when the CartoDB provider is selected.
 * Retained for backward compatibility.
 */
export const DEFAULT_TILE_STYLE = "DarkMatter";

// ── OSM ───────────────────────────────────────────────────────────────────────

/** Maximum zoom level for OpenStreetMap tiles. */
const OSM_MAX_ZOOM = 19;

// ── MapBox styles ─────────────────────────────────────────────────────────────

/** Attribution shared by all MapBox styles. */
const MAPBOX_ATTRIBUTION =
  '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Maximum zoom level for MapBox tiles. */
const MAPBOX_MAX_ZOOM = 22;

/**
 * Build a MapBox Raster Tiles v1 URL for a given style ID.
 *
 * The `access_token` query parameter is appended when the token is non-empty.
 * MapBox soft-fails on missing/invalid tokens so we always add the layer.
 *
 * @param styleId - The MapBox style identifier (e.g. `"streets-v12"`).
 * @param token - The MapBox public access token, or `""` if not set.
 */
function buildMapboxUrl(styleId: string, token: string): string {
  const base = `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/256/{z}/{x}/{y}@2x`;
  const t = token.trim();
  return t.length > 0 ? `${base}?access_token=${t}` : base;
}

// ── Provider registry ─────────────────────────────────────────────────────────

/** All available map providers in display order. */
export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  none: {
    label: "None",
    hasApiKey: false,
  },
  carto: {
    label: "CartoDB",
    hasApiKey: true,
    apiKeyLabel: "CartoDB API Key",
    apiKeyPlaceholder: "Enter your CartoDB API key",
    apiKeyInputId: "carto-api-key",
    defaultStyle: DEFAULT_TILE_STYLE,
    styles: CARTO_TILE_LAYERS,
  },
  osm: {
    label: "OpenStreetMap",
    hasApiKey: false,
    defaultStyle: "Standard",
    styles: {
      Standard: {
        label: "Standard",
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: OSM_MAX_ZOOM,
      },
    },
  },
  mapbox: {
    label: "MapBox",
    hasApiKey: true,
    apiKeyLabel: "MapBox Access Token",
    apiKeyPlaceholder: "pk.eyJ1…",
    apiKeyInputId: "mapbox-api-key",
    defaultStyle: "Streets",
    // Styles are rebuilt with the current token on each provider/token change;
    // these entries use placeholder URLs that are replaced in initMap.
    styles: {
      Streets: {
        label: "Streets",
        url: buildMapboxUrl("streets-v12", ""),
        attribution: MAPBOX_ATTRIBUTION,
        maxZoom: MAPBOX_MAX_ZOOM,
      },
      Outdoors: {
        label: "Outdoors",
        url: buildMapboxUrl("outdoors-v12", ""),
        attribution: MAPBOX_ATTRIBUTION,
        maxZoom: MAPBOX_MAX_ZOOM,
      },
      Satellite: {
        label: "Satellite",
        url: buildMapboxUrl("satellite-v9", ""),
        attribution: MAPBOX_ATTRIBUTION,
        maxZoom: MAPBOX_MAX_ZOOM,
      },
      SatelliteStreets: {
        label: "Satellite Streets",
        url: buildMapboxUrl("satellite-streets-v12", ""),
        attribution: MAPBOX_ATTRIBUTION,
        maxZoom: MAPBOX_MAX_ZOOM,
      },
    },
  },
} as const;

/** The default provider shown on page load. */
export const DEFAULT_PROVIDER: ProviderId = "none";

// ── MapBox style ID lookup ────────────────────────────────────────────────────

/** Maps MapBox style keys (as used in `PROVIDERS`) to their API style IDs. */
const MAPBOX_STYLE_IDS: Record<string, string> = {
  Streets: "streets-v12",
  Outdoors: "outdoors-v12",
  Satellite: "satellite-v9",
  SatelliteStreets: "satellite-streets-v12",
};

// ── CartoDB URL builder ───────────────────────────────────────────────────────

/**
 * Append a CartoDB `?key=` query parameter to a tile URL when the key is non-empty.
 *
 * @param baseUrl - The tile URL template without any query string.
 * @param apiKey - The CartoDB API key, or `""` if not set.
 */
function buildCartoUrl(baseUrl: string, apiKey: string): string {
  const key = apiKey.trim();
  return key.length > 0 ? `${baseUrl}?key=${key}` : baseUrl;
}

// ── MapHandle interface ───────────────────────────────────────────────────────

/** Map instance handle returned by {@link initMap}. */
export interface MapHandle {
  /** The underlying Leaflet map instance. */
  leafletMap: LeafletMap;

  /**
   * Add a track to the map as a coloured polyline.
   * @param track - The parsed track to render.
   */
  addTrack: (track: ParsedTrack) => void;

  /** Remove all track polylines from the map. */
  clearTracks: () => void;

  /**
   * Switch the active map provider.
   * Removes the current tile layer and adds the appropriate new one.
   * @param providerId - A key from {@link PROVIDERS}.
   */
  setProvider: (providerId: ProviderId) => void;

  /**
   * Return the currently active provider id.
   */
  getProvider: () => ProviderId;

  /**
   * Switch the active tile style within the current provider.
   * No-op if the current provider has no styles or the key is unknown.
   * @param styleKey - A style key within the current provider's `styles` map.
   */
  setTileStyle: (styleKey: string) => void;

  /**
   * Update the CartoDB API key and reload the tile layer when CartoDB is active.
   * @param apiKey - The new API key, or `""` to remove it.
   */
  setApiKey: (apiKey: string) => void;

  /**
   * Return the current CartoDB API key (may be empty string).
   */
  getApiKey: () => string;

  /**
   * Update the MapBox access token and reload the tile layer when MapBox is active.
   * @param token - The new access token, or `""` to remove it.
   */
  setMapboxToken: (token: string) => void;

  /**
   * Return the current MapBox access token (may be empty string).
   */
  getMapboxToken: () => string;

  /**
   * Fit the map viewport to the bounds of all currently rendered tracks.
   * No-op if no tracks have been added.
   */
  fitTracks: () => void;

  /**
   * Update the colour of a rendered track polyline by track name.
   * @param name - The track name as returned by the parser.
   * @param colour - A CSS hex colour string (e.g. `#1f77b4`).
   */
  setTrackColour: (name: string, colour: string) => void;

  /**
   * Remove a single track polyline from the map by track name.
   * @param name - The track name as returned by the parser.
   */
  removeTrack: (name: string) => void;

  /**
   * Show or hide a track polyline without removing it from the internal store.
   * @param name - The track name as returned by the parser.
   * @param visible - `true` to show; `false` to hide.
   */
  setTrackVisible: (name: string, visible: boolean) => void;

  /**
   * Reorder track polylines so their SVG paint order matches the given name
   * array. The first entry in `orderedNames` will be painted on top; the last
   * will be painted at the bottom.
   *
   * Hidden tracks retain their position in the stacking order and will appear
   * in the correct position when made visible again.
   *
   * @param orderedNames - Track names in top-to-bottom visual order.
   */
  reorderTracks: (orderedNames: string[]) => void;
}

// ── initMap ───────────────────────────────────────────────────────────────────

/** Default view centre when no tracks are loaded (null island). */
const DEFAULT_CENTER: [number, number] = [0, 0];

/** Default zoom level when no tracks are loaded. */
const DEFAULT_ZOOM = 2;

/**
 * Initialise the Leaflet map inside the element with the given `containerId`.
 *
 * The default provider is {@link DEFAULT_PROVIDER} (`"none"`) — no tile layer
 * is added on startup. Call {@link MapHandle.setProvider} to switch providers.
 *
 * @param containerId - The `id` of the HTML element to mount the map into.
 * @returns A handle for controlling the map.
 */
export function initMap(containerId: string): MapHandle {
  const map: LeafletMap = L.map(containerId, {
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
  });

  // ── Mutable state ──────────────────────────────────────────────────────────

  let currentProvider: ProviderId = DEFAULT_PROVIDER;
  let currentTile: TileLayer | null = null;

  // Per-provider style selections — preserved when switching away and back.
  const activeStyles: Partial<Record<ProviderId, string>> = {
    carto: DEFAULT_TILE_STYLE,
    osm: "Standard",
    mapbox: "Streets",
  };

  let cartoApiKey = "";
  let mapboxToken = "";

  // Track polylines keyed by track name for colour updates.
  const polylines = new Map<string, Polyline>();

  // All rendered lat/lon pairs for bounds fitting.
  const allLatLngs: [number, number][] = [];

  // ── Internal helpers ───────────────────────────────────────────────────────

  /** Remove the current tile layer from the map, if any. */
  function removeTileLayer(): void {
    if (currentTile) {
      currentTile.remove();
      currentTile = null;
    }
  }

  /**
   * Build the tile URL for the given provider and style, injecting the
   * current API key / token as appropriate.
   */
  function buildTileUrl(providerId: ProviderId, styleKey: string): string | null {
    const provider = PROVIDERS[providerId];
    if (!provider.styles) return null;
    const style = provider.styles[styleKey];
    if (!style) return null;

    if (providerId === "carto") {
      return buildCartoUrl(style.url, cartoApiKey);
    }
    if (providerId === "mapbox") {
      const styleId = MAPBOX_STYLE_IDS[styleKey];
      if (!styleId) return null;
      return buildMapboxUrl(styleId, mapboxToken);
    }
    // osm — URL is used as-is
    return style.url;
  }

  /** Add a tile layer for the given provider + style key. */
  function addTileLayer(providerId: ProviderId, styleKey: string): void {
    const provider = PROVIDERS[providerId];
    if (!provider.styles) return;
    const style = provider.styles[styleKey];
    if (!style) return;

    const url = buildTileUrl(providerId, styleKey);
    if (!url) return;

    currentTile = L.tileLayer(url, {
      attribution: style.attribution,
      maxZoom: style.maxZoom,
    }).addTo(map);
  }

  // ── MapHandle implementation ───────────────────────────────────────────────

  return {
    leafletMap: map,

    addTrack(track: ParsedTrack): void {
      const latlngs: [number, number][] = track.points.map((p) => [p.lat, p.lon]);
      const polyline = L.polyline(latlngs, {
        color: track.colour ?? DEFAULT_COLOURS[0],
        weight: 2,
        opacity: 1,
      })
        .bindTooltip(track.name)
        .addTo(map);

      polylines.set(track.name, polyline);
      allLatLngs.push(...latlngs);
    },

    clearTracks(): void {
      polylines.forEach((polyline) => polyline.remove());
      polylines.clear();
      allLatLngs.length = 0;
    },

    setProvider(providerId: ProviderId): void {
      if (!PROVIDERS[providerId]) return;
      removeTileLayer();
      currentProvider = providerId;
      const styleKey = activeStyles[providerId];
      if (styleKey) {
        addTileLayer(providerId, styleKey);
      }
    },

    getProvider(): ProviderId {
      return currentProvider;
    },

    setTileStyle(styleKey: string): void {
      const provider = PROVIDERS[currentProvider];
      if (!provider.styles || !provider.styles[styleKey]) return;
      activeStyles[currentProvider] = styleKey;
      removeTileLayer();
      addTileLayer(currentProvider, styleKey);
    },

    setApiKey(apiKey: string): void {
      cartoApiKey = apiKey;
      if (currentProvider === "carto") {
        const styleKey = activeStyles.carto ?? DEFAULT_TILE_STYLE;
        removeTileLayer();
        addTileLayer("carto", styleKey);
      }
    },

    getApiKey(): string {
      return cartoApiKey;
    },

    setMapboxToken(token: string): void {
      mapboxToken = token;
      if (currentProvider === "mapbox") {
        const styleKey = activeStyles.mapbox ?? "Streets";
        removeTileLayer();
        addTileLayer("mapbox", styleKey);
      }
    },

    getMapboxToken(): string {
      return mapboxToken;
    },

    fitTracks(): void {
      if (allLatLngs.length === 0) return;
      map.fitBounds(L.latLngBounds(allLatLngs));
    },

    setTrackColour(name: string, colour: string): void {
      const polyline = polylines.get(name);
      if (polyline) {
        polyline.setStyle({ color: colour });
      }
    },

    removeTrack(name: string): void {
      const polyline = polylines.get(name);
      if (polyline) {
        polyline.remove();
        polylines.delete(name);
      }
    },

    setTrackVisible(name: string, visible: boolean): void {
      const polyline = polylines.get(name);
      if (!polyline) return;
      if (visible) {
        polyline.addTo(map);
      } else {
        polyline.remove();
      }
    },

    reorderTracks(orderedNames: string[]): void {
      // Paint order in SVG: later elements appear on top.
      // To make orderedNames[0] the topmost layer, call bringToFront from
      // last to first so the final bringToFront call lands on orderedNames[0].
      for (let i = orderedNames.length - 1; i >= 0; i--) {
        const polyline = polylines.get(orderedNames[i] ?? "");
        if (polyline) {
          polyline.bringToFront();
        }
      }
    },
  };
}
