// D5 — Cache-savings panel.
//
// spec-v2 §3.4 — dual KPI + sparkline. Header flips amber when wk-over-wk
// cache-hit % drops ≥25 % AND prior ≥5 % (server filters the <5% case
// pre-emptively; see insights/cache.ts wkOverWkDropPct contract).
//
// Share-of-total invariant (§1.1):
//   N: cacheReadTokens summed across the window
//   D: inputTokens + cacheCreationTokens + cacheReadTokens (same window)
//   D = 0 → server returns hitPct = null; UI renders "—".

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn, formatCost } from "@/lib/utils";
import { Sparkline } from "./Sparkline";
import { formatPct } from "../lib/format";
import { SEMANTIC } from "../lib/agent-colors";
import type { Derived } from "@/types";

type CacheInsight = NonNullable<Derived["cache"]>;

export interface CacheSavingsPanelV1Props {
  cache: CacheInsight | null | undefined;
}

export function CacheSavingsPanelV1({ cache }: CacheSavingsPanelV1Props): JSX.Element {
  const empty = !cache || cache.hitPct == null || !Number.isFinite(cache.hitPct);
  const drop = cache?.wkOverWkDropPct ?? null;
  const hasWarning = drop !== null && drop >= 0.25;

  return (
    <Card className="h-full" data-testid="cache-savings-v1">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        {hasWarning ? (
          <div className="text-sm font-medium text-amber-200">
            Cache savings{" "}
            <span className="font-mono tabular-nums">
              ▼ down {Math.round((drop ?? 0) * 100)}% wk/wk — refactor?
            </span>
          </div>
        ) : (
          <div className="text-sm font-medium text-muted-foreground">Cache savings</div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {empty ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No cache activity in current window.
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-around gap-6 py-2">
              <div className="text-center">
                <div
                  className="text-3xl font-semibold font-mono tabular-nums leading-none text-zinc-50"
                  data-testid="cache-hit-pct"
                >
                  {formatPct(cache.hitPct!)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">cache hits</div>
              </div>
              <div className="text-center">
                <div
                  className={cn(
                    "text-3xl font-semibold font-mono tabular-nums leading-none",
                    hasWarning ? "text-amber-200" : "text-emerald-300",
                  )}
                  data-testid="cache-saved-usd"
                >
                  {formatCost(cache.savedUSD)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">saved</div>
              </div>
            </div>
            <div>
              <Sparkline
                data={cache.sparkPctPerDay.map((v) => v * 100)}
                color={SEMANTIC.info}
                gradientId="cacheSparkV1"
              />
              <div className="text-[10px] text-muted-foreground mt-1">
                cache-hit % per day · last 14 d
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
