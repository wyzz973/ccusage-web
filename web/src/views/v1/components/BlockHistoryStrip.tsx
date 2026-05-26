import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatCost, formatNumber } from "@/lib/utils";
import { formatPct } from "../lib/format";
import { AGENT_COLORS, AGENT_LABEL, SEMANTIC, toAgentKey } from "../lib/agent-colors";
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

// R3.3 — `--order` toggle persistence key for the trailing-7 strip.
// Default `desc` = newest-on-right (the existing layout). User toggle
// flips to `asc` = newest-on-left for reverse-chronological inspection.
const LS_BLOCKS_DESC = "ccusage.order.blocks.desc";

function readInitialBlocksDesc(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(LS_BLOCKS_DESC);
    return v === "false" ? false : true;
  } catch { return true; }
}

export function BlockHistoryStrip({ blocks, limitReset, x1BannerActive = false }: BlockHistoryStripProps): JSX.Element {
  const perBlockTokenLimit = useV1Store((s) => s.mode.perBlockTokenLimit);
  // R4.5 B15 — scope toggle. `recent` (default) shows the existing
  // active-block card + trailing-N strip. `all` swaps to a virtualized
  // list of every non-active block per spec-v3.1 §3.5.
  const blocksScope = useV1Store((s) => s.blocksScope);
  const setBlocksScope = useV1Store((s) => s.setBlocksScope);
  const allListShown = blocksScope === "all";
  const usable = blocks.filter((b) => !b.isGap);
  const active = usable.find((b) => b.isActive) ?? null;
  // R3.3 — desc default (newest-on-right). When user toggles to asc, we
  // reverse the trailing-7 in place so the leftmost cell is newest.
  const [blocksDesc, setBlocksDesc] = useState<boolean>(() => readInitialBlocksDesc());
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(LS_BLOCKS_DESC, String(blocksDesc)); } catch { /* */ }
  }, [blocksDesc]);
  const recent = useMemo(() => {
    const base = usable.filter((b) => !b.isActive).slice(-7);
    return blocksDesc ? base : base.slice().reverse();
  }, [usable, blocksDesc]);

  // Cap surrogate: max of trailing-7 + active. Min 1 to avoid /0.
  const trailing = [active, ...recent].filter((b): b is Block => b != null);
  const cap = Math.max(1, ...trailing.map((b) => b.costUSD));
  const activePct = active ? Math.min(1.5, active.costUSD / cap) : 0;

  // R4.5 B15 — full list (non-active blocks, virtualized via overflow:auto).
  const allBlocks = useMemo(() => usable.filter((b) => !b.isActive), [usable]);

  return (
    <Card data-testid="block-history-strip">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base text-foreground">5-hour block</CardTitle>
        <div className="flex items-center gap-2">
          {!allListShown && (
            <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
              {active ? `${recent.length + 1} of ${trailing.length} on record` : `${recent.length} on record`}
            </span>
          )}
          {/* R4.5 B15 — Recent/All segmented toggle (spec-v3.1 §3.5).
              Same radio-group pattern as R3.8 donut scope (no Tabs primitive
              dependency; zero bundle add). */}
          <div
            role="radiogroup"
            aria-label="Blocks scope"
            className="inline-flex rounded-md border border-border p-0.5 text-[10px]"
          >
            {(["recent", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={blocksScope === s}
                onClick={() => setBlocksScope(s)}
                data-testid={`blocks-tab-${s}`}
                className={cn(
                  "rounded px-2 py-0.5",
                  blocksScope === s ? "bg-zinc-800 text-zinc-50" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s === "recent" ? "Recent" : "All"}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* R4.5 B15 — All view (virtualized via overflow:auto so the
            DOM stays bounded). Active-block card + trailing strip are
            hidden in this scope because the user is surveying history. */}
        {allListShown && (
          <div data-testid="blocks-all-list" className="space-y-0.5 max-h-[420px] overflow-auto pr-1">
            <div className="flex items-center justify-between border-b border-border/40 pb-1.5 mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>{allBlocks.length} past blocks</span>
              <span>cost · % of cap</span>
            </div>
            {allBlocks.map((b) => {
              const t = new Date(b.startTime);
              const date = t.toISOString().slice(0, 10);
              const time = t.toUTCString().slice(17, 22);
              const ak = toAgentKey(b.models[0] ?? "unknown");
              const pct = Math.min(1.5, b.costUSD / cap);
              const topModel = b.models[0] ?? "—";
              return (
                <div
                  key={b.id}
                  className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-muted/30 text-[11px]"
                  title={`${date} ${time} — ${topModel}`}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ background: AGENT_COLORS[ak] }}
                    aria-label={AGENT_LABEL[ak]}
                  />
                  <span className="w-16 font-mono tabular-nums text-zinc-200">{date}</span>
                  <span className="w-12 font-mono tabular-nums text-muted-foreground">{time}</span>
                  <span className="flex-1 truncate text-muted-foreground">{topModel}</span>
                  <span className="w-14 text-right font-mono tabular-nums text-zinc-100">{formatCost(b.costUSD)}</span>
                  <span
                    className="w-12 text-right font-mono tabular-nums"
                    style={{ color: tintFor(pct) }}
                  >
                    {formatPct(pct)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* R3.7 single-banner invariant: when X1 is up, D9 has already
            been folded into the X1 body — don't render it again here.
            R4.5 B15: also hidden in the `all` scope per spec-v3.1 §3.5. */}
        {!allListShown && !x1BannerActive && <LimitResetBannerV1 limitReset={limitReset} />}
        {!allListShown && (active ? (
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
        ))}

        {!allListShown && recent.length > 0 && (
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Last {recent.length} blocks · % of cap</span>
              {/* R3.3 — order toggle. Default desc (newest right). */}
              <button
                type="button"
                onClick={() => setBlocksDesc((d) => !d)}
                className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 hover:bg-muted/40 hover:text-foreground"
                aria-label={blocksDesc ? "Sort blocks ascending (newest left)" : "Sort blocks descending (newest right)"}
                data-testid="blocks-order-toggle"
              >
                {blocksDesc ? <ChevronDown className="h-3 w-3" aria-hidden="true" /> : <ChevronUp className="h-3 w-3" aria-hidden="true" />}
                <span>{blocksDesc ? "desc" : "asc"}</span>
              </button>
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

        {!allListShown && active && (
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
