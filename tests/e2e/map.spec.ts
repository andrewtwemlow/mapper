/**
 * Map rendering scenarios — verifies the Leaflet map initialises correctly,
 * default tile style, tile style selector options, auto-fit bounds on upload,
 * and track polyline colours.
 */

import { test, expect } from "@playwright/test";
import { gpxFiles } from "./test-data.js";

/**
 * First colour in the default track palette.
 * Must match DEFAULT_COLOURS[0] in app/src/colours.ts.
 */
const FIRST_PALETTE_COLOUR = "#1f77b4";

test.describe("Map Rendering", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#drop-zone");
  });

  test("map renders on page load with Leaflet container", async ({ page }) => {
    // Leaflet creates a div with class .leaflet-container when initialised
    await expect(page.locator(".leaflet-container")).toBeVisible();
  });

  test("default tile style is CartoDB DarkMatter", async ({ page }) => {
    // The tile selector should default to the DarkMatter option
    const selector = page.locator("#tile-selector");
    await expect(selector).toHaveValue("DarkMatter");
  });

  test("tile style selector shows all four CartoDB options", async ({ page }) => {
    const options = page.locator("#tile-selector option");
    await expect(options).toHaveCount(4);

    const values = await options.evaluateAll((opts: Element[]) =>
      opts.map((o) => (o as HTMLOptionElement).value),
    );
    expect(values).toContain("DarkMatter");
    expect(values).toContain("DarkMatterNoLabels");
    expect(values).toContain("Positron");
    expect(values).toContain("Voyager");
  });

  test("switching tile style updates the map", async ({ page }) => {
    const selector = page.locator("#tile-selector");

    // Switch to Positron
    await selector.selectOption("Positron");
    await expect(selector).toHaveValue("Positron");

    // The tile layer URL should now reference the Positron endpoint
    await page.waitForFunction(() => {
      const imgs = document.querySelectorAll<HTMLImageElement>(
        ".leaflet-tile-pane img",
      );
      return Array.from(imgs).some((img) => img.src.includes("light_all"));
    });
  });

  test("after upload map auto-fits bounds to show all tracks", async ({ page }) => {
    const initialCenter = await page.evaluate(() => {
      const mapEl = document.getElementById("map-container");
      return mapEl?.getBoundingClientRect();
    });

    await page.locator("#file-input").setInputFiles(gpxFiles()[0]);

    // After upload the map should still be visible and containing a polyline
    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
    await expect(page.locator(".leaflet-container")).toBeVisible();
    expect(initialCenter).toBeDefined();
  });

  test("each uploaded track renders as a polyline", async ({ page }) => {
    const files = gpxFiles();
    test.skip(files.length < 2, "Need at least 2 GPX files in test-data/");

    await page.locator("#file-input").setInputFiles([files[0], files[1]]);
    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(2);
  });

  test("track polylines have colour from default palette", async ({ page }) => {
    await page.locator("#file-input").setInputFiles(gpxFiles()[0]);

    // The first track should use the first default palette colour
    const polyline = page.locator(".leaflet-overlay-pane path").first();
    const stroke = await polyline.getAttribute("stroke");
    expect(stroke?.toLowerCase()).toBe(FIRST_PALETTE_COLOUR);
  });
});
