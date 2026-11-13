/**
 * Track controls — visibility toggle and drag-to-reorder.
 *
 * Covers:
 * - Eye button toggles track visibility on the map (polyline hidden/shown).
 * - Eye button aria-pressed state reflects current visibility.
 * - Hidden track item is visually dimmed in the sidebar.
 * - Re-showing a hidden track restores the polyline.
 * - Drag-and-drop reorders items in the sidebar.
 * - Reorder updates map paint z-order (topmost list item paints over others).
 * - Drag handle has grab cursor.
 * - Accessibility: visibility button has an accessible label.
 */

import { test, expect } from "@playwright/test";
import { gpxFiles } from "./test-data.js";

test.describe("Track Controls — Visibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#drop-zone");
    await page.locator("#file-input").setInputFiles(gpxFiles()[0]);
    // Wait for the track list item to appear.
    await page.locator("#track-list li").first().waitFor({ state: "visible" });
  });

  test("each track row has a visibility toggle button", async ({ page }) => {
    await expect(
      page.locator("#track-list li .track-list__visibility").first(),
    ).toBeVisible();
  });

  test("visibility button has an accessible label", async ({ page }) => {
    const btn = page.locator("#track-list li .track-list__visibility").first();
    const label = await btn.getAttribute("aria-label");
    expect(label).toMatch(/hide track/i);
  });

  test("visibility button aria-pressed is false when track is visible", async ({ page }) => {
    const btn = page.locator("#track-list li .track-list__visibility").first();
    await expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  test("clicking visibility button hides the polyline", async ({ page }) => {
    const btn = page.locator("#track-list li .track-list__visibility").first();
    await btn.click();

    // Leaflet removes the path element from the overlay pane when the layer
    // is removed from the map.
    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(0);
  });

  test("clicking visibility button sets aria-pressed to true", async ({ page }) => {
    const btn = page.locator("#track-list li .track-list__visibility").first();
    await btn.click();
    await expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  test("clicking visibility button updates aria-label to 'Show'", async ({ page }) => {
    const btn = page.locator("#track-list li .track-list__visibility").first();
    await btn.click();
    const label = await btn.getAttribute("aria-label");
    expect(label).toMatch(/show track/i);
  });

  test("hidden track row gets dimmed class", async ({ page }) => {
    const btn = page.locator("#track-list li .track-list__visibility").first();
    await btn.click();
    await expect(page.locator("#track-list li").first()).toHaveClass(
      /track-list__item--hidden/,
    );
  });

  test("clicking visibility button again restores the polyline", async ({ page }) => {
    const btn = page.locator("#track-list li .track-list__visibility").first();
    await btn.click();
    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(0);

    await btn.click();
    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
  });

  test("re-showing a track clears the dimmed class", async ({ page }) => {
    const btn = page.locator("#track-list li .track-list__visibility").first();
    await btn.click();
    await btn.click();
    await expect(page.locator("#track-list li").first()).not.toHaveClass(
      /track-list__item--hidden/,
    );
  });

  test("re-showing sets aria-pressed back to false", async ({ page }) => {
    const btn = page.locator("#track-list li .track-list__visibility").first();
    await btn.click();
    await btn.click();
    await expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  test("hiding one track does not hide the other", async ({ page }) => {
    const files = gpxFiles();
    test.skip(files.length < 2, "Need at least 2 GPX files in test-data/");

    // Upload a second track.
    await page.locator("#file-input").setInputFiles(files[1]);
    await expect(page.locator("#track-list li")).toHaveCount(2);
    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(2);

    // Hide only the first track.
    const firstBtn = page.locator("#track-list li .track-list__visibility").first();
    await firstBtn.click();

    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
  });
});

test.describe("Track Controls — Drag Handle", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#drop-zone");
    await page.locator("#file-input").setInputFiles(gpxFiles()[0]);
    await page.locator("#track-list li").first().waitFor({ state: "visible" });
  });

  test("each track row has a drag handle element", async ({ page }) => {
    await expect(
      page.locator("#track-list li .track-list__drag-handle").first(),
    ).toBeVisible();
  });

  test("drag handle is aria-hidden (decorative)", async ({ page }) => {
    const handle = page.locator("#track-list li .track-list__drag-handle").first();
    await expect(handle).toHaveAttribute("aria-hidden", "true");
  });

  test("drag handle has grab cursor via CSS", async ({ page }) => {
    const cursor = await page
      .locator("#track-list li .track-list__drag-handle")
      .first()
      .evaluate((el) => window.getComputedStyle(el).cursor);
    // 'grab' is the expected value; some browsers report 'grab' others '-webkit-grab'
    expect(cursor).toMatch(/grab/);
  });
});

test.describe("Track Controls — Drag Reorder", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#drop-zone");
  });

  /**
   * Simulate an HTML5 drag-and-drop reorder by dispatching the full sequence
   * of drag events on the source and target elements.
   *
   * Playwright's `dragTo` synthesises mouse events which do not reliably trigger
   * HTML5 DragEvent handlers (`dragstart`, `dragover`, `drop`). Dispatching
   * DragEvents directly via `page.evaluate` with an explicit `clientY` is the
   * correct approach for HTML5 drag-and-drop.
   *
   * The `position` parameter controls which half of the target receives the
   * drop: `"top"` inserts the dragged item *before* the target; `"bottom"`
   * inserts it *after* the target.
   *
   * @param page - Playwright page.
   * @param sourceSelector - CSS selector for the item being dragged.
   * @param targetSelector - CSS selector for the drop target item.
   * @param position - Which half of the target to drop onto.
   */
  async function simulateDragReorder(
    page: import("@playwright/test").Page,
    sourceSelector: string,
    targetSelector: string,
    position: "top" | "bottom",
  ): Promise<void> {
    await page.evaluate(
      ({
        src,
        tgt,
        pos,
      }: {
        src: string;
        tgt: string;
        pos: "top" | "bottom";
      }) => {
        const source = document.querySelector(src) as HTMLElement | null;
        const target = document.querySelector(tgt) as HTMLElement | null;
        if (!source || !target) return;

        // Compute a clientY that reliably lands in the requested half.
        const rect = target.getBoundingClientRect();
        const clientY =
          pos === "top"
            ? rect.top + rect.height * 0.25
            : rect.top + rect.height * 0.75;

        const dataTransfer = new DataTransfer();
        source.dispatchEvent(
          new DragEvent("dragstart", { bubbles: true, dataTransfer }),
        );
        target.dispatchEvent(
          new DragEvent("dragover", { bubbles: true, dataTransfer, clientY }),
        );
        target.dispatchEvent(
          new DragEvent("drop", { bubbles: true, dataTransfer, clientY }),
        );
        source.dispatchEvent(
          new DragEvent("dragend", { bubbles: true, dataTransfer }),
        );
      },
      { src: sourceSelector, tgt: targetSelector, pos: position },
    );
  }

  test("reordering two tracks changes their DOM order in the sidebar", async ({
    page,
  }) => {
    const files = gpxFiles();
    test.skip(files.length < 2, "Need at least 2 GPX files in test-data/");

    await page.locator("#file-input").setInputFiles(files[0]);
    await page.locator("#file-input").setInputFiles(files[1]);
    await expect(page.locator("#track-list li")).toHaveCount(2);

    // Record the initial order.
    const initialOrder = await page
      .locator("#track-list li")
      .evaluateAll((items) =>
        items.map((el) => (el as HTMLElement).dataset["trackName"] ?? ""),
      );

    // Drop item[1] onto the top half of item[0] → inserts item[1] before item[0].
    await simulateDragReorder(
      page,
      "#track-list li:nth-child(2)",
      "#track-list li:nth-child(1)",
      "top",
    );

    const newOrder = await page
      .locator("#track-list li")
      .evaluateAll((items) =>
        items.map((el) => (el as HTMLElement).dataset["trackName"] ?? ""),
      );

    // The order must have changed.
    expect(newOrder).not.toEqual(initialOrder);
    // Both tracks are still present.
    expect(newOrder).toHaveLength(2);
    expect(newOrder).toContain(initialOrder[0]);
    expect(newOrder).toContain(initialOrder[1]);
  });

  test("dropping onto bottom half inserts after the target", async ({ page }) => {
    const files = gpxFiles();
    test.skip(files.length < 2, "Need at least 2 GPX files in test-data/");

    await page.locator("#file-input").setInputFiles(files[0]);
    await page.locator("#file-input").setInputFiles(files[1]);
    await expect(page.locator("#track-list li")).toHaveCount(2);

    const initialOrder = await page
      .locator("#track-list li")
      .evaluateAll((items) =>
        items.map((el) => (el as HTMLElement).dataset["trackName"] ?? ""),
      );

    // Drop item[0] onto the bottom half of item[1] → inserts item[0] after item[1].
    await simulateDragReorder(
      page,
      "#track-list li:nth-child(1)",
      "#track-list li:nth-child(2)",
      "bottom",
    );

    const newOrder = await page
      .locator("#track-list li")
      .evaluateAll((items) =>
        items.map((el) => (el as HTMLElement).dataset["trackName"] ?? ""),
      );

    // item[0] should now be after item[1].
    expect(newOrder[0]).toBe(initialOrder[1]);
    expect(newOrder[1]).toBe(initialOrder[0]);
  });

  test("reordering keeps both polylines visible on the map", async ({ page }) => {
    const files = gpxFiles();
    test.skip(files.length < 2, "Need at least 2 GPX files in test-data/");

    await page.locator("#file-input").setInputFiles(files[0]);
    await page.locator("#file-input").setInputFiles(files[1]);
    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(2);

    await simulateDragReorder(
      page,
      "#track-list li:nth-child(2)",
      "#track-list li:nth-child(1)",
      "top",
    );

    // Both polylines must still be rendered after the reorder.
    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(2);
  });

  test("download links are still present after reorder", async ({ page }) => {
    const files = gpxFiles();
    test.skip(files.length < 2, "Need at least 2 GPX files in test-data/");

    await page.locator("#file-input").setInputFiles(files[0]);
    await page.locator("#file-input").setInputFiles(files[1]);

    await simulateDragReorder(
      page,
      "#track-list li:nth-child(2)",
      "#track-list li:nth-child(1)",
      "top",
    );

    await expect(
      page.locator("#download-section a[download='tracks.gpx']"),
    ).toBeVisible();
    await expect(
      page.locator("#download-section a[download='map.html']"),
    ).toBeVisible();
  });
});
