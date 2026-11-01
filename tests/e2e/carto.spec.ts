/**
 * CartoDB API key scenarios — verifies the API key input field is present,
 * that entering a key updates the live map tile URLs, that the key is embedded
 * in the downloaded HTML map, and that the app degrades gracefully when no key
 * is provided.
 *
 * CartoDB uses `?key=<value>` as the authentication query parameter on tile URLs.
 *
 * Tile-loading tests that use CARTO_API_KEY verify the full round-trip against
 * the live CartoDB service. Set CARTO_API_KEY in the environment (or .env) to
 * enable them; they are skipped when the variable is absent.
 */

import { test, expect } from "@playwright/test";
import { gpxFiles } from "./test-data.js";

/**
 * A synthetic key used for structural URL assertions that do not require a
 * real network round-trip (e.g. checking `?key=` appears in tile src).
 */
const SYNTHETIC_API_KEY = "test_carto_key_abc123";

/**
 * Real CartoDB API key from the environment. When present, additional tests
 * verify that tiles actually load (HTTP 200) with the key appended.
 * Never commit this value — it is read from the environment only.
 */
const REAL_API_KEY: string = process.env["CARTO_API_KEY"] ?? "";

/** Base CartoDB tile hostname present in all tile URLs. */
const CARTO_TILE_HOST = "basemaps.cartocdn.com";

/**
 * The CartoDB query-string parameter name for API key authentication.
 * Per https://github.com/CartoDB/basemap-styles the correct param is `key`.
 */
const CARTO_KEY_PARAM = "key";

/**
 * Wait time in ms used after filling the API key input to allow the 600ms
 * debounce in ui.ts to settle before asserting download link content.
 */
const DEBOUNCE_SETTLE_MS = 800;

/**
 * Timeout in ms for waitForFunction calls that wait for Leaflet to reload
 * tiles after an API key or style change.
 */
const TILE_RELOAD_TIMEOUT_MS = 5_000;

/**
 * Number of CartoDB tile style variants defined in map.ts (DarkMatter,
 * DarkMatterNoLabels, Positron, Voyager). The exported HTML must contain
 * at least this many key= occurrences when a key is set.
 */
const CARTO_TILE_STYLE_COUNT = 4;

/** HTTP status code for a successful tile response. */
const HTTP_OK = 200;

test.describe("CartoDB API Key", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#drop-zone");
    // Default provider is "none" — switch to CartoDB so all tests run against
    // the CartoDB provider as they did before multi-provider was introduced.
    await page.locator("#provider-selector").selectOption("carto");
    await page.locator("#carto-api-key-section").waitFor({ state: "visible" });
  });

  // ── Field presence ────────────────────────────────────────────────────────

  test("API key input field is visible on page load", async ({ page }) => {
    await expect(page.locator("#carto-api-key")).toBeVisible();
  });

  test("API key input has correct accessible label", async ({ page }) => {
    await expect(page.locator("#carto-api-key")).toHaveAttribute(
      "aria-label",
      "CartoDB API key",
    );
  });

  test("API key section has section heading", async ({ page }) => {
    await expect(page.locator("#apikey-heading")).toHaveText("CartoDB API Key");
  });

  test("info button is visible next to the API key input", async ({ page }) => {
    await expect(page.locator(".api-key-field__info-btn")).toBeVisible();
  });

  test("info button has an accessible label", async ({ page }) => {
    await expect(page.locator(".api-key-field__info-btn")).toHaveAttribute(
      "aria-label",
      "API key security information",
    );
  });

  // ── Tooltip ───────────────────────────────────────────────────────────────

  test("tooltip is hidden by default", async ({ page }) => {
    await expect(page.locator("#api-key-tooltip")).toBeHidden();
  });

  test("clicking info button reveals tooltip", async ({ page }) => {
    await page.locator(".api-key-field__info-btn").click();
    await expect(page.locator("#api-key-tooltip")).toBeVisible();
  });

  test("tooltip contains API key security warning text", async ({ page }) => {
    await page.locator(".api-key-field__info-btn").click();
    await expect(page.locator("#api-key-tooltip")).toContainText("embedded");
    await expect(page.locator("#api-key-tooltip")).toContainText("Caution");
  });

  test("clicking info button again hides tooltip", async ({ page }) => {
    await page.locator(".api-key-field__info-btn").click();
    await expect(page.locator("#api-key-tooltip")).toBeVisible();

    await page.locator(".api-key-field__info-btn").click();
    await expect(page.locator("#api-key-tooltip")).toBeHidden();
  });

  // ── Live map tile URL — structural (no network assertion) ─────────────────

  test("without API key tile requests use plain CartoDB URLs", async ({ page }) => {
    // Wait for at least one tile image to be requested by Leaflet
    await page.waitForFunction(() => {
      const imgs = document.querySelectorAll<HTMLImageElement>(
        ".leaflet-tile-pane img",
      );
      return imgs.length > 0;
    });

    // No tile URL should carry a key query parameter
    const hasKeyParam = await page.evaluate((param: string) => {
      const imgs = document.querySelectorAll<HTMLImageElement>(
        ".leaflet-tile-pane img",
      );
      return Array.from(imgs).some((img) => img.src.includes(`${param}=`));
    }, CARTO_KEY_PARAM);
    expect(hasKeyParam).toBe(false);
  });

  test("with API key tile URLs include key query parameter", async ({ page }) => {
    await page.locator("#carto-api-key").fill(SYNTHETIC_API_KEY);

    // Wait for the debounced setApiKey to fire and Leaflet to reload tiles
    await page.waitForFunction(
      (args: { param: string; key: string }) => {
        const imgs = document.querySelectorAll<HTMLImageElement>(
          ".leaflet-tile-pane img",
        );
        return Array.from(imgs).some((img) =>
          img.src.includes(`${args.param}=${args.key}`),
        );
      },
      { param: CARTO_KEY_PARAM, key: SYNTHETIC_API_KEY },
      { timeout: TILE_RELOAD_TIMEOUT_MS },
    );

    const tileWithKey = await page.evaluate(
      (args: { param: string; key: string }) => {
        const imgs = document.querySelectorAll<HTMLImageElement>(
          ".leaflet-tile-pane img",
        );
        return Array.from(imgs).some((img) =>
          img.src.includes(`${args.param}=${args.key}`),
        );
      },
      { param: CARTO_KEY_PARAM, key: SYNTHETIC_API_KEY },
    );
    expect(tileWithKey).toBe(true);
  });

  test("clearing API key reverts tile requests to plain CartoDB URLs", async ({
    page,
  }) => {
    await page.locator("#carto-api-key").fill(SYNTHETIC_API_KEY);
    await page.waitForFunction(
      (args: { param: string; key: string }) => {
        const imgs = document.querySelectorAll<HTMLImageElement>(
          ".leaflet-tile-pane img",
        );
        return Array.from(imgs).some((img) =>
          img.src.includes(`${args.param}=${args.key}`),
        );
      },
      { param: CARTO_KEY_PARAM, key: SYNTHETIC_API_KEY },
      { timeout: TILE_RELOAD_TIMEOUT_MS },
    );

    // Clear the key
    await page.locator("#carto-api-key").fill("");

    await page.waitForFunction(
      (param: string) => {
        const imgs = document.querySelectorAll<HTMLImageElement>(
          ".leaflet-tile-pane img",
        );
        return (
          imgs.length > 0 &&
          Array.from(imgs).every((img) => !img.src.includes(`${param}=`))
        );
      },
      CARTO_KEY_PARAM,
      { timeout: TILE_RELOAD_TIMEOUT_MS },
    );
  });

  test("switching tile style after entering API key preserves the key in URLs", async ({
    page,
  }) => {
    await page.locator("#carto-api-key").fill(SYNTHETIC_API_KEY);

    await page.waitForFunction(
      (args: { param: string; key: string }) => {
        const imgs = document.querySelectorAll<HTMLImageElement>(
          ".leaflet-tile-pane img",
        );
        return Array.from(imgs).some((img) =>
          img.src.includes(`${args.param}=${args.key}`),
        );
      },
      { param: CARTO_KEY_PARAM, key: SYNTHETIC_API_KEY },
      { timeout: TILE_RELOAD_TIMEOUT_MS },
    );

    await page.locator("#tile-selector").selectOption("Positron");

    await page.waitForFunction(
      (args: { param: string; key: string; style: string }) => {
        const imgs = document.querySelectorAll<HTMLImageElement>(
          ".leaflet-tile-pane img",
        );
        return Array.from(imgs).some(
          (img) =>
            img.src.includes(args.style) &&
            img.src.includes(`${args.param}=${args.key}`),
        );
      },
      { param: CARTO_KEY_PARAM, key: SYNTHETIC_API_KEY, style: "light_all" },
      { timeout: TILE_RELOAD_TIMEOUT_MS },
    );
  });

  // ── Live tile loading with real key ───────────────────────────────────────

  test("tiles load successfully with real API key", async ({ page, request }) => {
    test.skip(!REAL_API_KEY, "CARTO_API_KEY not set — skipping live tile test");

    await page.locator("#carto-api-key").fill(REAL_API_KEY);

    // Wait for Leaflet to load tiles with the key
    await page.waitForFunction(
      (args: { param: string; key: string }) => {
        const imgs = document.querySelectorAll<HTMLImageElement>(
          ".leaflet-tile-pane img",
        );
        return Array.from(imgs).some((img) =>
          img.src.includes(`${args.param}=${args.key}`),
        );
      },
      { param: CARTO_KEY_PARAM, key: REAL_API_KEY },
      { timeout: TILE_RELOAD_TIMEOUT_MS },
    );

    // Fetch one tile URL directly and assert it returns HTTP 200
    const tileUrl = await page.evaluate(
      (args: { param: string; key: string }) => {
        const imgs = document.querySelectorAll<HTMLImageElement>(
          ".leaflet-tile-pane img",
        );
        const match = Array.from(imgs).find((img) =>
          img.src.includes(`${args.param}=${args.key}`),
        );
        return match?.src ?? null;
      },
      { param: CARTO_KEY_PARAM, key: REAL_API_KEY },
    );

    expect(tileUrl).toBeTruthy();
    const response = await request.get(tileUrl!);
    expect(response.status()).toBe(HTTP_OK);
  });

  // ── Downloaded HTML embedding ─────────────────────────────────────────────

  test("without API key downloaded HTML does not contain key param in tile URLs", async ({
    page,
  }) => {
    await page.locator("#file-input").setInputFiles(
      gpxFiles()[0],
    );
    await expect(page.locator("#track-list li")).toHaveCount(1);

    const htmlLink = page.locator("a.download-link[download='map.html']");
    const href = await htmlLink.getAttribute("href");
    expect(href).toBeTruthy();

    const content = await page.evaluate(async (url: string) => {
      const response = await fetch(url);
      return response.text();
    }, href!);

    expect(content).toContain(CARTO_TILE_HOST);
    expect(content).not.toContain(`${CARTO_KEY_PARAM}=`);
  });

  test("with API key downloaded HTML embeds key in all tile URLs", async ({
    page,
  }) => {
    await page.locator("#carto-api-key").fill(SYNTHETIC_API_KEY);
    await page.waitForTimeout(DEBOUNCE_SETTLE_MS);

    await page.locator("#file-input").setInputFiles(
      gpxFiles()[0],
    );
    await expect(page.locator("#track-list li")).toHaveCount(1);

    const htmlLink = page.locator("a.download-link[download='map.html']");
    const href = await htmlLink.getAttribute("href");
    expect(href).toBeTruthy();

    const content = await page.evaluate(async (url: string) => {
      const response = await fetch(url);
      return response.text();
    }, href!);

    expect(content).toContain(`${CARTO_KEY_PARAM}=${SYNTHETIC_API_KEY}`);
    // Should appear once per tile style variant
    const keyOccurrences = (
      content.match(
        new RegExp(`${CARTO_KEY_PARAM}=${SYNTHETIC_API_KEY}`, "g"),
      ) ?? []
    ).length;
    expect(keyOccurrences).toBeGreaterThanOrEqual(CARTO_TILE_STYLE_COUNT);
  });

  test("changing API key after upload regenerates download with new key", async ({
    page,
  }) => {
    await page.locator("#file-input").setInputFiles(
      gpxFiles()[0],
    );
    await expect(page.locator("#track-list li")).toHaveCount(1);

    await page.locator("#carto-api-key").fill(SYNTHETIC_API_KEY);
    await page.waitForTimeout(DEBOUNCE_SETTLE_MS);

    const htmlLink = page.locator("a.download-link[download='map.html']");
    const href = await htmlLink.getAttribute("href");
    expect(href).toBeTruthy();

    const content = await page.evaluate(async (url: string) => {
      const response = await fetch(url);
      return response.text();
    }, href!);

    expect(content).toContain(`${CARTO_KEY_PARAM}=${SYNTHETIC_API_KEY}`);
  });

  test("app remains functional without API key — tracks upload and display", async ({
    page,
  }) => {
    await page.locator("#file-input").setInputFiles(
      gpxFiles()[0],
    );

    await expect(page.locator("#track-list li")).toHaveCount(1);
    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
    await expect(
      page.locator("a.download-link[download='tracks.gpx']"),
    ).toBeVisible();
    await expect(
      page.locator("a.download-link[download='map.html']"),
    ).toBeVisible();
  });
});
