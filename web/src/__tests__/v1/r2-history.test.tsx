import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HistoryV1 } from "@/views/v1/pages/HistoryV1";
import { __resetV1StoreForTests, useV1Store } from "@/views/v1/data/v1-store";
import type { Block } from "@/types";

beforeEach(() => __resetV1StoreForTests());

function block(id: string, startTime: string, partial: Partial<Block> = {}): Block {
  return {
    id,
    startTime,
    endTime: new Date(Date.parse(startTime) + 5 * 3600 * 1000).toISOString(),
    actualEndTime: null,
    isActive: false, isGap: false,
    costUSD: 1.23, totalTokens: 5000, entries: 10,
    models: ["claude-opus-4-7"],
    burnRate: null, projection: null,
    tokenCounts: { inputTokens: 1000, outputTokens: 500, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
    ...partial,
  };
}

describe("HistoryV1 (H1 R2-binding)", () => {
  it("renders empty state when no blocks", () => {
    render(<HistoryV1 blocks={[]} />);
    expect(screen.getByTestId("history-empty")).toBeInTheDocument();
  });

  it("renders chronological groups, rows, and the R3 footer note", () => {
    const blocks: Block[] = [
      block("b1", "2026-05-20T10:00:00Z"),
      block("b2", "2026-05-20T15:00:00Z"),
      block("b3", "2026-05-21T10:00:00Z"),
    ];
    render(<HistoryV1 blocks={blocks} />);
    expect(screen.getByTestId("history-block-list")).toBeInTheDocument();
    expect(screen.getAllByTestId("history-block-row")).toHaveLength(3);
    expect(screen.getByTestId("history-r3-note").textContent).toMatch(/Calendar heatmap.*coming in R3/i);
  });

  it("clicking a row sets blockDetailId in the store (opens the dialog)", () => {
    const blocks: Block[] = [block("bX", "2026-05-20T10:00:00Z")];
    render(<HistoryV1 blocks={blocks} />);
    fireEvent.click(screen.getByTestId("history-block-row"));
    expect(useV1Store.getState().blockDetailId).toBe("bX");
  });

  it("skips gap blocks", () => {
    const blocks: Block[] = [
      block("b1", "2026-05-20T10:00:00Z"),
      block("gap", "2026-05-20T15:00:00Z", { isGap: true }),
    ];
    render(<HistoryV1 blocks={blocks} />);
    expect(screen.getAllByTestId("history-block-row")).toHaveLength(1);
  });
});
