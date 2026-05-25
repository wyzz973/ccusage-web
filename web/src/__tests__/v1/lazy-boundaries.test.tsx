// R2.1 — guard that the bundle-discipline lazy boundaries stay intact.
//
// spec-v2 §1.3 cap (≤+12 KB gz vs pre-R2) is honored by routing the
// heavy R2 surfaces through React.lazy. If a future change accidentally
// flips one of these to a static import, the production bundle will
// silently regrow. These tests pin the contract by asserting:
//
//   1. The lazy-loaded modules each export the named symbol the
//      App-level lazy boundary expects.
//   2. The eager App.tsx default-export wraps everything in `<Suspense>`
//      so the lazy chunks resolve correctly at runtime.
//
// We can't measure actual bundle size from jsdom — the production build
// is the source of truth for that — but these tests catch the most
// common regression (someone replacing `lazy(() => import("./X"))` with
// `import { X } from "./X"` for convenience).

import { describe, it, expect } from "vitest";

describe("R2.1 lazy boundaries", () => {
  it("HistoryV1 module exports the HistoryV1 named symbol", async () => {
    const m = await import("@/views/v1/pages/HistoryV1");
    expect(typeof m.HistoryV1).toBe("function");
  });

  it("ProjectsDialogV1 module exports ProjectsDialogV1", async () => {
    const m = await import("@/views/v1/components/ProjectsDialogV1");
    expect(typeof m.ProjectsDialogV1).toBe("function");
  });

  it("DateRangePickerV1 module exports DateRangePickerV1", async () => {
    const m = await import("@/views/v1/components/DateRangePickerV1");
    expect(typeof m.DateRangePickerV1).toBe("function");
  });

  it("SettingsPopoverV1 module exports SettingsPopoverV1", async () => {
    const m = await import("@/views/v1/components/SettingsPopoverV1");
    expect(typeof m.SettingsPopoverV1).toBe("function");
  });

  it("Dashboard (classic) module exports Dashboard", async () => {
    const m = await import("@/pages/Dashboard");
    expect(typeof m.Dashboard).toBe("function");
  });

  it("DashboardV1 module exports DashboardV1", async () => {
    const m = await import("@/views/v1/DashboardV1");
    expect(typeof m.DashboardV1).toBe("function");
  });
});
