/**
 * Download scenarios — verifies GPX and HTML map download links appear after
 * upload, that downloaded content has the correct structure, and that the
 * exported HTML map opens correctly in the browser.
 */

import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

/** Absolute path to the shared test data directory. */
const TEST_DATA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test-data",
);

/** GPX 1.1 namespace URI expected in the combined GPX output. */
const GPX_NAMESPACE = "http://www.topografix.com/GPX/1/1";

/** Leaflet CDN hostname expected in the exported HTML map. */
const LEAFLET_CDN_HOST = "unpkg.com";

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
    await page.locator("#file-input").setInputFiles(
      path.join(TEST_DATA_DIR, "A100.gpx"),
    );

    const gpxLink = page.locator("a.download-link[download='tracks.gpx']");
    await expect(gpxLink).toBeVisible();
    await expect(gpxLink).toHaveAttribute("aria-label", "Download combined GPX file");
  });

  test("HTML map download link present after upload", async ({ page }) => {
    await page.locator("#file-input").setInputFiles(
      path.join(TEST_DATA_DIR, "A100.gpx"),
    );

    const htmlLink = page.locator("a.download-link[download='map.html']");
    await expect(htmlLink).toBeVisible();
    await expect(htmlLink).toHaveAttribute("aria-label", "Download shareable HTML map");
  });

  test("downloaded GPX contains valid XML with GPX 1.1 namespace", async ({ page }) => {
    await page.locator("#file-input").setInputFiles(
      path.join(TEST_DATA_DIR, "A100.gpx"),
    );

    // Intercept the blob URL content by reading the href and fetching it
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
    /** Number of files uploaded in this test — must match the trk count assertion. */
    const UPLOAD_COUNT = 2;

    // Upload files sequentially, waiting for each track to appear before the next
    await page.locator("#file-input").setInputFiles(
      path.join(TEST_DATA_DIR, "A100.gpx"),
    );
    await expect(page.locator("#track-list li")).toHaveCount(1);

    await page.locator("#file-input").setInputFiles(
      path.join(TEST_DATA_DIR, "CW50.gpx"),
    );
    await expect(page.locator("#track-list li")).toHaveCount(UPLOAD_COUNT);

    const gpxLink = page.locator("a.download-link[download='tracks.gpx']");
    const href = await gpxLink.getAttribute("href");
    expect(href).toBeTruthy();

    const content = await page.evaluate(async (url: string) => {
      const response = await fetch(url);
      return response.text();
    }, href!);

    // Count opening <trk> tags — should equal UPLOAD_COUNT
    const trkCount = (content.match(/<trk>/g) ?? []).length;
    expect(trkCount).toBe(UPLOAD_COUNT);
  });

  test("each trk element has a name matching the filename stem", async ({ page }) => {
    await page.locator("#file-input").setInputFiles(
      path.join(TEST_DATA_DIR, "A100.gpx"),
    );

    const gpxLink = page.locator("a.download-link[download='tracks.gpx']");
    const href = await gpxLink.getAttribute("href");
    expect(href).toBeTruthy();

    const content = await page.evaluate(async (url: string) => {
      const response = await fetch(url);
      return response.text();
    }, href!);

    expect(content).toContain("<name>A100</name>");
  });

  test("downloaded HTML contains Leaflet CDN reference", async ({ page }) => {
    await page.locator("#file-input").setInputFiles(
      path.join(TEST_DATA_DIR, "A100.gpx"),
    );

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
    await page.locator("#file-input").setInputFiles(
      path.join(TEST_DATA_DIR, "A100.gpx"),
    );

    const htmlLink = page.locator("a.download-link[download='map.html']");
    const href = await htmlLink.getAttribute("href");
    expect(href).toBeTruthy();

    const content = await page.evaluate(async (url: string) => {
      const response = await fetch(url);
      return response.text();
    }, href!);

    expect(content).toContain("var TRACK_DATA =");
    expect(content).toContain("A100");
  });

  test("exported HTML map opens and renders in a new page", async ({
    page,
    context,
  }) => {
    await page.locator("#file-input").setInputFiles(
      path.join(TEST_DATA_DIR, "A100.gpx"),
    );

    const htmlLink = page.locator("a.download-link[download='map.html']");
    const href = await htmlLink.getAttribute("href");
    expect(href).toBeTruthy();

    // Fetch the HTML content from the blob URL
    const content = await page.evaluate(async (url: string) => {
      const response = await fetch(url);
      return response.text();
    }, href!);

    // Use a dedicated test route to serve the exported HTML — Vite preview uses
    // SPA fallback so all unmatched routes return index.html, meaning we can't
    // write the file to dist/. Instead intercept a known test URL.
    const exportedPage = await context.newPage();
    await exportedPage.route("**/exported-map-test.html", (route) => {
      route.fulfill({
        contentType: "text/html",
        body: content,
      });
    });
    await exportedPage.goto("http://localhost:4173/exported-map-test.html");

    // The exported map should initialise a Leaflet container
    await expect(exportedPage.locator(".leaflet-container")).toBeVisible({
      timeout: 15_000, // 15 seconds — allow time for Leaflet CDN script to load
    });

    await exportedPage.close();
  });
});
