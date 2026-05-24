import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MetricCard } from "@/components/MetricCard";

describe("MetricCard", () => {
  it("renders initial value formatted", () => {
    render(<MetricCard title="Today" value={1234} format="number" />);
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByTestId("metric-value").textContent).toMatch(/1,234/);
  });

  it("renders cost format with $", () => {
    render(<MetricCard title="Cost" value={12.5} format="cost" />);
    expect(screen.getByTestId("metric-value").textContent).toMatch(/\$12\.50/);
  });

  it("toggles the pulse class when value changes", async () => {
    const { rerender } = render(<MetricCard title="x" value={1} format="number" />);
    const card = screen.getByTestId("metric-card");
    expect(card.className).not.toMatch(/ring-sky/);
    await act(async () => { rerender(<MetricCard title="x" value={2} format="number" />); });
    expect(card.className).toMatch(/ring-sky/);
  });
});
