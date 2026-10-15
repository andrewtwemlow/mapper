import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for GPX Mapper JS/TS unit tests.
 *
 * Tests the pure TypeScript logic (colour assignment, file extension
 * detection, etc.) that does not require a real browser or Wasm runtime.
 * Uses the jsdom environment for DOM API availability.
 */
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
