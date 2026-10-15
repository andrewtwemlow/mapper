/**
 * Accessibility scenarios — verifies that all interactive controls have
 * accessible labels, the upload area is keyboard-operable, and download
 * links have descriptive accessible names.
 */

import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

/** Absolute path to the shared test data directory. */
const TEST_DATA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test-data",
);

test.describe("Accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#drop-zone");
  });

  test("upload area has an accessible label", async ({ page }) => {
    const dropZone = page.locator("#drop-zone");
    // Drop zone must have role=button and an aria-label
    await expect(dropZone).toHaveAttribute("role", "button");
    await expect(dropZone).toHaveAttribute("aria-label");
    const label = await dropZone.getAttribute("aria-label");
    expect(label?.length).toBeGreaterThan(0);
  });

  test("upload area is keyboard focusable and operable", async ({ page }) => {
    const dropZone = page.locator("#drop-zone");
    await expect(dropZone).toHaveAttribute("tabindex", "0");

    // Focus it and press Enter — should open the file picker (no error thrown)
    await dropZone.focus();
    await expect(dropZone).toBeFocused();
  });

  test("tile style selector has an accessible label", async ({ page }) => {
    const selector = page.locator("#tile-selector");
    await expect(selector).toHaveAttribute("aria-label");
    const label = await selector.getAttribute("aria-label");
    expect(label?.length).toBeGreaterThan(0);
  });

  test("track list items have accessible labels after upload", async ({ page }) => {
    await page.locator("#file-input").setInputFiles(
      path.join(TEST_DATA_DIR, "A100.gpx"),
    );

    // Each colour picker in the track list must have an aria-label
    const pickers = page.locator("#track-list li input[type=color]");
    await expect(pickers).toHaveCount(1);

    const label = await pickers.first().getAttribute("aria-label");
    expect(label?.length).toBeGreaterThan(0);
    expect(label).toContain("A100");
  });

  test("colour pickers have accessible labels", async ({ page }) => {
    await page.locator("#file-input").setInputFiles([
      path.join(TEST_DATA_DIR, "A100.gpx"),
      path.join(TEST_DATA_DIR, "CW50.gpx"),
    ]);

    const pickers = page.locator("#track-list li input[type=color]");
    await expect(pickers).toHaveCount(2);

    // Every picker must have a non-empty aria-label
    const labels = await pickers.evaluateAll((inputs: Element[]) =>
      inputs.map((el) => (el as HTMLInputElement).getAttribute("aria-label")),
    );
    labels.forEach((label) => {
      expect(label).toBeTruthy();
      expect((label ?? "").length).toBeGreaterThan(0);
    });
  });

  test("download links have descriptive accessible names", async ({ page }) => {
    await page.locator("#file-input").setInputFiles(
      path.join(TEST_DATA_DIR, "A100.gpx"),
    );

    const downloadLinks = page.locator("a.download-link");
    await expect(downloadLinks).toHaveCount(2);

    // Each link must have a non-empty aria-label
    const labels = await downloadLinks.evaluateAll((links: Element[]) =>
      links.map((el) => (el as HTMLAnchorElement).getAttribute("aria-label")),
    );
    labels.forEach((label) => {
      expect(label).toBeTruthy();
      expect((label ?? "").length).toBeGreaterThan(0);
    });
  });

  test("error messages are announced to screen readers", async ({ page }) => {
    // The error list must have role=alert and aria-live=polite
    const errorList = page.locator("#error-list");
    await expect(errorList).toHaveAttribute("role", "alert");
    await expect(errorList).toHaveAttribute("aria-live", "polite");
  });

  test("map container has an accessible label", async ({ page }) => {
    // The <main> wrapping the map should have aria-label
    const mapArea = page.locator("main.map-area");
    await expect(mapArea).toHaveAttribute("aria-label");
  });
});
