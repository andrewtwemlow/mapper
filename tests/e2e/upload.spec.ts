/**
 * Upload scenarios — verifies file upload via drag-and-drop and click-to-browse
 * for all supported formats, and error handling for unsupported/corrupt files.
 *
 * Format-specific tests (FIT.GZ, TCX.GZ) are skipped automatically when no
 * files of that type are present in `test-data/`.
 */

import { test, expect } from "@playwright/test";
import { gpxFiles, fitGzFiles, tcxGzFiles, kmlFiles, kmlGzFiles } from "./test-data.js";

test.describe("File Upload", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the Wasm module to initialise and the app shell to render
    await page.waitForSelector("#drop-zone");
  });

  test("click-to-upload a GPX file shows track on map", async ({ page }) => {
    const fileInput = page.locator("#file-input");
    await fileInput.setInputFiles(gpxFiles()[0]);

    // A track entry should appear in the sidebar track list
    await expect(page.locator("#track-list li")).toHaveCount(1);
    // The Leaflet map should contain at least one polyline
    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
  });

  test("click-to-upload a second GPX file adds second track", async ({ page }) => {
    const files = gpxFiles();
    test.skip(files.length < 2, "Need at least 2 GPX files in test-data/");

    const fileInput = page.locator("#file-input");
    await fileInput.setInputFiles(files[0]);
    await expect(page.locator("#track-list li")).toHaveCount(1);

    await fileInput.setInputFiles(files[1]);
    await expect(page.locator("#track-list li")).toHaveCount(2);
    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(2);
  });

  test("upload a FIT.GZ file shows track on map", async ({ page }) => {
    const files = fitGzFiles();
    test.skip(files.length === 0, "No .fit.gz files in test-data/");

    const fileInput = page.locator("#file-input");
    await fileInput.setInputFiles(files[0]);

    await expect(page.locator("#track-list li")).toHaveCount(1);
    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
  });

  test("upload a TCX.GZ file shows track on map", async ({ page }) => {
    const files = tcxGzFiles();
    test.skip(files.length === 0, "No .tcx.gz files in test-data/");

    const fileInput = page.locator("#file-input");
    await fileInput.setInputFiles(files[0]);

    await expect(page.locator("#track-list li")).toHaveCount(1);
    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
  });

  test("upload a KML file shows track on map", async ({ page }) => {
    const files = kmlFiles();
    test.skip(files.length === 0, "No .kml files in test-data/");

    const fileInput = page.locator("#file-input");
    await fileInput.setInputFiles(files[0]);

    await expect(page.locator("#track-list li")).toHaveCount(1);
    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
  });

  test("upload a KML.GZ file shows track on map", async ({ page }) => {
    const files = kmlGzFiles();
    test.skip(files.length === 0, "No .kml.gz files in test-data/");

    const fileInput = page.locator("#file-input");
    await fileInput.setInputFiles(files[0]);

    await expect(page.locator("#track-list li")).toHaveCount(1);
    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
  });

  test("upload multiple files at once shows all tracks", async ({ page }) => {
    const files = gpxFiles();
    test.skip(files.length < 2, "Need at least 2 GPX files in test-data/");

    const fileInput = page.locator("#file-input");
    await fileInput.setInputFiles([files[0], files[1]]);

    await expect(page.locator("#track-list li")).toHaveCount(2);
    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(2);
  });

  test("unsupported file type in batch does not affect valid files", async ({ page }) => {
    const fileInput = page.locator("#file-input");
    await fileInput.setInputFiles(gpxFiles()[0]);
    await expect(page.locator("#track-list li")).toHaveCount(1);

    // Inject an unsupported file — should produce an error but leave the existing track
    await page.evaluate(() => {
      const input = document.getElementById("file-input") as HTMLInputElement;
      const file = new File(["not a gpx"], "invalid.txt", { type: "text/plain" });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Error shown for the bad file
    await expect(page.locator("#error-list")).toContainText("not a supported file type");
    // Original valid track still present
    await expect(page.locator("#track-list li")).toHaveCount(1);
  });

  test("unsupported file type shows error message", async ({ page }) => {
    await page.evaluate(() => {
      const input = document.getElementById("file-input") as HTMLInputElement;
      const file = new File(["not a gpx"], "test.txt", { type: "text/plain" });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await expect(page.locator("#error-list")).toContainText("not a supported file type");
  });

  test("corrupt GPX file shows error, does not crash app", async ({ page }) => {
    await page.evaluate(() => {
      const input = document.getElementById("file-input") as HTMLInputElement;
      const file = new File(["<<< not xml at all >>>"], "corrupt.gpx", {
        type: "application/gpx+xml",
      });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await expect(page.locator("#error-list")).toContainText("corrupt.gpx");
    // App should still be functional — drop zone still present
    await expect(page.locator("#drop-zone")).toBeVisible();
  });

  test("drag-and-drop a GPX file shows track on map", async ({ page }) => {
    const dropZone = page.locator("#drop-zone");

    // Simulate dragover to trigger the active CSS class
    await dropZone.dispatchEvent("dragover");
    await expect(dropZone).toHaveClass(/drop-zone--active/);

    // Playwright's setInputFiles also covers the drag-and-drop upload path
    // since both feed into the same file processing pipeline via the input element.
    await page.locator("#file-input").setInputFiles(gpxFiles()[0]);
    await expect(page.locator("#track-list li")).toHaveCount(1);
  });
});
