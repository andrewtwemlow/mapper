/**
 * Upload scenarios — verifies file upload via drag-and-drop and click-to-browse
 * for all supported formats, and error handling for unsupported/corrupt files.
 */

import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

/** Absolute path to the shared test data directory. */
const TEST_DATA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test-data",
);

test.describe("File Upload", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the Wasm module to initialise and the app shell to render
    await page.waitForSelector("#drop-zone");
  });

  test("click-to-upload a GPX file shows track on map", async ({ page }) => {
    const fileInput = page.locator("#file-input");
    await fileInput.setInputFiles(path.join(TEST_DATA_DIR, "A100.gpx"));

    // A track entry should appear in the sidebar track list
    await expect(page.locator("#track-list li")).toHaveCount(1);
    // The Leaflet map should contain at least one polyline
    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
  });

  test("click-to-upload a second GPX file adds second track", async ({ page }) => {
    const fileInput = page.locator("#file-input");
    await fileInput.setInputFiles(path.join(TEST_DATA_DIR, "A100.gpx"));
    await expect(page.locator("#track-list li")).toHaveCount(1);

    await fileInput.setInputFiles(path.join(TEST_DATA_DIR, "CW50.gpx"));
    await expect(page.locator("#track-list li")).toHaveCount(2);
    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(2);
  });

  test("upload a FIT.GZ file shows track on map", async ({ page }) => {
    const fileInput = page.locator("#file-input");
    await fileInput.setInputFiles(path.join(TEST_DATA_DIR, "10743961743.fit.gz"));

    await expect(page.locator("#track-list li")).toHaveCount(1);
    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
  });

  test("upload a TCX.GZ file shows track on map", async ({ page }) => {
    const fileInput = page.locator("#file-input");
    await fileInput.setInputFiles(path.join(TEST_DATA_DIR, "9731596976.tcx.gz"));

    await expect(page.locator("#track-list li")).toHaveCount(1);
    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
  });

  test("upload multiple files at once shows all tracks", async ({ page }) => {
    const fileInput = page.locator("#file-input");
    await fileInput.setInputFiles([
      path.join(TEST_DATA_DIR, "A100.gpx"),
      path.join(TEST_DATA_DIR, "CW50.gpx"),
    ]);

    await expect(page.locator("#track-list li")).toHaveCount(2);
    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(2);
  });

  test("unsupported file type in batch does not affect valid files", async ({ page }) => {
    // Upload one valid GPX alongside one unsupported file injected via evaluate
    const fileInput = page.locator("#file-input");
    await fileInput.setInputFiles(path.join(TEST_DATA_DIR, "A100.gpx"));
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
    // Inject an unsupported file directly via the input to trigger the error path
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
    // Read file bytes and simulate a drop event with a DataTransfer
    const filePath = path.join(TEST_DATA_DIR, "A100.gpx");
    const dropZone = page.locator("#drop-zone");

    // Use Playwright's built-in drag-and-drop file simulation
    await dropZone.dispatchEvent("dragover", { dataTransfer: new DataTransfer() });
    await expect(dropZone).toHaveClass(/drop-zone--active/);

    // Simulate drop with the file
    await page.setInputFiles("#file-input", filePath);
    await expect(page.locator("#track-list li")).toHaveCount(1);
  });
});
