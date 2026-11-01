/**
 * Elevation profile scenarios — verifies the elevation panel appears when
 * exactly one track with elevation data is loaded, and is hidden in all other
 * cases (zero tracks, two or more tracks, or a single track with no elevation).
 *
 * Format-specific tests use `gpxFiles()` from the test-data helper and guard
 * with `test.skip` when there are fewer files than needed.
 */

import { test, expect } from "@playwright/test";
import { gpxFiles } from "./test-data.js";

test.describe("Elevation Profile", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the Wasm module to initialise and the app shell to render.
    await page.waitForSelector("#drop-zone");
  });

  test("upload a single GPX file with elevation shows the elevation panel", async ({ page }) => {
    const fileInput = page.locator("#file-input");
    await fileInput.setInputFiles(gpxFiles()[0]);

    // Track entry should appear in the sidebar.
    await expect(page.locator("#track-list li")).toHaveCount(1);

    // Elevation panel should be visible.
    await expect(page.locator("#elevation-panel")).toBeVisible();
  });

  test("upload a second file hides the elevation panel", async ({ page }) => {
    const files = gpxFiles();
    test.skip(files.length < 2, "Need at least 2 GPX files in test-data/");

    const fileInput = page.locator("#file-input");
    await fileInput.setInputFiles(files[0]);
    await expect(page.locator("#track-list li")).toHaveCount(1);
    await expect(page.locator("#elevation-panel")).toBeVisible();

    // Upload a second file — panel should disappear.
    await fileInput.setInputFiles(files[1]);
    await expect(page.locator("#track-list li")).toHaveCount(2);
    await expect(page.locator("#elevation-panel")).toBeHidden();
  });

  test("upload a file with no elevation data does not show the elevation panel", async ({ page }) => {
    // Inject a minimal GPX file whose <trkpt> elements have no <ele> children.
    await page.evaluate(() => {
      const input = document.getElementById("file-input") as HTMLInputElement;
      const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>no-elevation</name>
    <trkseg>
      <trkpt lat="51.5" lon="-0.1"/>
      <trkpt lat="51.51" lon="-0.11"/>
    </trkseg>
  </trk>
</gpx>`;
      const file = new File([gpxContent], "no-elevation.gpx", {
        type: "application/gpx+xml",
      });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Track should appear.
    await expect(page.locator("#track-list li")).toHaveCount(1);

    // Elevation panel should NOT be visible (no elevation data in the track).
    await expect(page.locator("#elevation-panel")).toBeHidden();
  });
});
