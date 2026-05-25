// H1 — Block detail dialog. spec-v2 §3.6.2.
// Radix Dialog (focus trap + Esc + ARIA + overlay-click).
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { formatCost, formatNumber } from "@/lib/utils";
import { useV1Store } from "../data/v1-store";
import type { Block } from "@/types";

export interface BlockDetailDialogV1Props {
  blocks: Block[];
}

export function BlockDetailDialogV1({ blocks }: BlockDetailDialogV1Props): JSX.Element {
  const id = useV1Store((s) => s.blockDetailId);
  const setId = useV1Store((s) => s.setBlockDetailId);
  const block = id ? blocks.find((b) => b.id === id) ?? null : null;

  return (
    <Dialog open={!!block} onOpenChange={(o) => { if (!o) setId(null); }}>
      <DialogContent className="max-w-lg" data-testid="block-detail-dialog">
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle>5-hour block</DialogTitle>
          {block && (
            <div className="text-[11px] text-muted-foreground mt-1 font-mono tabular-nums">
              {new Date(block.startTime).toUTCString().slice(0, 22)} → {new Date(block.endTime).toUTCString().slice(17, 22)}
            </div>
          )}
        </div>
        {block && (
          <div className="p-5 space-y-3 text-sm" data-testid="block-detail-body">
            <Row label="Cost" value={formatCost(block.costUSD)} />
            <Row label="Total tokens" value={formatNumber(block.totalTokens)} />
            <Row label="Input" value={formatNumber(block.tokenCounts.inputTokens)} />
            <Row label="Output" value={formatNumber(block.tokenCounts.outputTokens)} />
            <Row label="Cache (create)" value={formatNumber(block.tokenCounts.cacheCreationInputTokens)} />
            <Row label="Cache (read)" value={formatNumber(block.tokenCounts.cacheReadInputTokens)} />
            <Row label="Entries" value={String(block.entries)} />
            <Row label="Models" value={block.models.length > 0 ? block.models.join(", ") : "—"} />
            {block.burnRate && (
              <Row label="Burn" value={`${formatCost(block.burnRate.costPerHour)}/h · ${formatNumber(block.burnRate.tokensPerMinute)} tok/min`} />
            )}
            {block.projection && (
              <Row label="Projected end" value={`${formatCost(block.projection.totalCost)} · ${formatNumber(block.projection.totalTokens)} tok (${block.projection.remainingMinutes}min left)`} />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums text-zinc-100">{value}</span>
    </div>
  );
}
