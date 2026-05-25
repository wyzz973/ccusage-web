import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatCost, formatNumber } from "@/lib/utils";
import { formatPct } from "../lib/format";
import { SEMANTIC } from "../lib/agent-colors";
import type { Block } from "@/types";

// B4-R · 5h-block status + history strip (spec §2.5).
// Caveat: % of cap depends on a cap value. ccusage does not currently
// emit a hard cap, so we compute it as the *trailing-7 max* and surface
// the ratio. Round-2 should replace once M6 lands real cap data.

function tintFor(pct: number): string {
  if (pct > 0.95) return SEMANTIC.danger;
  if (pct >= 0.7) return SEMANTIC.warn;
  return SEMANTIC.info;
}

export interface BlockHistoryStripProps {
  blocks: Block[];
}

export function BlockHistoryStrip({ blocks }: BlockHistoryStripProps): JSX.Element {
  const usable = blocks.filter((b) => !b.isGap);
  const active = usable.find((b) => b.isActive) ?? null;
  const recent = usable.filter((b) => !b.isActive).slice(-7);

  // Cap surrogate: max of trailing-7 + active. Min 1 to avoid /0.
  const trailing = [active, ...recent].filter((b): b is Block => b != null);
  const cap = Math.max(1, ...trailing.map((b) => b.costUSD));
  const activePct = active ? Math.min(1.5, active.costUSD / cap) : 0;

  return (
    <Card data-testid="block-history-strip">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base text-foreground">5-hour block</CardTitle>
        <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
          {active ? `${recent.length + 1} of ${trailing.length} on record` : `${recent.length} on record`}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {active ? (
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-mono font-semibold tabular-nums">{formatPct(activePct)}</span>
              <span className="text-xs text-muted-foreground">of trailing-7 max</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded bg-zinc-800">
              <div
                className="h-full transition-all"
                style={{ width: `${Math.min(100, activePct * 100)}%`, background: tintFor(activePct) }}
                aria-hidden="true"
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
              <span className="font-mono tabular-nums">{formatCost(active.costUSD)}</span>
              <span className="font-mono tabular-nums">{formatNumber(active.totalTokens)} tok</span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No active block</div>
        )}

        {recent.length > 0 && (
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Last {recent.length} blocks · % of cap</span>
            </div>
            <div className="flex items-end gap-1 h-12" role="img" aria-label="History of recent billing blocks">
              {recent.map((b) => {
                const pct = Math.min(1.5, b.costUSD / cap);
                return (
                  <div
                    key={b.id}
                    className="flex-1 rounded-sm transition-all"
                    style={{
                      height: `${Math.min(100, pct * 100)}%`,
                      background: tintFor(pct),
                      minHeight: 4,
                    }}
                    title={`${new Date(b.startTime).toLocaleString()} — ${formatPct(pct)} of cap`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {active && (
          <div className={cn("flex items-center gap-2 rounded-md border px-2 py-1 text-xs",
            activePct > 0.95
              ? "border-rose-400/40 bg-rose-400/5 text-rose-300"
              : activePct >= 0.7
              ? "border-amber-400/40 bg-amber-400/5 text-amber-300"
              : "border-zinc-700 bg-zinc-900/40 text-muted-foreground",
          )}>
            {activePct > 0.95 ? "▲ Cap nearly exhausted" : activePct >= 0.7 ? "⚠ Approaching cap" : "✓ Comfortable headroom"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
