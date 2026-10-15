import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for GPX Mapper end-to-end tests.
 *
 * Browsers: Chromium and Firefox only (matching project browser targets).
 * Base URL: Vite preview server at http://localhost:4173.
 * The web server is started automatically before tests run.
 */
export default defineConfig({
  testDir: ".",
  fullyParallel: true,
  // Fail fast in CI if a test is accidentally marked `.only`
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  reporter: [["html", { outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
  ],
  webServer: {
    // Build must be run before E2E tests. The preview server serves app/dist/.
    command: "npm run preview --prefix ../../app",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000, // 120 seconds — allow time for the Vite build preview to start
  },
});
