// R3.6 — Per-agent fan-out contract test.
//
// Asserts two convergence-critical properties:
//
//   1. NO fan-out fires before the user flips to "By agent" — the
//      /api/per-agent endpoint stays untouched on the default load.
//      This guards against an opportunistic refactor wiring the fetch
//      into the snapshot hop (which would defeat lazy loading).
//
//   2. When the fan-out times out, the UI surfaces the status footer
//      instead of silently rendering an aggregate without explanation.
//      This is the §3.2.4 "all-timeout" state — the silent-failure
//      shape R3 is designed to close.
//
// The wall-clock invariant (100ms skeleton render) is tested at the unit
// level (see `r3-components.test.tsx` for the per-agent state machine
// transitions). E2E focuses on the network-contract + visible-status
// pieces that unit tests can't cover.

import { expect, test } from "@playwright/test";

function fakeSnapshot(detectedAgents: string[] = ["claude", "codex"]): unknown {
  return {
    generatedAt: new Date().toISOString(),
    ccusageVersion: "test-shim",
    daily:   { records: [] },
    weekly:  { records: [] },
    monthly: { records: [] },
    session: { records: [] },
    blocks:  { records: [] },
    derived: {
      today:   { tokens: 0, cost: 0 },
      week:    { tokens: 0, cost: 0 },
      month:   { tokens: 0, cost: 0 },
      allTime: { tokens: 0, cost: 0 },
      activeBlock: null,
      activeSessionCount: 0,
      todayDrivers: { totalCostUSD: 0 },
      detectedAgents,
      mode: { parser: "fallback" },
    },
  };
}

test.describe("R3.6 — per-agent contract", () => {
  test("no /api/per-agent call on default 'aggregate' view", async ({ page }) => {
    let perAgentHits = 0;
    await page.route("**/api/snapshot", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fakeSnapshot()) }),
    );
    await page.route("**/api/events", (r) =>
      r.fulfill({ status: 200, contentType: "text/event-stream", body: ":connected\n\n" }),
    );
    await page.route("**/api/usage/hourly**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ date: "2026-05-25", tz: "UTC", buckets: [] }) }),
    );
    await page.route("**/api/per-agent**", (r) => {
      perAgentHits += 1;
      r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ status: "ok", succeeded: [], failed: [], timedOut: [], elapsedMs: 0, budgetMs: 800 }) });
    });

    await page.goto("/?mode=v1");
    // Give the dashboard a beat to settle.
    await page.getByTestId("dashboard-v1").waitFor();
    await page.waitForTimeout(300);
    expect(perAgentHits, "default view must not fan out per-agent — that defeats lazy loading").toBe(0);
  });

  test("flipping to by-agent fires fan-out; all-timeout surfaces §3.2.4 footer", async ({ page }) => {
    await page.route("**/api/snapshot", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fakeSnapshot()) }),
    );
    await page.route("**/api/events", (r) =>
      r.fulfill({ status: 200, contentType: "text/event-stream", body: ":connected\n\n" }),
    );
    await page.route("**/api/usage/hourly**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ date: "2026-05-25", tz: "UTC", buckets: [] }) }),
    );
    // Mock a timeout response — every agent landed in timedOut[].
    await page.route("**/api/per-agent**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({
          status: "timeout",
          succeeded: [],
          failed: [],
          timedOut: [{ agent: "claude" }, { agent: "codex" }],
          elapsedMs: 800, budgetMs: 800,
        }),
      }),
    );

    await page.goto("/?mode=v1");
    await page.getByTestId("dashboard-v1").waitFor();

    // Flip to "by-agent". The ViewToggle's `aggregate / by-agent` buttons
    // share a radiogroup; we find by accessible name.
    const byAgentBtn = page.getByRole("radio", { name: /by agent/i });
    await byAgentBtn.click();

    // The §3.2.4 status footer must surface the timeout — NOT silently
    // collapse back to aggregate without explanation.
    const footer = page.getByTestId("per-agent-status");
    await expect(footer).toBeVisible({ timeout: 2_000 });
    await expect(footer).toContainText(/Per-agent breakdown unavailable/i);
  });
});
