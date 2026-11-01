/**
 * Multi-provider map tile scenarios — verifies the provider selector UI,
 * conditional section visibility, tile URL correctness for each provider,
 * and session persistence when switching providers.
 */

import { test, expect } from "@playwright/test";
import { gpxFiles } from "./test-data.js";

/** Synthetic MapBox token for structural URL assertions (no network round-trip). */
const SYNTHETIC_MAPBOX_TOKEN = "pk.test_mapbox_token_abc123";

/**
 * Time in ms to wait after filling a token/key input for the 600ms debounce
 * in ui.ts to settle before asserting tile URLs or download content.
 */
const DEBOUNCE_SETTLE_MS = 800;

/**
 * Timeout in ms for waitForFunction calls that poll Leaflet tile images.
 */
const TILE_WAIT_TIMEOUT_MS = 5_000;

test.describe("Map Providers", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#drop-zone");
  });

  // ── Selector presence ─────────────────────────────────────────────────────

  test("provider selector is present and visible on page load", async ({ page }) => {
    await expect(page.locator("#provider-selector")).toBeVisible();
  });

  test("default selected provider is none", async ({ page }) => {
    await expect(page.locator("#provider-selector")).toHaveValue("none");
  });

  // ── none provider ─────────────────────────────────────────────────────────

  test("with none provider no tile images are present", async ({ page }) => {
    // "none" is the default — no provider switch needed
    await expect(page.locator("#provider-selector")).toHaveValue("none");
    await expect(page.locator(".leaflet-tile-pane img")).toHaveCount(0);
  });

  test("with none provider all conditional sections are hidden", async ({ page }) => {
    await expect(page.locator("#carto-api-key-section")).toBeHidden();
    await expect(page.locator("#mapbox-token-section")).toBeHidden();
    await expect(page.locator("#style-section")).toBeHidden();
  });

  // ── osm provider ──────────────────────────────────────────────────────────

  test("switching to osm shows tile images from openstreetmap.org", async ({ page }) => {
    await page.locator("#provider-selector").selectOption("osm");

    await page.waitForFunction(
      () => {
        const imgs = document.querySelectorAll<HTMLImageElement>(
          ".leaflet-tile-pane img",
        );
        return Array.from(imgs).some((img) =>
          img.src.includes("tile.openstreetmap.org"),
        );
      },
      undefined,
      { timeout: TILE_WAIT_TIMEOUT_MS },
    );

    const hasOsmTile = await page.evaluate(() => {
      const imgs = document.querySelectorAll<HTMLImageElement>(
        ".leaflet-tile-pane img",
      );
      return Array.from(imgs).some((img) =>
        img.src.includes("tile.openstreetmap.org"),
      );
    });
    expect(hasOsmTile).toBe(true);
  });

  test("with osm provider api key and token sections remain hidden", async ({ page }) => {
    await page.locator("#provider-selector").selectOption("osm");

    await expect(page.locator("#carto-api-key-section")).toBeHidden();
    await expect(page.locator("#mapbox-token-section")).toBeHidden();
  });

  test("with osm provider style selector is hidden", async ({ page }) => {
    await page.locator("#provider-selector").selectOption("osm");

    await expect(page.locator("#style-section")).toBeHidden();
  });

  // ── carto provider ────────────────────────────────────────────────────────

  test("switching to carto shows CartoDB API key section and style selector", async ({
    page,
  }) => {
    await page.locator("#provider-selector").selectOption("carto");

    await expect(page.locator("#carto-api-key-section")).toBeVisible();
    await expect(page.locator("#style-section")).toBeVisible();
  });

  test("with carto provider mapbox token section is hidden", async ({ page }) => {
    await page.locator("#provider-selector").selectOption("carto");

    await expect(page.locator("#mapbox-token-section")).toBeHidden();
  });

  test("with carto provider tile images contain cartocdn.com", async ({ page }) => {
    await page.locator("#provider-selector").selectOption("carto");

    await page.waitForFunction(
      () => {
        const imgs = document.querySelectorAll<HTMLImageElement>(
          ".leaflet-tile-pane img",
        );
        return Array.from(imgs).some((img) => img.src.includes("cartocdn.com"));
      },
      undefined,
      { timeout: TILE_WAIT_TIMEOUT_MS },
    );

    const hasCartoTile = await page.evaluate(() => {
      const imgs = document.querySelectorAll<HTMLImageElement>(
        ".leaflet-tile-pane img",
      );
      return Array.from(imgs).some((img) => img.src.includes("cartocdn.com"));
    });
    expect(hasCartoTile).toBe(true);
  });

  // ── mapbox provider ───────────────────────────────────────────────────────

  test("switching to mapbox shows MapBox token section and style selector", async ({
    page,
  }) => {
    await page.locator("#provider-selector").selectOption("mapbox");

    await expect(page.locator("#mapbox-token-section")).toBeVisible();
    await expect(page.locator("#style-section")).toBeVisible();
  });

  test("with mapbox provider carto api key section is hidden", async ({ page }) => {
    await page.locator("#provider-selector").selectOption("mapbox");

    await expect(page.locator("#carto-api-key-section")).toBeHidden();
  });

  test("with mapbox provider and token tile images contain api.mapbox.com and access_token", async ({
    page,
  }) => {
    await page.locator("#provider-selector").selectOption("mapbox");
    await page.locator("#mapbox-api-key").fill(SYNTHETIC_MAPBOX_TOKEN);
    await page.waitForTimeout(DEBOUNCE_SETTLE_MS);

    await page.waitForFunction(
      (token: string) => {
        const imgs = document.querySelectorAll<HTMLImageElement>(
          ".leaflet-tile-pane img",
        );
        return Array.from(imgs).some(
          (img) =>
            img.src.includes("api.mapbox.com") &&
            img.src.includes(`access_token=${token}`),
        );
      },
      SYNTHETIC_MAPBOX_TOKEN,
      { timeout: TILE_WAIT_TIMEOUT_MS },
    );

    const hasMapboxTile = await page.evaluate((token: string) => {
      const imgs = document.querySelectorAll<HTMLImageElement>(
        ".leaflet-tile-pane img",
      );
      return Array.from(imgs).some(
        (img) =>
          img.src.includes("api.mapbox.com") &&
          img.src.includes(`access_token=${token}`),
      );
    }, SYNTHETIC_MAPBOX_TOKEN);
    expect(hasMapboxTile).toBe(true);
  });

  // ── switching back to none ────────────────────────────────────────────────

  test("switching from mapbox back to none removes tile images", async ({ page }) => {
    await page.locator("#provider-selector").selectOption("mapbox");

    // Wait for tile layer to be added
    await page.waitForFunction(
      () => document.querySelectorAll(".leaflet-tile-pane img").length > 0,
      undefined,
      { timeout: TILE_WAIT_TIMEOUT_MS },
    );

    await page.locator("#provider-selector").selectOption("none");

    // Tile images should be removed
    await expect(page.locator(".leaflet-tile-pane img")).toHaveCount(0);
  });

  // ── session persistence ───────────────────────────────────────────────────

  test("mapbox token is retained when switching away and back", async ({ page }) => {
    await page.locator("#provider-selector").selectOption("mapbox");
    await page.locator("#mapbox-api-key").fill(SYNTHETIC_MAPBOX_TOKEN);
    await page.waitForTimeout(DEBOUNCE_SETTLE_MS);

    // Switch away then back
    await page.locator("#provider-selector").selectOption("none");
    await page.locator("#provider-selector").selectOption("mapbox");
    await page.locator("#mapbox-token-section").waitFor({ state: "visible" });

    // Token input should still hold the entered value
    await expect(page.locator("#mapbox-api-key")).toHaveValue(SYNTHETIC_MAPBOX_TOKEN);

    // Tile URLs should still contain the token
    await page.waitForFunction(
      (token: string) => {
        const imgs = document.querySelectorAll<HTMLImageElement>(
          ".leaflet-tile-pane img",
        );
        return Array.from(imgs).some((img) =>
          img.src.includes(`access_token=${token}`),
        );
      },
      SYNTHETIC_MAPBOX_TOKEN,
      { timeout: TILE_WAIT_TIMEOUT_MS },
    );
  });

  test("carto style selection is retained when switching away and back", async ({
    page,
  }) => {
    await page.locator("#provider-selector").selectOption("carto");
    await page.locator("#style-section").waitFor({ state: "visible" });

    // Change style to Positron
    await page.locator("#tile-selector").selectOption("Positron");
    await expect(page.locator("#tile-selector")).toHaveValue("Positron");

    // Switch away then back
    await page.locator("#provider-selector").selectOption("osm");
    await page.locator("#provider-selector").selectOption("carto");
    await page.locator("#style-section").waitFor({ state: "visible" });

    // Previously selected style should still be active
    await expect(page.locator("#tile-selector")).toHaveValue("Positron");
  });

  // ── upload works with all providers ──────────────────────────────────────

  test("tracks can be uploaded and displayed with osm provider", async ({ page }) => {
    await page.locator("#provider-selector").selectOption("osm");
    await page.locator("#file-input").setInputFiles(gpxFiles()[0]);

    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
    await expect(page.locator("#track-list li")).toHaveCount(1);
  });
});
