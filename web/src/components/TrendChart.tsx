import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUsageStore } from "@/store/usage-store";
import { formatCost, formatNumber } from "@/lib/utils";

type Window = "30" | "60" | "90";

export function TrendChart() {
  const records = useUsageStore((s) => s.snapshot?.daily.records ?? []);
  const [win, setWin] = useState<Window>("30");

  const data = useMemo(() => {
    const sorted = [...records].sort((a, b) => a.period.localeCompare(b.period));
    return sorted.slice(-Number(win)).map((r) => ({
      period: r.period,
      tokens: r.totalTokens,
      cost: Number(r.totalCost.toFixed(2)),
    }));
  }, [records, win]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base text-foreground">Daily trend</CardTitle>
        <Tabs value={win} onValueChange={(v) => setWin(v as Window)}>
          <TabsList>
            <TabsTrigger value="30">30d</TabsTrigger>
            <TabsTrigger value="60">60d</TabsTrigger>
            <TabsTrigger value="90">90d</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="tokGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(199 89% 48%)" stopOpacity={0.6} />
                <stop offset="100%" stopColor="hsl(199 89% 48%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="period" tickFormatter={(v) => v.slice(5)} stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <YAxis tickFormatter={(v) => formatNumber(v)} stroke="hsl(var(--muted-foreground))" fontSize={11} width={68} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
              formatter={(value: number, name) => name === "cost" ? formatCost(value) : formatNumber(value)}
            />
            <Area type="monotone" dataKey="tokens" stroke="hsl(199 89% 48%)" fill="url(#tokGrad)" animationDuration={400} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
