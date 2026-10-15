/**
 * File upload UI, track list, colour picker, tile selector, and download links.
 *
 * Owns all DOM interaction outside the Leaflet map container. Communicates
 * with the map via the {@link MapHandle} interface and with the Wasm layer
 * exclusively through `./wasm.ts`.
 */

import type { MapHandle } from "./map.js";
import { TILE_LAYERS, DEFAULT_TILE_STYLE } from "./map.js";
import {
  parseGpx,
  parseFit,
  parseTcx,
  generateCombinedGpx,
  generateMapHtml,
  isSupportedFile,
  getFileExtension,
  type ParsedTrack,
} from "./wasm.js";
import { assignTrackColour, DEFAULT_COLOURS } from "./colours.js";

/** MIME type for GPX download links. */
const GPX_MIME_TYPE = "application/gpx+xml";

/** MIME type for HTML download links. */
const HTML_MIME_TYPE = "text/html";

/** CSS class applied to the upload drop zone when a drag is active. */
const DRAG_ACTIVE_CLASS = "drop-zone--active";

/** All tracks parsed so far in the current session, in upload order. */
let tracks: ParsedTrack[] = [];

/**
 * Initialise all UI components and wire them to the map.
 *
 * Must be called after the Wasm module is initialised and the map is ready.
 *
 * @param mapHandle - The map handle returned by `initMap`.
 */
export function initUI(mapHandle: MapHandle): void {
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
 * Builds the static HTML structure: upload area, track list, tile selector,
 * and download section. All dynamic content is injected into named slots
 * within this structure.
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

        <section class="sidebar__section" aria-labelledby="upload-heading">
          <h2 id="upload-heading" class="sidebar__section-title">Upload Files</h2>
          <div
            id="drop-zone"
            class="drop-zone"
            role="button"
            tabindex="0"
            aria-label="Upload GPX, FIT, or TCX files. Click or drag and drop."
          >
            <p class="drop-zone__hint">
              Drop files here or <span class="drop-zone__link">click to browse</span>
            </p>
            <p class="drop-zone__formats">GPX · FIT · FIT.GZ · TCX · TCX.GZ</p>
          </div>
          <input
            id="file-input"
            type="file"
            accept=".gpx,.fit,.tcx,.gz"
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

        <section class="sidebar__section" aria-labelledby="style-heading">
          <h2 id="style-heading" class="sidebar__section-title">Map Style</h2>
          <label for="tile-selector" class="visually-hidden">Map tile style</label>
          <select id="tile-selector" class="tile-selector" aria-label="Map tile style">
            ${Object.entries(TILE_LAYERS)
      .map(
        ([key, cfg]) =>
          `<option value="${key}"${key === DEFAULT_TILE_STYLE ? " selected" : ""}>${cfg.label}</option>`,
      )
      .join("\n            ")}
          </select>
        </section>

        <section class="sidebar__section" aria-labelledby="downloads-heading">
          <h2 id="downloads-heading" class="sidebar__section-title">Downloads</h2>
          <div id="download-section" class="downloads">
            <p class="downloads__empty">Upload tracks to enable downloads.</p>
          </div>
        </section>
      </aside>

      <main class="map-area" aria-label="Map">
        <div id="map-container" class="map-container"></div>
      </main>
    </div>
  `;
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
      showError(`"${file.name}" is not a supported file type (GPX, FIT, TCX).`);
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
        updateDownloads();
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
    default:
      throw new Error(`Unsupported file extension: ${filename}`);
  }
}

/**
 * Add a track entry to the sidebar track list.
 *
 * Each entry shows the track name and a colour picker input.
 *
 * @param track - The track to display.
 * @param mapHandle - Used to update the polyline colour on picker change.
 */
function addTrackToList(track: ParsedTrack, mapHandle: MapHandle): void {
  const list = document.getElementById("track-list");
  if (!list) return;

  const item = document.createElement("li");
  item.className = "track-list__item";
  item.dataset["trackName"] = track.name;

  const colourId = `colour-${CSS.escape(track.name)}`;

  item.innerHTML = `
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
    updateDownloads();
  });

  list.appendChild(item);
}

/**
 * Rebuild the download links section based on the current track list.
 *
 * Revokes any previously created object URLs to avoid memory leaks, then
 * generates fresh Blob URLs for the combined GPX and HTML map downloads.
 */
function updateDownloads(): void {
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
    const htmlContent = generateMapHtml(tracks);

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
