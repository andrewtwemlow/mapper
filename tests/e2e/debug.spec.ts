/**
 * Temporary debug test — remove after diagnosing the app shell render issue.
 */
import { test } from "@playwright/test";

test("debug: inspect page content and console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");
  await page.waitForTimeout(5000); // 5 seconds to let Wasm load

  const html = await page.content();
  console.log("=== PAGE HTML (first 3000 chars) ===");
  console.log(html.slice(0, 3000));
  console.log("=== CONSOLE ERRORS ===");
  console.log(JSON.stringify(errors, null, 2));
});
