/**
 * Download scenarios — verifies GPX and HTML map download links appear after
 * upload, that downloaded content has the correct structure, and that the
 * exported HTML map opens correctly in the browser.
 */

import { test, expect } from "@playwright/test";
import { gpxFiles, fileStem } from "./test-data.js";

/** GPX 1.1 namespace URI expected in the combined GPX output. */
const GPX_NAMESPACE = "http://www.topografix.com/GPX/1/1";

/** Leaflet CDN hostname expected in the exported HTML map. */
const LEAFLET_CDN_HOST = "unpkg.com";

/**
 * Number of files uploaded in the multi-track trk count test.
 * Must match the number of files passed to setInputFiles in that test.
 */
const TWO_TRACKS = 2;

/**
 * Timeout in ms for the exported HTML map to initialise Leaflet from CDN.
 * Allow extra time as the CDN script must be fetched over the network.
 */
const EXPORTED_MAP_TIMEOUT_MS = 15_000;

test.describe("Downloads", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#drop-zone");
  });

  test("download links absent before any upload", async ({ page }) => {
    await expect(page.locator("a.download-link")).toHaveCount(0);
    await expect(page.locator("#download-section .downloads__empty")).toBeVisible();
  });

  test("GPX download link present after upload", async ({ page }) => {
    await page.locator("#file-input").setInputFiles(gpxFiles()[0]);

    const gpxLink = page.locator("a.download-link[download='tracks.gpx']");
    await expect(gpxLink).toBeVisible();
    await expect(gpxLink).toHaveAttribute("aria-label", "Download combined GPX file");
  });

  test("HTML map download link present after upload", async ({ page }) => {
    await page.locator("#file-input").setInputFiles(gpxFiles()[0]);

    const htmlLink = page.locator("a.download-link[download='map.html']");
    await expect(htmlLink).toBeVisible();
    await expect(htmlLink).toHaveAttribute("aria-label", "Download shareable HTML map");
  });

  test("downloaded GPX contains valid XML with GPX 1.1 namespace", async ({ page }) => {
    await page.locator("#file-input").setInputFiles(gpxFiles()[0]);

    const gpxLink = page.locator("a.download-link[download='tracks.gpx']");
    const href = await gpxLink.getAttribute("href");
    expect(href).toBeTruthy();

    const content = await page.evaluate(async (url: string) => {
      const response = await fetch(url);
      return response.text();
    }, href!);

    expect(content).toContain(`xmlns="${GPX_NAMESPACE}"`);
    expect(content).toContain("<trk>");
    expect(content).toContain("<trkpt");
  });

  test("downloaded GPX contains one trk per uploaded file", async ({ page }) => {
    const files = gpxFiles();
    test.skip(files.length < TWO_TRACKS, "Need at least 2 GPX files in test-data/");

    await page.locator("#file-input").setInputFiles(files[0]);
    await expect(page.locator("#track-list li")).toHaveCount(1);

    await page.locator("#file-input").setInputFiles(files[1]);
    await expect(page.locator("#track-list li")).toHaveCount(TWO_TRACKS);

    const gpxLink = page.locator("a.download-link[download='tracks.gpx']");
    const href = await gpxLink.getAttribute("href");
    expect(href).toBeTruthy();

    const content = await page.evaluate(async (url: string) => {
      const response = await fetch(url);
      return response.text();
    }, href!);

    const trkCount = (content.match(/<trk>/g) ?? []).length;
    expect(trkCount).toBe(TWO_TRACKS);
  });

  test("each trk element has a name matching the filename stem", async ({ page }) => {
    const file = gpxFiles()[0];
    const stem = fileStem(file);

    await page.locator("#file-input").setInputFiles(file);

    const gpxLink = page.locator("a.download-link[download='tracks.gpx']");
    const href = await gpxLink.getAttribute("href");
    expect(href).toBeTruthy();

    const content = await page.evaluate(async (url: string) => {
      const response = await fetch(url);
      return response.text();
    }, href!);

    expect(content).toContain(`<name>${stem}</name>`);
  });

  test("downloaded HTML contains Leaflet CDN reference", async ({ page }) => {
    await page.locator("#file-input").setInputFiles(gpxFiles()[0]);

    const htmlLink = page.locator("a.download-link[download='map.html']");
    const href = await htmlLink.getAttribute("href");
    expect(href).toBeTruthy();

    const content = await page.evaluate(async (url: string) => {
      const response = await fetch(url);
      return response.text();
    }, href!);

    expect(content).toContain(LEAFLET_CDN_HOST);
  });

  test("downloaded HTML contains embedded track data script block", async ({ page }) => {
    const file = gpxFiles()[0];
    const stem = fileStem(file);

    await page.locator("#file-input").setInputFiles(file);

    const htmlLink = page.locator("a.download-link[download='map.html']");
    const href = await htmlLink.getAttribute("href");
    expect(href).toBeTruthy();

    const content = await page.evaluate(async (url: string) => {
      const response = await fetch(url);
      return response.text();
    }, href!);

    expect(content).toContain("var TRACK_DATA =");
    expect(content).toContain(stem);
  });

  test("exported HTML map opens and renders in a new page", async ({
    page,
    context,
  }) => {
    await page.locator("#file-input").setInputFiles(gpxFiles()[0]);

    const htmlLink = page.locator("a.download-link[download='map.html']");
    const href = await htmlLink.getAttribute("href");
    expect(href).toBeTruthy();

    const content = await page.evaluate(async (url: string) => {
      const response = await fetch(url);
      return response.text();
    }, href!);

    // Serve the exported HTML via an intercepted route — Vite SPA fallback
    // would otherwise return index.html for any unmatched path.
    const exportedPage = await context.newPage();
    await exportedPage.route("**/exported-map-test.html", (route) => {
      route.fulfill({
        contentType: "text/html",
        body: content,
      });
    });
    await exportedPage.goto("http://localhost:4173/exported-map-test.html");

    await expect(exportedPage.locator(".leaflet-container")).toBeVisible({
      timeout: EXPORTED_MAP_TIMEOUT_MS,
    });

    await exportedPage.close();
  });
});
