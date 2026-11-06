/**
 * Health endpoint scenarios — verifies the /health route returns the expected
 * status and body for use with liveness and readiness probes.
 *
 * IMPORTANT: These tests require BASE_URL to point to an external server
 * (like nginx/Docker), because the Vite preview server doesn't expose a real
 * `/health` endpoint. The preview serves SPA fallback HTML for unmatched routes.
 * Set BASE_URL when running against production-like environment:
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
