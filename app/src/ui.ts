/**
 * File upload UI, track list, colour picker, tile selector, API key input,
 * and download links.
 *
 * Owns all DOM interaction outside the Leaflet map container. Communicates
 * with the map via the {@link MapHandle} interface and with the Wasm layer
 * exclusively through `./wasm.ts`.
 */

import type { MapHandle, ProviderId } from "./map.js";
import { PROVIDERS, DEFAULT_PROVIDER } from "./map.js";
import {
  parseGpx,
  parseFit,
  parseTcx,
  parseKml,
  generateCombinedGpx,
  generateMapHtml,
  isSupportedFile,
  getFileExtension,
  type ParsedTrack,
} from "./wasm.js";
import { assignTrackColour, DEFAULT_COLOURS } from "./colours.js";
import { showElevationProfile, hideElevationProfile, updateElevationColour } from "./elevation.js";

/** MIME type for GPX download links. */
const GPX_MIME_TYPE = "application/gpx+xml";

/** MIME type for HTML download links. */
const HTML_MIME_TYPE = "text/html";

/** CSS class applied to the upload drop zone when a drag is active. */
const DRAG_ACTIVE_CLASS = "drop-zone--active";

/**
 * Debounce delay in milliseconds for the API key input.
 * Waits for the user to stop typing before applying the key to avoid
 * hammering CartoDB with repeated tile requests on every keystroke.
 */
const API_KEY_DEBOUNCE_MS = 600;

/** All tracks parsed so far in the current session, in upload order. */
const tracks: ParsedTrack[] = [];

/**
 * Check whether a track has any points with elevation data.
 *
 * @param track - The track to check.
 * @returns `true` if at least one point has a numeric `ele` value.
 */
function hasElevation(track: ParsedTrack): boolean {
  return track.points.some((p) => typeof p.ele === "number");
}

/**
 * Show or hide the elevation profile based on the current track count.
 *
 * The profile is shown only when exactly one track is loaded and that track
 * has at least one point with elevation data. In all other cases the panel
 * is hidden and the map reclaims the full height.
 *
 * @param mapHandle - Used to access the Leaflet map instance.
 */
function updateElevationView(mapHandle: MapHandle): void {
  if (tracks.length === 1 && hasElevation(tracks[0])) {
    showElevationProfile(tracks[0], tracks[0].colour ?? DEFAULT_COLOURS[0], mapHandle.leafletMap);
  } else {
    hideElevationProfile();
  }
}

/**
 * Initialise all UI components and wire them to the map.
 *
 * Must be called after the Wasm module is initialised and the map is ready.
 *
 * @param mapHandle - The map handle returned by `initMap`.
 */
export function initUI(mapHandle: MapHandle): void {
  setupProviderSelector(mapHandle);
  setupApiKeyInput(mapHandle);
  setupMapboxTokenInput(mapHandle);
  setupDropZone(mapHandle);
  setupTileSelector(mapHandle);
}

/**
 * Render the full application shell into `#app`.
 *
 * Must be called before {@link initMap} so the map container element exists
 * in the DOM when Leaflet attempts to mount into it. Called directly from
 * `main.ts` before the map is initialised.
 *
 * Builds the static HTML structure: API key input, upload area, track list,
 * tile selector, and download section. All dynamic content is injected into
 * named slots within this structure.
 */
export function renderAppShell(): void {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `
    <div class="layout">
      <aside class="sidebar" aria-label="Controls">
        <header class="sidebar__header">
          <h1 class="sidebar__title">GPX Mapper</h1>
        </header>

        <section class="sidebar__section" aria-labelledby="provider-heading">
          <h2 id="provider-heading" class="sidebar__section-title">Map Provider</h2>
          <label for="provider-selector" class="visually-hidden">Map provider</label>
          <select id="provider-selector" class="tile-selector" aria-label="Map provider">
            ${Object.entries(PROVIDERS)
              .map(
                ([key, cfg]) =>
                  `<option value="${key}"${key === DEFAULT_PROVIDER ? " selected" : ""}>${cfg.label}</option>`,
              )
              .join("\n            ")}
          </select>
        </section>

        <section id="carto-api-key-section" class="sidebar__section" aria-labelledby="apikey-heading" hidden aria-hidden="true">
          <h2 id="apikey-heading" class="sidebar__section-title">CartoDB API Key</h2>
          <div class="api-key-field">
            <div class="api-key-field__input-row">
              <label for="carto-api-key" class="visually-hidden">CartoDB API key</label>
              <input
                id="carto-api-key"
                type="text"
                class="api-key-field__input"
                placeholder="Enter your CartoDB API key"
                aria-label="CartoDB API key"
                autocomplete="off"
                spellcheck="false"
              />
              <button
                class="api-key-field__info-btn"
                aria-label="API key security information"
                aria-describedby="api-key-tooltip"
                type="button"
              >?</button>
            </div>
            <div
              id="api-key-tooltip"
              class="api-key-field__tooltip"
              role="tooltip"
            >
              Your API key will be embedded in the downloaded HTML map file.
              Caution: anyone with the file can read the key. Do not share the
              downloaded map if you want to keep your key private.
            </div>
          </div>
        </section>

        <section id="mapbox-token-section" class="sidebar__section" aria-labelledby="mapbox-heading" hidden aria-hidden="true">
          <h2 id="mapbox-heading" class="sidebar__section-title">MapBox Access Token</h2>
          <label for="mapbox-api-key" class="visually-hidden">MapBox access token</label>
          <input
            id="mapbox-api-key"
            type="text"
            class="api-key-field__input"
            placeholder="pk.eyJ1…"
            aria-label="MapBox access token"
            autocomplete="off"
            spellcheck="false"
          />
        </section>

        <section id="style-section" class="sidebar__section" aria-labelledby="style-heading" hidden aria-hidden="true">
          <h2 id="style-heading" class="sidebar__section-title">Map Style</h2>
          <label for="tile-selector" class="visually-hidden">Map tile style</label>
          <select id="tile-selector" class="tile-selector" aria-label="Map tile style">
          </select>
        </section>

        <section class="sidebar__section" aria-labelledby="upload-heading">
          <h2 id="upload-heading" class="sidebar__section-title">Upload Files</h2>
          <div
            id="drop-zone"
            class="drop-zone"
            role="button"
            tabindex="0"
            aria-label="Upload GPX, FIT, TCX, or KML files. Click or drag and drop."
          >
            <p class="drop-zone__hint">
              Drop files here or <span class="drop-zone__link">click to browse</span>
            </p>
            <p class="drop-zone__formats">GPX · FIT · FIT.GZ · TCX · TCX.GZ · KML · KML.GZ</p>
          </div>
          <input
            id="file-input"
            type="file"
            accept=".gpx,.fit,.tcx,.gz,.kml"
            multiple
            aria-label="Select activity files"
            class="visually-hidden"
          />
          <div id="error-list" role="alert" aria-live="polite" aria-label="Upload errors"></div>
        </section>

        <section class="sidebar__section" aria-labelledby="tracks-heading">
          <h2 id="tracks-heading" class="sidebar__section-title">Tracks</h2>
          <ul id="track-list" class="track-list" aria-label="Uploaded tracks"></ul>
        </section>

        <section class="sidebar__section" aria-labelledby="downloads-heading">
          <h2 id="downloads-heading" class="sidebar__section-title">Downloads</h2>
          <div id="download-section" class="downloads">
            <p class="downloads__empty">Upload tracks to enable downloads.</p>
          </div>
        </section>
      </aside>

      <main class="map-area" aria-label="Map">
        <div class="map-and-elevation">
          <div id="map-container" class="map-container"></div>
          <section
            id="elevation-panel"
            class="elevation-panel elevation-panel--hidden"
            role="region"
            aria-label="Elevation profile"
          >
            <div class="elevation-resize-handle" aria-hidden="true"></div>
            <canvas
              id="elevation-canvas"
              class="elevation-canvas"
              aria-label="Elevation profile"
            ></canvas>
          </section>
        </div>
      </main>
    </div>
  `;
}

/**
 * Set up the CartoDB API key input with debounced application to the map and
 * tooltip toggle behaviour on the info button.
 *
 * The key is applied to the map tile layer after the user stops typing for
 * {@link API_KEY_DEBOUNCE_MS} ms to avoid repeated tile requests mid-entry.
 * Download links are regenerated whenever the key changes so the exported
 * HTML always embeds the current key.
 *
 * @param mapHandle - Used to call `setApiKey` once the debounce settles.
 */
function setupApiKeyInput(mapHandle: MapHandle): void {
  const input = document.getElementById("carto-api-key") as HTMLInputElement | null;
  const infoBtn = document.querySelector(".api-key-field__info-btn") as HTMLButtonElement | null;
  const tooltip = document.getElementById("api-key-tooltip");

  if (!input || !infoBtn || !tooltip) return;

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      mapHandle.setApiKey(input.value);
      updateDownloads(mapHandle);
    }, API_KEY_DEBOUNCE_MS);
  });

  // Toggle tooltip visibility on info button click.
  infoBtn.addEventListener("click", () => {
    const isVisible = tooltip.classList.toggle("api-key-field__tooltip--visible");
    infoBtn.setAttribute("aria-expanded", String(isVisible));
  });

  // Dismiss tooltip when focus leaves the entire api-key-field block.
  input.addEventListener("blur", () => {
    // Small delay so a click on the info button is processed first.
    setTimeout(() => {
      if (document.activeElement !== infoBtn) {
        tooltip.classList.remove("api-key-field__tooltip--visible");
        infoBtn.setAttribute("aria-expanded", "false");
      }
    }, 150);
  });
}

/**
 * Repopulate the `#tile-selector` options with the styles for the given provider.
 *
 * Called whenever the active provider changes so the selector always shows the
 * correct labels and values (CartoDB styles for `"carto"`, MapBox styles for
 * `"mapbox"`). For providers without styles (`"none"`, `"osm"`) the selector
 * is hidden and its options are cleared.
 *
 * The `activeStyleKey` is pre-selected when it exists in the new provider's
 * style list (e.g. switching away from carto and back again keeps the user's
 * chosen style). Otherwise falls back to the provider's `defaultStyle`.
 *
 * @param providerId - The newly selected provider.
 * @param activeStyleKey - The style key currently active in the map for this provider.
 */
function populateStyleSelector(providerId: ProviderId, activeStyleKey?: string): void {
  const selector = document.getElementById("tile-selector") as HTMLSelectElement | null;
  if (!selector) return;

  const provider = PROVIDERS[providerId];
  const styles = provider.styles;

  if (!styles) {
    selector.innerHTML = "";
    return;
  }

  // Preserve the active style if it exists in this provider's list,
  // otherwise fall back to the provider's declared default.
  const selectedKey =
    activeStyleKey && styles[activeStyleKey] ? activeStyleKey : provider.defaultStyle;

  selector.innerHTML = Object.entries(styles)
    .map(
      ([key, cfg]) =>
        `<option value="${key}"${key === selectedKey ? " selected" : ""}>${cfg.label}</option>`,
    )
    .join("");
}

/**
 * Show or hide the conditional sidebar sections based on the active provider,
 * and repopulate the style selector with the provider's available styles.
 *
 * - `none` / `osm`: all three conditional sections hidden.
 * - `carto`: CartoDB API key section and style section visible; MapBox token hidden.
 * - `mapbox`: MapBox token section and style section visible; CartoDB API key hidden.
 *
 * @param providerId - The newly selected provider.
 * @param activeStyleKey - The style key currently active in the map for this provider.
 */
function updateConditionalSections(providerId: ProviderId, activeStyleKey?: string): void {
  const cartoSection = document.getElementById("carto-api-key-section");
  const mapboxSection = document.getElementById("mapbox-token-section");
  const styleSection = document.getElementById("style-section");

  if (!cartoSection || !mapboxSection || !styleSection) return;

  const showCarto = providerId === "carto";
  const showMapbox = providerId === "mapbox";
  const showStyle = showCarto || showMapbox;

  cartoSection.hidden = !showCarto;
  cartoSection.setAttribute("aria-hidden", String(!showCarto));

  mapboxSection.hidden = !showMapbox;
  mapboxSection.setAttribute("aria-hidden", String(!showMapbox));

  styleSection.hidden = !showStyle;
  styleSection.setAttribute("aria-hidden", String(!showStyle));

  if (showStyle) {
    populateStyleSelector(providerId, activeStyleKey);
  }
}

/**
 * Set up the provider `<select>` element to switch map tile providers and
 * show/hide the corresponding conditional sections.
 *
 * Tracks the last active style per provider so the selector is repopulated
 * with the correct style when the user switches back to a previously-used
 * provider.
 *
 * @param mapHandle - Used to call `setProvider` on selection change.
 */
function setupProviderSelector(mapHandle: MapHandle): void {
  const selector = document.getElementById("provider-selector") as HTMLSelectElement | null;
  if (!selector) return;

  // Remembers the last active style key for each provider across switches.
  const savedStyles: Partial<Record<ProviderId, string>> = {};

  selector.addEventListener("change", () => {
    const providerId = selector.value as ProviderId;

    // Save the current style selection for the outgoing provider before switching.
    const tileSelector = document.getElementById("tile-selector") as HTMLSelectElement | null;
    const outgoing = mapHandle.getProvider();
    if (tileSelector && tileSelector.value) {
      savedStyles[outgoing] = tileSelector.value;
    }

    mapHandle.setProvider(providerId);
    updateConditionalSections(providerId, savedStyles[providerId]);
  });
}

/**
 * Set up the MapBox access token input with debounced application to the map.
 *
 * The token is applied to the map tile layer after the user stops typing for
 * {@link API_KEY_DEBOUNCE_MS} ms to avoid repeated tile requests mid-entry.
 * Download links are regenerated whenever the token changes so the exported
 * HTML always embeds the current token.
 *
 * @param mapHandle - Used to call `setMapboxToken` once the debounce settles.
 */
function setupMapboxTokenInput(mapHandle: MapHandle): void {
  const input = document.getElementById("mapbox-api-key") as HTMLInputElement | null;
  if (!input) return;

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      mapHandle.setMapboxToken(input.value);
      updateDownloads(mapHandle);
    }, API_KEY_DEBOUNCE_MS);
  });
}

/**
 * Set up drag-and-drop and click-to-upload on the drop zone element.
 *
 * @param mapHandle - Used to add tracks to the map after parsing.
 */
function setupDropZone(mapHandle: MapHandle): void {
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input") as HTMLInputElement | null;

  if (!dropZone || !fileInput) return;

  // Click / keyboard activation opens the file picker.
  dropZone.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  // Drag-and-drop visual feedback.
  dropZone.addEventListener("dragover", (e: DragEvent) => {
    e.preventDefault();
    dropZone.classList.add(DRAG_ACTIVE_CLASS);
  });
  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove(DRAG_ACTIVE_CLASS);
  });
  dropZone.addEventListener("drop", (e: DragEvent) => {
    e.preventDefault();
    dropZone.classList.remove(DRAG_ACTIVE_CLASS);
    const files = e.dataTransfer?.files;
    if (files) processFiles(files, mapHandle);
  });

  // Standard file input change.
  fileInput.addEventListener("change", () => {
    if (fileInput.files) processFiles(fileInput.files, mapHandle);
    // Reset so the same file can be re-uploaded if removed and re-added.
    fileInput.value = "";
  });
}

/**
 * Set up the tile style `<select>` element to switch map tile layers.
 *
 * @param mapHandle - Used to call `setTileStyle` on selection change.
 */
function setupTileSelector(mapHandle: MapHandle): void {
  const selector = document.getElementById("tile-selector") as HTMLSelectElement | null;
  if (!selector) return;

  selector.addEventListener("change", () => {
    mapHandle.setTileStyle(selector.value);
  });
}

/**
 * Process a `FileList` from a drop or input event.
 *
 * Each file is read asynchronously. Supported files are parsed via Wasm;
 * unsupported or corrupt files produce a per-file error message without
 * aborting processing of the remaining files.
 *
 * @param files - The list of files to process.
 * @param mapHandle - Used to add successfully parsed tracks to the map.
 */
function processFiles(files: FileList, mapHandle: MapHandle): void {
  clearErrors();
  Array.from(files).forEach((file) => {
    if (!isSupportedFile(file.name)) {
      showError(`"${file.name}" is not a supported file type (GPX, FIT, TCX, KML).`);
      return;
    }
    readFile(file)
      .then((bytes) => {
        const track = parseFile(bytes, file.name);
        const colour = assignTrackColour(tracks.length);
        const trackWithColour: ParsedTrack = { ...track, colour };
        tracks.push(trackWithColour);
        mapHandle.addTrack(trackWithColour);
        mapHandle.fitTracks();
        addTrackToList(trackWithColour, mapHandle);
        updateDownloads(mapHandle);
        updateElevationView(mapHandle);
      })
      .catch((err: unknown) => {
        showError(`Failed to parse "${file.name}": ${String(err)}`);
      });
  });
}

/**
 * Read a `File` object into a `Uint8Array`.
 *
 * @param file - The file to read.
 * @returns A promise resolving to the raw file bytes.
 */
function readFile(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
      } else {
        reject(new Error("Unexpected FileReader result type"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Dispatch raw bytes to the correct Wasm parser based on file extension.
 *
 * @param bytes - Raw file bytes.
 * @param filename - Used to determine the parser and derive the track name.
 * @returns The parsed track.
 * @throws If no parser matches the extension or parsing fails.
 */
function parseFile(bytes: Uint8Array, filename: string): ParsedTrack {
  const ext = getFileExtension(filename);
  switch (ext) {
    case ".gpx":
      return parseGpx(bytes, filename);
    case ".fit":
    case ".fit.gz":
      return parseFit(bytes, filename);
    case ".tcx":
    case ".tcx.gz":
      return parseTcx(bytes, filename);
    case ".kml":
    case ".kml.gz":
      return parseKml(bytes, filename);
    default:
      throw new Error(`Unsupported file extension: ${filename}`);
  }
}

/**
 * Add a track entry to the sidebar track list.
 *
 * Each entry shows a remove button, the track name, and a colour picker input.
 *
 * @param track - The track to display.
 * @param mapHandle - Used to update the polyline colour on picker change and
 *   to remove the polyline when the track is deleted.
 */
function addTrackToList(track: ParsedTrack, mapHandle: MapHandle): void {
  const list = document.getElementById("track-list");
  if (!list) return;

  const item = document.createElement("li");
  item.className = "track-list__item";
  item.dataset["trackName"] = track.name;

  const colourId = `colour-${CSS.escape(track.name)}`;

  item.innerHTML = `
    <button
      type="button"
      class="track-list__remove"
      aria-label="Remove track ${escapeHtml(track.name)}"
    >&#x2715;</button>
    <span class="track-list__name" title="${escapeHtml(track.name)}">${escapeHtml(track.name)}</span>
    <label for="${colourId}" class="visually-hidden">Track colour for ${escapeHtml(track.name)}</label>
    <input
      type="color"
      id="${colourId}"
      class="track-list__colour-picker"
      value="${track.colour ?? DEFAULT_COLOURS[0]}"
      aria-label="Track colour for ${escapeHtml(track.name)}"
    />
  `;

  const picker = item.querySelector("input[type=color]") as HTMLInputElement | null;
  picker?.addEventListener("change", () => {
    const idx = tracks.findIndex((t) => t.name === track.name);
    if (idx !== -1) {
      tracks[idx] = { ...tracks[idx], colour: picker.value } as ParsedTrack;
    }
    mapHandle.setTrackColour(track.name, picker.value);
    updateDownloads(mapHandle);
    if (tracks.length === 1) {
      updateElevationColour(picker.value);
    }
  });

  const removeBtn = item.querySelector(".track-list__remove") as HTMLButtonElement | null;
  removeBtn?.addEventListener("click", () => {
    const idx = tracks.findIndex((t) => t.name === track.name);
    if (idx !== -1) {
      tracks.splice(idx, 1);
    }
    mapHandle.removeTrack(track.name);
    item.remove();
    updateDownloads(mapHandle);
    updateElevationView(mapHandle);
  });

  list.appendChild(item);
}

/**
 * Rebuild the download links section based on the current track list.
 *
 * Revokes any previously created object URLs to avoid memory leaks, then
 * generates fresh Blob URLs for the combined GPX and HTML map downloads.
 * The active provider, CartoDB API key, and MapBox token are all embedded
 * in the HTML export so the downloaded map uses the same tile configuration.
 *
 * @param mapHandle - Used to read the current provider, API key, and MapBox token.
 */
function updateDownloads(mapHandle: MapHandle): void {
  const section = document.getElementById("download-section");
  if (!section) return;

  // Revoke old object URLs before replacing them.
  section.querySelectorAll<HTMLAnchorElement>("a[data-object-url]").forEach((a) => {
    URL.revokeObjectURL(a.href);
  });

  if (tracks.length === 0) {
    section.innerHTML = `<p class="downloads__empty">Upload tracks to enable downloads.</p>`;
    return;
  }

  try {
    const gpxContent = generateCombinedGpx(tracks);
    const htmlContent = generateMapHtml(
      tracks,
      mapHandle.getProvider(),
      mapHandle.getApiKey(),
      mapHandle.getMapboxToken(),
    );

    const gpxUrl = URL.createObjectURL(new Blob([gpxContent], { type: GPX_MIME_TYPE }));
    const htmlUrl = URL.createObjectURL(new Blob([htmlContent], { type: HTML_MIME_TYPE }));

    section.innerHTML = `
      <a
        href="${gpxUrl}"
        download="tracks.gpx"
        class="download-link"
        data-object-url="true"
        aria-label="Download combined GPX file"
      >Download GPX</a>
      <a
        href="${htmlUrl}"
        download="map.html"
        class="download-link"
        data-object-url="true"
        aria-label="Download shareable HTML map"
      >Download Map</a>
    `;
  } catch (err: unknown) {
    showError(`Failed to generate downloads: ${String(err)}`);
  }
}

/**
 * Display a per-file error message in the error list.
 *
 * Errors are appended so multiple failures from a batch upload are all visible.
 *
 * @param message - The human-readable error message to display.
 */
function showError(message: string): void {
  const list = document.getElementById("error-list");
  if (!list) return;
  const item = document.createElement("p");
  item.className = "error-message";
  item.textContent = message;
  list.appendChild(item);
}

/**
 * Clear all error messages from the error list.
 */
function clearErrors(): void {
  const list = document.getElementById("error-list");
  if (list) list.innerHTML = "";
}

/**
 * Escape a string for safe insertion into an HTML attribute or text node.
 *
 * @param str - The raw string to escape.
 * @returns The HTML-escaped string.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
