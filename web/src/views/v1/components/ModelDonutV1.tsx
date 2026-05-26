import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCost } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { formatPct } from "../lib/format";
import { AGENT_COLORS, AGENT_LABEL, toAgentKey } from "../lib/agent-colors";
import { useV1Store } from "../data/v1-store";
import type { UsageRecord } from "@/types";

// B4-L · Model-mix donut. Click slice → addFilter (parent wires).
//
// R3.8 — scope toggle: "window" sums `inRangeDaily` (B0 range picker);
// "all" sums `allDaily` (lifetime). Caller passes both so the donut can
// switch without re-fetching. Default = window (matches B0 semantics).
export interface ModelDonutV1Props {
  records: UsageRecord[];
  onPickModel?: (modelName: string) => void;
  /** R3.8 — lifetime records for the "All-time" scope. Optional; toggle hidden if absent. */
  allRecords?: UsageRecord[];
}

interface Slice {
  name: string;
  agent: ReturnType<typeof toAgentKey>;
  cost: number;
}

export function ModelDonutV1({ records, onPickModel, allRecords }: ModelDonutV1Props): JSX.Element {
  const scope = useV1Store((s) => s.donutScope);
  const setScope = useV1Store((s) => s.setDonutScope);
  // R3.8 — pick the active record set based on scope. If `allRecords`
  // isn't supplied (legacy caller), the toggle is hidden and we behave
  // like the pre-R3.8 donut (whatever `records` is).
  const haveLifetime = Array.isArray(allRecords);
  const effectiveScope = haveLifetime ? scope : "window";
  const activeRecords = effectiveScope === "all" && allRecords ? allRecords : records;

  const slices = useMemo<Slice[]>(() => {
    const acc = new Map<string, Slice>();
    for (const r of activeRecords) {
      for (const mb of r.modelBreakdowns ?? []) {
        if (mb.cost <= 0) continue;
        const cur = acc.get(mb.modelName) ?? { name: mb.modelName, agent: toAgentKey(r.agent), cost: 0 };
        cur.cost += mb.cost;
        acc.set(mb.modelName, cur);
      }
    }
    return Array.from(acc.values()).sort((a, b) => b.cost - a.cost);
  }, [activeRecords]);

  const total = slices.reduce((s, x) => s + x.cost, 0);

  return (
    <Card data-testid="model-donut-v1">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base text-foreground">Model mix</CardTitle>
        {haveLifetime ? (
          <div
            role="radiogroup"
            aria-label="Model donut scope"
            data-testid="donut-scope-toggle"
            className="inline-flex rounded-md border border-border p-0.5 text-[11px]"
          >
            {(["window", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={effectiveScope === s}
                onClick={() => setScope(s)}
                data-testid={`donut-scope-${s}`}
                className={cn(
                  "rounded px-2 py-0.5",
                  effectiveScope === s ? "bg-zinc-800 text-zinc-50" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s === "window" ? "Window" : "All-time"}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground">All daily records</span>
        )}
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        <div className="relative h-48">
          {slices.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No models</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="cost"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="92%"
                    paddingAngle={2}
                    stroke="hsl(var(--background))"
                    strokeWidth={2}
                    onClick={(e) => {
                      const s = e as { name?: string };
                      if (s?.name) onPickModel?.(s.name);
                    }}
                  >
                    {slices.map((s) => (
                      <Cell key={s.name} fill={AGENT_COLORS[s.agent]} cursor="pointer" />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</span>
                <span className="font-mono tabular-nums text-xl font-semibold">{formatCost(total)}</span>
              </div>
            </>
          )}
        </div>
        <ul className="space-y-1.5 text-sm" aria-label="Model breakdown legend">
          {slices.map((s) => (
            <li key={s.name} className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onPickModel?.(s.name)}
                className="inline-flex items-center gap-2 truncate text-left hover:text-foreground"
                aria-label={`Filter to ${s.name}`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: AGENT_COLORS[s.agent] }} aria-hidden="true" />
                <span className="truncate text-xs" title={s.name}>
                  {s.name} <span className="text-muted-foreground">· {AGENT_LABEL[s.agent]}</span>
                </span>
              </button>
              <span className="shrink-0 font-mono tabular-nums text-[11px] text-muted-foreground">
                {formatCost(s.cost)} · {formatPct(total > 0 ? s.cost / total : 0)}
              </span>
            </li>
          ))}
          {slices.length === 0 && <li className="text-sm text-muted-foreground">No data</li>}
        </ul>
      </CardContent>
    </Card>
  );
}
