import { defineConfig } from "vite";

/**
 * Vite configuration for the GPX Mapper frontend.
 *
 * Key concerns:
 * - The generated wasm-pack output lands in `src/wasm-pkg/` and is excluded
 *   from TypeScript compilation via the import path alias.
 * - WebAssembly files must be served with `application/wasm` MIME type in dev;
 *   Vite handles this automatically for `?url` and `?init` imports.
 * - The build targets latest Chrome and Firefox only (matching project requirements).
 */
export default defineConfig({
  build: {
    // Target latest stable Chrome and Firefox as per project requirements
    // (see .kiro/steering/project.md). Update these when major versions ship.
    target: ["chrome120", "firefox120"],
    // Emit source maps for easier debugging of the Wasm integration.
    sourcemap: true,
  },
  server: {
    // Allow the Vite dev server to serve .wasm files with the correct MIME type.
    // Note: COEP is intentionally omitted — it would block CDN resources (Leaflet,
    // CartoDB tiles) that don't set Cross-Origin-Resource-Policy headers.
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  // Prevent Vite from pre-bundling the wasm-pack output — it must be loaded
  // as a native ES module so the Wasm binary is fetched correctly.
  optimizeDeps: {
    exclude: ["gpx-mapper"],
  },
});
