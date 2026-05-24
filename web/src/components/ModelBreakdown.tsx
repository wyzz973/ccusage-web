import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useUsageStore } from "@/store/usage-store";
import { formatCost, formatNumber } from "@/lib/utils";

const COLORS = [
  "hsl(199 89% 48%)", "hsl(160 84% 39%)", "hsl(38 92% 50%)",
  "hsl(280 65% 60%)", "hsl(348 83% 60%)", "hsl(217 91% 60%)",
];

export function ModelBreakdown() {
  const daily = useUsageStore((s) => s.snapshot?.daily.records ?? []);

  const slices = useMemo(() => {
    const acc = new Map<string, { tokens: number; cost: number }>();
    for (const r of daily) {
      for (const mb of r.modelBreakdowns) {
        const cur = acc.get(mb.modelName) ?? { tokens: 0, cost: 0 };
        const tokens = mb.inputTokens + mb.outputTokens + mb.cacheCreationTokens + mb.cacheReadTokens;
        acc.set(mb.modelName, { tokens: cur.tokens + tokens, cost: cur.cost + mb.cost });
      }
    }
    return Array.from(acc.entries())
      .map(([name, v]) => ({ name, tokens: v.tokens, cost: v.cost }))
      .sort((a, b) => b.cost - a.cost);
  }, [daily]);

  const totalCost = slices.reduce((s, x) => s + x.cost, 0);

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base text-foreground">Models</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={slices} dataKey="cost" nameKey="name" innerRadius={42} outerRadius={78} paddingAngle={2}>
                {slices.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                formatter={(value: number) => formatCost(value)}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="space-y-2 text-sm">
          {slices.map((s, i) => (
            <li key={s.name} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 truncate">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="truncate" title={s.name}>{s.name}</span>
              </span>
              <span className="font-mono tabular-nums text-xs text-muted-foreground">
                {formatCost(s.cost)} · {formatNumber(s.tokens)}
              </span>
            </li>
          ))}
          {slices.length === 0 && <li className="text-muted-foreground text-sm">No data</li>}
          {totalCost > 0 && (
            <li className="pt-2 border-t flex items-center justify-between text-xs text-muted-foreground">
              <span>Total</span><span className="font-mono">{formatCost(totalCost)}</span>
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
