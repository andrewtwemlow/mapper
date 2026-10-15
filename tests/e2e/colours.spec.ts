/**
 * Track colour scenarios — verifies default palette assignment, per-track
 * colour picker presence, colour updates on the map, and colour persistence
 * when additional tracks are uploaded.
 */

import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

/** Absolute path to the shared test data directory. */
const TEST_DATA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test-data",
);

/**
 * Expected default colours for the first two tracks.
 * Must match DEFAULT_COLOURS in app/src/colours.ts.
 */
const PALETTE_COLOUR_0 = "#1f77b4";
const PALETTE_COLOUR_1 = "#ff7f0e";

/** Arbitrary test colour used to verify colour picker updates. */
const TEST_COLOUR_RED = "#ff0000";

/** Arbitrary test colour used to verify colour persistence across uploads. */
const TEST_COLOUR_GREEN = "#00ff00";

test.describe("Track Colours", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#drop-zone");
  });

  test("each uploaded track has a colour picker in the track list", async ({ page }) => {
    await page.locator("#file-input").setInputFiles(
      path.join(TEST_DATA_DIR, "A100.gpx"),
    );

    await expect(page.locator("#track-list li")).toHaveCount(1);
    await expect(
      page.locator("#track-list li input[type=color]"),
    ).toHaveCount(1);
  });

  test("first track colour picker defaults to first palette colour", async ({ page }) => {
    await page.locator("#file-input").setInputFiles(
      path.join(TEST_DATA_DIR, "A100.gpx"),
    );

    const picker = page.locator("#track-list li input[type=color]").first();
    await expect(picker).toHaveValue(PALETTE_COLOUR_0);
  });

  test("second track colour picker defaults to second palette colour", async ({ page }) => {
    await page.locator("#file-input").setInputFiles(
      path.join(TEST_DATA_DIR, "A100.gpx"),
    );
    await page.locator("#file-input").setInputFiles(
      path.join(TEST_DATA_DIR, "CW50.gpx"),
    );

    const pickers = page.locator("#track-list li input[type=color]");
    await expect(pickers.nth(0)).toHaveValue(PALETTE_COLOUR_0);
    await expect(pickers.nth(1)).toHaveValue(PALETTE_COLOUR_1);
  });

  test("changing colour picker updates polyline colour on map", async ({ page }) => {
    await page.locator("#file-input").setInputFiles(
      path.join(TEST_DATA_DIR, "A100.gpx"),
    );

    const picker = page.locator("#track-list li input[type=color]").first();

    // Change the colour to red
    await picker.evaluate(
      (el: HTMLInputElement, colour: string) => {
        el.value = colour;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      },
      TEST_COLOUR_RED,
    );

    // The polyline stroke should now be red
    const polyline = page.locator(".leaflet-overlay-pane path").first();
    const stroke = await polyline.getAttribute("stroke");
    expect(stroke?.toLowerCase()).toBe(TEST_COLOUR_RED);
  });

  test("colour change persists after uploading additional tracks", async ({ page }) => {
    // Upload first track and change its colour
    await page.locator("#file-input").setInputFiles(
      path.join(TEST_DATA_DIR, "A100.gpx"),
    );

    const firstPicker = page.locator("#track-list li input[type=color]").first();
    await firstPicker.evaluate(
      (el: HTMLInputElement, colour: string) => {
        el.value = colour;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      },
      TEST_COLOUR_GREEN,
    );

    // Upload a second track
    await page.locator("#file-input").setInputFiles(
      path.join(TEST_DATA_DIR, "CW50.gpx"),
    );

    // First track's colour should still be the custom colour
    const updatedFirstPicker = page
      .locator("#track-list li input[type=color]")
      .first();
    await expect(updatedFirstPicker).toHaveValue(TEST_COLOUR_GREEN);
  });
});
