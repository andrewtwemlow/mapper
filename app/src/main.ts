/**
 * @file main.ts
 * Application entry point. Initialises the Wasm module, sets up the UI,
 * and wires together the map, file upload, and download subsystems.
 */

import { initWasm } from "./wasm.js";
import { initMap } from "./map.js";
import { renderAppShell, initUI } from "./ui.js";
import "./style.css";

/**
 * Bootstrap the application.
 *
 * Loads the WebAssembly module first, then initialises the map and UI.
 * Any failure during Wasm initialisation is surfaced to the user via the
 * error banner rendered by the UI module.
 */
async function main(): Promise<void> {
  try {
    await initWasm();
  } catch (err) {
    // Wasm failed to load — render a fatal error and stop.
    const app = document.getElementById("app");
    if (app) {
      app.innerHTML = `
        <div role="alert" class="error-fatal">
          <p>Failed to load the application. Please refresh the page.</p>
          <p class="error-detail">${String(err)}</p>
        </div>`;
    }
    return;
  }

  // Render the app shell first so the map container DOM element exists
  // before Leaflet attempts to mount into it.
  renderAppShell();
  const mapInstance = initMap("map-container");
  initUI(mapInstance);
}

main();
