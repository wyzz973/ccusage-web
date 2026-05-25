import { defineConfig, devices } from "@playwright/test";

// M-A4 (R1.5) — Playwright e2e config dedicated to PRD §3.3 contract.
//
// The single spec under `tests/e2e/` asserts the 3-second-insight budget
// against `?mode=v1`. Network throttling is applied per-test via CDP
// (`Network.emulateNetworkConditions`) rather than at the config level
// because Playwright doesn't currently ship a first-class "Fast 4G" preset.
//
// We launch `vite preview` against a pre-built bundle as the test server
// — that's static-only, so the spec mocks `/api/snapshot`, `/api/events`,
// and `/api/usage/hourly` via `page.route()` so the assertions don't
// depend on a live backend.

const PORT = Number(process.env.PLAYWRIGHT_WEB_PORT ?? 4173);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // `vite preview` serves the production build; the spec stubs /api/* so
    // we don't need a live backend in test. Bind explicitly to 127.0.0.1 —
    // by default `vite preview` only listens on the IPv6 localhost address,
    // which the `baseURL` (127.0.0.1) won't reach.
    command: `npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
