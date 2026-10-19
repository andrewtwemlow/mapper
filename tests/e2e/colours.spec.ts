/**
 * Track colour scenarios — verifies default palette assignment, per-track
 * colour picker presence, colour updates on the map, and colour persistence
 * when additional tracks are uploaded.
 */

import { test, expect } from "@playwright/test";
import { gpxFiles } from "./test-data.js";

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
    await page.locator("#file-input").setInputFiles(gpxFiles()[0]);

    await expect(page.locator("#track-list li")).toHaveCount(1);
    await expect(page.locator("#track-list li input[type=color]")).toHaveCount(1);
  });

  test("first track colour picker defaults to first palette colour", async ({ page }) => {
    await page.locator("#file-input").setInputFiles(gpxFiles()[0]);

    const picker = page.locator("#track-list li input[type=color]").first();
    await expect(picker).toHaveValue(PALETTE_COLOUR_0);
  });

  test("second track colour picker defaults to second palette colour", async ({ page }) => {
    const files = gpxFiles();
    test.skip(files.length < 2, "Need at least 2 GPX files in test-data/");

    await page.locator("#file-input").setInputFiles(files[0]);
    await page.locator("#file-input").setInputFiles(files[1]);

    const pickers = page.locator("#track-list li input[type=color]");
    await expect(pickers.nth(0)).toHaveValue(PALETTE_COLOUR_0);
    await expect(pickers.nth(1)).toHaveValue(PALETTE_COLOUR_1);
  });

  test("changing colour picker updates polyline colour on map", async ({ page }) => {
    await page.locator("#file-input").setInputFiles(gpxFiles()[0]);

    const picker = page.locator("#track-list li input[type=color]").first();

    await picker.evaluate(
      (el: HTMLInputElement, colour: string) => {
        el.value = colour;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      },
      TEST_COLOUR_RED,
    );

    const polyline = page.locator(".leaflet-overlay-pane path").first();
    const stroke = await polyline.getAttribute("stroke");
    expect(stroke?.toLowerCase()).toBe(TEST_COLOUR_RED);
  });

  test("colour change persists after uploading additional tracks", async ({ page }) => {
    const files = gpxFiles();
    test.skip(files.length < 2, "Need at least 2 GPX files in test-data/");

    await page.locator("#file-input").setInputFiles(files[0]);

    const firstPicker = page.locator("#track-list li input[type=color]").first();
    await firstPicker.evaluate(
      (el: HTMLInputElement, colour: string) => {
        el.value = colour;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      },
      TEST_COLOUR_GREEN,
    );

    await page.locator("#file-input").setInputFiles(files[1]);

    // First track's colour should still be the custom colour
    const updatedFirstPicker = page
      .locator("#track-list li input[type=color]")
      .first();
    await expect(updatedFirstPicker).toHaveValue(TEST_COLOUR_GREEN);
  });
});
