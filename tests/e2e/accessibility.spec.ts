/**
 * Accessibility scenarios — verifies that all interactive controls have
 * accessible labels, the upload area is keyboard-operable, and download
 * links have descriptive accessible names.
 */

import { test, expect } from "@playwright/test";
import { gpxFiles } from "./test-data.js";

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

    await dropZone.focus();
    await expect(dropZone).toBeFocused();
  });

  test("tile style selector has an accessible label", async ({ page }) => {
    // Switch to CartoDB to make the style section visible
    await page.locator("#provider-selector").selectOption("carto");
    await page.locator("#style-section").waitFor({ state: "visible" });

    const selector = page.locator("#tile-selector");
    await expect(selector).toHaveAttribute("aria-label");
    const label = await selector.getAttribute("aria-label");
    expect(label?.length).toBeGreaterThan(0);
  });

  test("track list items have accessible labels after upload", async ({ page }) => {
    const file = gpxFiles()[0];
    await page.locator("#file-input").setInputFiles(file);

    // Each colour picker in the track list must have an aria-label
    const pickers = page.locator("#track-list li input[type=color]");
    await expect(pickers).toHaveCount(1);

    const label = await pickers.first().getAttribute("aria-label");
    expect(label?.length).toBeGreaterThan(0);
  });

  test("colour pickers have accessible labels", async ({ page }) => {
    const files = gpxFiles();
    test.skip(files.length < 2, "Need at least 2 GPX files in test-data/");

    await page.locator("#file-input").setInputFiles([files[0], files[1]]);

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
    await page.locator("#file-input").setInputFiles(gpxFiles()[0]);

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

  test("CartoDB API key input has an accessible label", async ({ page }) => {
    // Switch to CartoDB to make the section visible
    await page.locator("#provider-selector").selectOption("carto");
    await page.locator("#carto-api-key-section").waitFor({ state: "visible" });

    const input = page.locator("#carto-api-key");
    await expect(input).toHaveAttribute("aria-label");
    const label = await input.getAttribute("aria-label");
    expect(label?.length).toBeGreaterThan(0);
  });

  test("API key info button has an accessible label", async ({ page }) => {
    // Switch to CartoDB to make the section visible
    await page.locator("#provider-selector").selectOption("carto");
    await page.locator("#carto-api-key-section").waitFor({ state: "visible" });

    const btn = page.locator(".api-key-field__info-btn");
    await expect(btn).toHaveAttribute("aria-label");
    const label = await btn.getAttribute("aria-label");
    expect(label?.length).toBeGreaterThan(0);
  });

  test("API key tooltip has role=tooltip", async ({ page }) => {
    // Switch to CartoDB to make the section visible
    await page.locator("#provider-selector").selectOption("carto");
    await page.locator("#carto-api-key-section").waitFor({ state: "visible" });

    const tooltip = page.locator("#api-key-tooltip");
    await expect(tooltip).toHaveAttribute("role", "tooltip");
  });

  test("provider selector has an accessible label", async ({ page }) => {
    const selector = page.locator("#provider-selector");
    await expect(selector).toHaveAttribute("aria-label");
    const label = await selector.getAttribute("aria-label");
    expect(label?.length).toBeGreaterThan(0);
  });

  test("MapBox token input has an accessible label", async ({ page }) => {
    // Switch to MapBox to make the section visible
    await page.locator("#provider-selector").selectOption("mapbox");
    await page.locator("#mapbox-token-section").waitFor({ state: "visible" });

    const input = page.locator("#mapbox-api-key");
    await expect(input).toHaveAttribute("aria-label");
    const label = await input.getAttribute("aria-label");
    expect(label?.length).toBeGreaterThan(0);
  });

  test("conditional sections that are hidden carry aria-hidden=true", async ({
    page,
  }) => {
    // On load with "none" provider all three conditional sections are hidden
    const cartoSection = page.locator("#carto-api-key-section");
    const mapboxSection = page.locator("#mapbox-token-section");
    const styleSection = page.locator("#style-section");

    await expect(cartoSection).toHaveAttribute("aria-hidden", "true");
    await expect(mapboxSection).toHaveAttribute("aria-hidden", "true");
    await expect(styleSection).toHaveAttribute("aria-hidden", "true");
  });
});
