import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DriverStrip } from "@/views/v1/components/DriverStrip";
import { __resetV1StoreForTests, useV1Store } from "@/views/v1/data/v1-store";

beforeEach(() => __resetV1StoreForTests());

describe("DriverStrip", () => {
  it("renders empty state when totalCostUSD is 0", () => {
    render(<DriverStrip totalCostUSD={0} />);
    expect(screen.getByTestId("driver-strip-empty").textContent).toMatch(/No activity yet today/i);
  });

  it("renders all three segments when present", () => {
    render(
      <DriverStrip
        agent={{ name: "claude", pct: 72, costUSD: 36 }}
        model={{ name: "opus-4-7", pct: 61, costUSD: 30 }}
        project={{ name: "client-a", pct: 48, costUSD: 24 }}
        totalCostUSD={50}
      />,
    );
    expect(screen.getByTestId("driver-segment-agent")).toBeInTheDocument();
    expect(screen.getByTestId("driver-segment-model")).toBeInTheDocument();
    expect(screen.getByTestId("driver-segment-project")).toBeInTheDocument();
    expect(screen.getByText("Claude")).toBeInTheDocument(); // labelized agent name
    expect(screen.getByText("opus-4-7")).toBeInTheDocument();
  });

  it("omits the missing project segment without leaving an extra separator", () => {
    render(
      <DriverStrip
        agent={{ name: "claude", pct: 100, costUSD: 5 }}
        model={{ name: "opus", pct: 100, costUSD: 5 }}
        totalCostUSD={5}
      />,
    );
    expect(screen.queryByTestId("driver-segment-project")).toBeNull();
  });

  it("clicking the agent segment dispatches addFilter to the v1 store", () => {
    render(
      <DriverStrip
        agent={{ name: "claude", pct: 72, costUSD: 36 }}
        totalCostUSD={50}
      />,
    );
    fireEvent.click(screen.getByTestId("driver-segment-agent"));
    expect(useV1Store.getState().filters).toEqual([{ kind: "agent", value: "claude" }]);
  });

  // M-A3 (R1.5): never display the bare literal "Unknown" for an agent
  // segment. ccusage's `daily[].agent === "all"` aggregate sentinel must
  // render as "All agents", not "Unknown".
  it("renders 'All agents' instead of 'Unknown' when agent name is 'all'", () => {
    render(
      <DriverStrip
        agent={{ name: "all", pct: 100, costUSD: 5 }}
        totalCostUSD={5}
      />,
    );
    const seg = screen.getByTestId("driver-segment-agent");
    expect(seg.textContent).toMatch(/All agents/);
    expect(seg.textContent).not.toMatch(/^.*Unknown.*$/);
  });

  it("renders a raw (non-token) name as-is rather than 'Unknown'", () => {
    render(
      <DriverStrip
        agent={{ name: "experimental-adapter", pct: 100, costUSD: 5 }}
        totalCostUSD={5}
      />,
    );
    const seg = screen.getByTestId("driver-segment-agent");
    expect(seg.textContent).toMatch(/experimental-adapter/);
    expect(seg.textContent).not.toMatch(/Unknown/);
  });
});
