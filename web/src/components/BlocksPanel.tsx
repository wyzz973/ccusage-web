import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useUsageStore } from "@/store/usage-store";
import { formatCost, formatNumber } from "@/lib/utils";

function pct(start: string, end: string, now: Date): number {
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  return Math.max(0, Math.min(100, ((now.getTime() - s) / (e - s)) * 100));
}

export function BlocksPanel() {
  const blocks = useUsageStore((s) => s.snapshot?.blocks.records ?? []);
  const active = useUsageStore((s) => s.snapshot?.derived.activeBlock ?? null);
  const recent = blocks.filter((b) => !b.isGap).slice(-8).reverse();
  const now = new Date();

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base text-foreground">Billing block (5h)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {active ? (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Started {new Date(active.startTime).toLocaleTimeString()}</span>
              <span>Ends {new Date(active.endTime).toLocaleTimeString()}</span>
            </div>
            <div className="h-2 w-full rounded bg-muted overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-all"
                style={{ width: `${pct(active.startTime, active.endTime, now)}%` }}
              />
            </div>
            <div className="flex justify-between text-sm pt-1">
              <span className="font-mono tabular-nums">{formatCost(active.costUSD)}</span>
              <span className="font-mono tabular-nums text-muted-foreground">{formatNumber(active.totalTokens)} tok</span>
            </div>
            {active.burnRate && (
              <div className="text-xs text-muted-foreground">
                Burn rate: {formatNumber(active.burnRate.tokensPerMinute)} tok/min · {formatCost(active.burnRate.costPerHour)}/h
              </div>
            )}
            {active.projection && (
              <div className="text-xs text-muted-foreground">
                Projected end: {formatCost(active.projection.totalCost)} · {formatNumber(active.projection.totalTokens)} tok ({active.projection.remainingMinutes}min left)
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No active block</div>
        )}

        <div className="pt-2 border-t">
          <div className="text-xs text-muted-foreground mb-2">Recent blocks</div>
          <ul className="space-y-1.5 text-xs">
            {recent.map((b) => (
              <li key={b.id} className="flex justify-between font-mono tabular-nums">
                <span className="text-muted-foreground">{new Date(b.startTime).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
                <span>{formatCost(b.costUSD)} · {formatNumber(b.totalTokens)}</span>
              </li>
            ))}
            {recent.length === 0 && <li className="text-muted-foreground">No history</li>}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
