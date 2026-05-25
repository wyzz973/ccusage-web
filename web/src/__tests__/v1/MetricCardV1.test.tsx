import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricCardV1 } from "@/views/v1/components/MetricCardV1";

describe("MetricCardV1", () => {
  it("renders title, formatted cost value, delta chip and sparkline", () => {
    render(
      <MetricCardV1
        title="Today"
        value={12.4}
        format="cost"
        deltaPct={0.23}
        vsLabel="vs yesterday"
        spark={[1, 2, 3, 4, 5]}
      />,
    );
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByTestId("metric-value").textContent).toMatch(/\$12\.40/);
    expect(screen.getByTestId("delta-chip").textContent).toMatch(/▲ 23%/);
    expect(screen.getByTestId("sparkline")).toBeInTheDocument();
  });

  it("renders 'no prior data' for null delta", () => {
    render(
      <MetricCardV1
        title="x"
        value={0}
        format="count"
        deltaPct={null}
        vsLabel="—"
        spark={[]}
      />,
    );
    expect(screen.getByTestId("delta-chip").textContent).toMatch(/no prior data/);
  });

  it("respects inverted valence (activity card) — ▲ shows good tone", () => {
    render(
      <MetricCardV1
        title="All-time"
        value={4213}
        format="count"
        deltaPct={0.08}
        inverted
        vsLabel="vs 30d avg"
        spark={[1, 2, 3]}
      />,
    );
    const chip = screen.getByTestId("delta-chip");
    expect(chip.className).toMatch(/text-emerald-300/);
  });

  it("uses cost format for value", () => {
    render(<MetricCardV1 title="x" value={1234.56} format="cost" deltaPct={0} vsLabel="" spark={[]} />);
    expect(screen.getByTestId("metric-value").textContent).toMatch(/\$1,234\.56/);
  });
});
