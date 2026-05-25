import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProjectsPanelV1 } from "@/views/v1/components/ProjectsPanelV1";
import { CacheSavingsPanelV1 } from "@/views/v1/components/CacheSavingsPanelV1";
import { LimitResetBannerV1 } from "@/views/v1/components/LimitResetBannerV1";
import { ModeBadgesV1 } from "@/views/v1/components/ModeBadgesV1";
import { __resetV1StoreForTests, useV1Store } from "@/views/v1/data/v1-store";
import type { Derived } from "@/types";

beforeEach(() => __resetV1StoreForTests());

describe("ProjectsPanelV1 (D1)", () => {
  const projects: NonNullable<Derived["projects"]> = [
    { canonical: "-Users-alice-alpha", displayName: "alpha", cost: 60, tokens: 6000, sessions: 3, pctOfWindow: 60 },
    { canonical: "-Users-alice-beta",  displayName: "beta",  cost: 30, tokens: 3000, sessions: 2, pctOfWindow: 30 },
    { canonical: "-Users-alice-gamma", displayName: "gamma", cost: 10, tokens: 1000, sessions: 1, pctOfWindow: 10 },
  ];

  it("renders top-N rows with displayName + pct + cost", () => {
    render(<ProjectsPanelV1 projects={projects} />);
    expect(screen.getByTestId("projects-panel-v1")).toBeInTheDocument();
    const rows = screen.getAllByTestId("project-row");
    expect(rows.length).toBe(3);
    expect(rows[0]?.textContent).toMatch(/alpha/);
    expect(rows[0]?.textContent).toMatch(/60%/);
  });

  it("renders empty state when no projects", () => {
    render(<ProjectsPanelV1 projects={[]} />);
    expect(screen.getByText(/No project metadata/i)).toBeInTheDocument();
  });

  it("clicking a row dispatches a project filter chip with canonical+displayName", () => {
    render(<ProjectsPanelV1 projects={projects} />);
    fireEvent.click(screen.getAllByTestId("project-row")[0]!);
    const filters = useV1Store.getState().filters;
    expect(filters).toEqual([{ kind: "project", value: "-Users-alice-alpha", displayName: "alpha" }]);
  });

  it("hides 'View all' button when projects.length ≤ 5", () => {
    render(<ProjectsPanelV1 projects={projects} />);
    expect(screen.queryByTestId("projects-view-all")).toBeNull();
  });
});

describe("CacheSavingsPanelV1 (D5)", () => {
  it("renders '—' when hitPct is null (D=0 invariant)", () => {
    render(<CacheSavingsPanelV1 cache={{ hitPct: null, savedUSD: 0, sparkPctPerDay: [], wkOverWkDropPct: null }} />);
    expect(screen.getByText(/No cache activity/i)).toBeInTheDocument();
  });

  it("renders hit% + saved $ when populated", () => {
    render(<CacheSavingsPanelV1 cache={{ hitPct: 0.42, savedUSD: 1.23, sparkPctPerDay: [0.1, 0.2, 0.3], wkOverWkDropPct: null }} />);
    expect(screen.getByTestId("cache-hit-pct").textContent).toMatch(/42%/);
    expect(screen.getByTestId("cache-saved-usd").textContent).toMatch(/\$1\.23/);
  });

  it("flips header to amber warn when wk/wk drop ≥25%", () => {
    render(<CacheSavingsPanelV1 cache={{ hitPct: 0.3, savedUSD: 0.5, sparkPctPerDay: [0.5, 0.3], wkOverWkDropPct: 0.4 }} />);
    expect(screen.getByText(/down 40%/i)).toBeInTheDocument();
  });
});

describe("LimitResetBannerV1 (D9)", () => {
  it("renders nothing when inactive", () => {
    const { container } = render(
      <LimitResetBannerV1 limitReset={{ active: false, resetAt: null, minutesUntilReset: null, source: null }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders banner with reset time + dismiss button when active", () => {
    render(
      <LimitResetBannerV1 limitReset={{
        active: true,
        resetAt: "2026-05-25T15:00:00.000Z",
        minutesUntilReset: 30,
        source: "heuristic",
      }} />,
    );
    expect(screen.getByTestId("limit-reset-banner-v1")).toBeInTheDocument();
    expect(screen.getByText(/30 min/i)).toBeInTheDocument();
  });

  it("dismiss button hides the banner for the session", () => {
    const props = {
      limitReset: { active: true, resetAt: "2026-05-25T15:00:00Z", minutesUntilReset: 30, source: "heuristic" as const },
    };
    const { rerender, container } = render(<LimitResetBannerV1 {...props} />);
    fireEvent.click(screen.getByTestId("limit-reset-dismiss"));
    expect(useV1Store.getState().limitResetDismissed).toBe(true);
    rerender(<LimitResetBannerV1 {...props} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("ModeBadgesV1 (spec-v2 §2.1)", () => {
  it("renders nothing when both modes are default", () => {
    const { container } = render(<ModeBadgesV1 />);
    expect(container.firstChild).toBeNull();
  });

  it("renders 'native' label with sky-300 class when nativeParser=true", () => {
    useV1Store.getState().setMode({ nativeParser: true });
    render(<ModeBadgesV1 />);
    const badge = screen.getByTestId("mode-badge-native");
    expect(badge.className).toMatch(/text-sky-300/);
    expect(badge.textContent).toBe("native");
  });

  it("renders 'offline' label when offline=true", () => {
    useV1Store.getState().setMode({ offline: true });
    render(<ModeBadgesV1 />);
    expect(screen.getByTestId("mode-badge-offline")).toBeInTheDocument();
  });
});
