import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatCost, formatNumber } from "@/lib/utils";
import { formatPct } from "../lib/format";
import { SEMANTIC } from "../lib/agent-colors";
import { LimitResetBannerV1 } from "./LimitResetBannerV1";
import { useV1Store } from "../data/v1-store";
import type { Block, Derived } from "@/types";

// B4-R · 5h-block status + history strip (spec §2.5).
// Caveat: % of cap depends on a cap value. ccusage does not currently
// emit a hard cap, so we compute it as the *trailing-7 max* and surface
// the ratio. Round-2 should replace once M6 lands real cap data.
//
// R3.7 — adds the per-block token-limit chip (amber) when the active
// block's projection exceeds `mode.perBlockTokenLimit`. When the X1
// budget banner is also firing, the chip drops its background fill to
// avoid visual collision (spec-v3 §3.3.3 single-banner invariant); the
// D9 LimitResetBanner is also suppressed in that case (its content has
// already been folded into the X1 banner body as an addendum).

function tintFor(pct: number): string {
  if (pct > 0.95) return SEMANTIC.danger;
  if (pct >= 0.7) return SEMANTIC.warn;
  return SEMANTIC.info;
}

export interface BlockHistoryStripProps {
  blocks: Block[];
  /** R2 D9 — limit-reset banner state, mounted scoped to this card per spec-v2 §3 placement. */
  limitReset?: Derived["limitReset"];
  /** R3.7 — when true, the strip suppresses its D9 banner + drops the X1-chip fill. */
  x1BannerActive?: boolean;
}

export function BlockHistoryStrip({ blocks, limitReset, x1BannerActive = false }: BlockHistoryStripProps): JSX.Element {
  const perBlockTokenLimit = useV1Store((s) => s.mode.perBlockTokenLimit);
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
        {/* R3.7 single-banner invariant: when X1 is up, D9 has already
            been folded into the X1 body — don't render it again here. */}
        {!x1BannerActive && <LimitResetBannerV1 limitReset={limitReset} />}
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
            {/* R3.7 per-block token-limit chip. Source-pair invariant
                (spec-v3 §1.1): projection.totalTokens vs perBlockTokenLimit
                — same source (tokens), no ratio mixing. Drop background
                fill when X1 is firing to avoid visual collision. */}
            {(() => {
              const projTokens = active.projection?.totalTokens ?? 0;
              const limit = perBlockTokenLimit;
              if (!limit || limit <= 0) return null;
              if (projTokens <= limit) return null;
              const overPct = Math.round(((projTokens - limit) / limit) * 100);
              return (
                <div
                  data-testid="block-token-limit-chip"
                  className={cn(
                    "mt-1 inline-flex items-center gap-1 rounded text-xs text-amber-200 px-2 py-1",
                    x1BannerActive ? "" : "bg-amber-400/10",
                  )}
                >
                  <AlertTriangle className="h-3 w-3 text-amber-300" aria-hidden="true" />
                  <span>
                    projected <span className="font-mono tabular-nums">{formatNumber(projTokens / 1_000_000)}M</span> tokens · {overPct}% over limit
                  </span>
                </div>
              );
            })()}
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
