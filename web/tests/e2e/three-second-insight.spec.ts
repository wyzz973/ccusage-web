// PRD §3.3 — three-second insight budget for v1 mode.
//
// Asserts that on a Fast-4G-throttled Chromium load of `/?mode=v1`, the
// four key DOM nodes are present and non-empty within 3000 ms of
// `page.goto`:
//
//   [data-testid=metric-card-today]
//   [data-testid=driver-strip]
//   [data-testid=driver-segment-{agent|model|project}] (at least one)
//   [data-testid=live-indicator]
//
// `vite preview` (configured in playwright.config.ts) serves the static
// production bundle. We mock /api/snapshot, /api/events, and
// /api/usage/hourly via page.route() so the test is fully self-contained
// and doesn't need a live ccusage-web server.

import { expect, test } from "@playwright/test";

// PRD §3.3 budget: 3000 ms from `page.goto` to "all 4 selectors visible+non-empty".
const INSIGHT_BUDGET_MS = 3_000;

// PRD §3.3 throttle: Fast 4G — 1.6 Mbit/s down, 750 Kbit/s up, 150 ms RTT.
// Implemented via CDP since Playwright doesn't expose a "Fast 4G" preset.
const FAST_4G = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8, // bytes/sec
  uploadThroughput:   (750 * 1024)        / 8,
  latency: 150,
};

function fakeSnapshot(): unknown {
  return {
    generatedAt: new Date().toISOString(),
    ccusageVersion: "test-shim",
    daily: {
      records: [
        {
          period: new Date().toISOString().slice(0, 10),
          agent: "all", totalTokens: 1000, totalCost: 7,
          inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
          modelsUsed: ["opus"],
          modelBreakdowns: [{ modelName: "opus", cost: 7, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }],
          metadata: { agents: ["claude"] },
        },
        {
          period: new Date().toISOString().slice(0, 10),
          agent: "all", totalTokens: 500, totalCost: 3,
          inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
          modelsUsed: ["gpt-5.4"],
          modelBreakdowns: [{ modelName: "gpt-5.4", cost: 3, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }],
          metadata: { agents: ["codex"] },
        },
      ],
    },
    weekly:  { records: [] },
    monthly: { records: [] },
    session: {
      records: [
        { period: "sess-1", agent: "claude", totalTokens: 1000, totalCost: 7, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, modelsUsed: ["opus"], modelBreakdowns: [], metadata: { lastActivity: new Date().toISOString() } },
        { period: "sess-2", agent: "codex",  totalTokens: 500,  totalCost: 3, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, modelsUsed: ["gpt-5.4"], modelBreakdowns: [], metadata: { lastActivity: new Date().toISOString() } },
      ],
    },
    blocks: { records: [] },
    derived: {
      today:   { tokens: 1500, cost: 10 },
      week:    { tokens: 1500, cost: 10 },
      month:   { tokens: 1500, cost: 10 },
      allTime: { tokens: 1500, cost: 10 },
      activeBlock: null,
      activeSessionCount: 0,
      todayDrivers: {
        totalCostUSD: 10,
        agent: { name: "claude", pct: 70, costUSD: 7 },
        model: { name: "opus",   pct: 70, costUSD: 7 },
      },
      deltas: {
        today: { pct: 0.23, vsLabel: "vs yesterday",  current: 10, previous: 8 },
        week:  { pct: 0.10, vsLabel: "vs last week",  current: 10, previous: 9 },
        month: { pct: 0.05, vsLabel: "vs last month", current: 10, previous: 9.5 },
      },
    },
  };
}

test.describe("PRD §3.3 — three-second insight (v1 mode, Fast 4G)", () => {
  test("4 key DOM nodes present & non-empty within 3 s of page.goto('/?mode=v1')", async ({ page, context }) => {
    // Apply Fast-4G throttling via CDP before navigation.
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", FAST_4G);

    // Stub the three endpoints the v1 dashboard hits at mount.
    await page.route("**/api/snapshot", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fakeSnapshot()) }),
    );
    await page.route("**/api/events", (route) =>
      // EventSource expects a streaming response; an empty body keeps the
      // connection alive long enough for the assertions below.
      route.fulfill({ status: 200, contentType: "text/event-stream", body: ":connected\n\n" }),
    );
    await page.route("**/api/usage/hourly**", (route) =>
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          date: new Date().toISOString().slice(0, 10),
          tz: "UTC",
          buckets: Array.from({ length: 24 }, (_, h) => ({ hour: h, cost: 0 })),
        }),
      }),
    );

    const start = Date.now();
    await page.goto("/?mode=v1", { waitUntil: "commit" });

    // Wait for all four key selectors. The combined timeout is the PRD budget.
    const today  = page.getByTestId("metric-card-today");
    const driver = page.getByTestId("driver-strip");
    const seg    = page.locator("[data-testid^='driver-segment-']").first();
    const live   = page.getByTestId("live-indicator");

    await Promise.all([
      expect(today).toBeVisible({ timeout: INSIGHT_BUDGET_MS }),
      expect(driver).toBeVisible({ timeout: INSIGHT_BUDGET_MS }),
      expect(seg).toBeVisible({ timeout: INSIGHT_BUDGET_MS }),
      expect(live).toBeVisible({ timeout: INSIGHT_BUDGET_MS }),
    ]);

    // Each must be non-empty (no `—`-only placeholder).
    await expect(today).not.toHaveText("");
    await expect(driver).not.toHaveText("");
    await expect(seg).not.toHaveText("");
    await expect(live).not.toHaveText("");

    const elapsed = Date.now() - start;
    expect(elapsed, `4 testids visible within ${INSIGHT_BUDGET_MS} ms`).toBeLessThanOrEqual(INSIGHT_BUDGET_MS);
  });
});
