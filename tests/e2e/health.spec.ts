/**
 * Health endpoint scenarios — verifies the /health route returns the expected
 * status and body for use with liveness and readiness probes.
 *
 * IMPORTANT: These tests require the nginx Docker container, not the Vite
 * preview server. The preview server serves index.html for all unmatched
 * routes (SPA fallback), so /health will return 200 with HTML content rather
 * than the JSON health response. Run these tests against the Docker container:
 *
 *   docker build -t gpx-mapper . && docker run -p 8080:80 gpx-mapper
 *   BASE_URL=http://localhost:8080 npx playwright test health.spec.ts
 */

import { test, expect } from "@playwright/test";

/** Expected JSON body from the health endpoint. */
const HEALTH_RESPONSE_BODY = '{"status":"ok"}';

test.describe("Health Endpoint", () => {
  test("GET /health returns 200 OK", async ({ request }) => {
    const response = await request.get("/health");
    expect(response.status()).toBe(200);
  });

  test("GET /health returns application/json content type", async ({
    request,
  }) => {
    const response = await request.get("/health");
    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType).toContain("application/json");
  });

  test("GET /health returns expected JSON body", async ({ request }) => {
    const response = await request.get("/health");
    const body = await response.text();
    expect(body).toBe(HEALTH_RESPONSE_BODY);
  });
});
