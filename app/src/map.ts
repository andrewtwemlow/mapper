/**
 * Leaflet map initialisation and track rendering.
 *
 * Owns the Leaflet map instance and exposes methods for adding/removing
 * tracks and switching tile layers. No direct DOM manipulation outside the
 * map container element.
 */

import type { Map as LeafletMap, TileLayer, Polyline } from "leaflet";
import type { ParsedTrack } from "./wasm.js";
import { DEFAULT_COLOURS } from "./colours.js";

/** Leaflet is loaded from CDN and attached to `window.L` at runtime. */
declare const L: typeof import("leaflet");

/** CartoDB tile layer configuration entry. */
export interface TileLayerConfig {
  /** Human-readable label shown in the tile selector UI. */
  label: string;
  /** Leaflet tile URL template. */
  url: string;
  /** Attribution string required by the tile licence. */
  attribution: string;
}

/** All available CartoDB tile styles. */
export const TILE_LAYERS: Record<string, TileLayerConfig> = {
  DarkMatter: {
    label: "Dark Matter",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  DarkMatterNoLabels: {
    label: "Dark Matter (No Labels)",
    url: "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  Positron: {
    label: "Positron",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  Voyager: {
    label: "Voyager",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
} as const;

/** The default tile style key, must be a key of {@link TILE_LAYERS}. */
export const DEFAULT_TILE_STYLE = "DarkMatter";

/** Default maximum zoom level for CartoDB tile layers. */
const MAX_ZOOM = 19;

/** Default view centre when no tracks are loaded (null island). */
const DEFAULT_CENTER: [number, number] = [0, 0];

/** Default zoom level when no tracks are loaded. */
const DEFAULT_ZOOM = 2;

/** Map instance handle returned by {@link initMap}. */
export interface MapHandle {
  /** The underlying Leaflet map instance. */
  leafletMap: LeafletMap;
  /**
   * Add a track to the map as a coloured polyline.
   * @param track - The parsed track to render.
   */
  addTrack: (track: ParsedTrack) => void;
  /**
   * Remove all track polylines from the map.
   */
  clearTracks: () => void;
  /**
   * Switch the active base tile layer.
   * @param styleKey - A key from {@link TILE_LAYERS}.
   */
  setTileStyle: (styleKey: string) => void;
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
}

/**
 * Initialise the Leaflet map inside the element with the given `containerId`.
 *
 * Sets up the default CartoDB DarkMatter tile layer and returns a
 * {@link MapHandle} for interacting with the map.
 *
 * @param containerId - The `id` of the HTML element to mount the map into.
 * @returns A handle for controlling the map.
 */
export function initMap(containerId: string): MapHandle {
  const map: LeafletMap = L.map(containerId, {
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
  });

  // Active tile layer reference — replaced when the user switches styles.
  let currentTile: TileLayer = addTileLayer(map, DEFAULT_TILE_STYLE);

  // Track polylines keyed by track name for colour updates.
  const polylines = new Map<string, Polyline>();

  // All rendered lat/lon pairs for bounds fitting.
  const allLatLngs: [number, number][] = [];

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

    setTileStyle(styleKey: string): void {
      const config = TILE_LAYERS[styleKey];
      if (!config) return;
      currentTile.remove();
      currentTile = addTileLayer(map, styleKey);
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
  };
}

/**
 * Add a CartoDB tile layer to the map by style key.
 *
 * @param map - The Leaflet map instance to add the layer to.
 * @param styleKey - A key from {@link TILE_LAYERS}.
 * @returns The created `TileLayer`.
 */
function addTileLayer(map: LeafletMap, styleKey: string): TileLayer {
  const config = TILE_LAYERS[styleKey] ?? TILE_LAYERS[DEFAULT_TILE_STYLE];
  return L.tileLayer(config.url, {
    attribution: config.attribution,
    maxZoom: MAX_ZOOM,
  }).addTo(map);
}
