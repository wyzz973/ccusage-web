import { useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatCost } from "@/lib/utils";
import { AGENT_COLORS, AGENT_LABEL, SEMANTIC } from "../lib/agent-colors";
import { useV1Store, type TrendMode, type TrendWindow } from "../data/v1-store";
import { selectTrendSeries } from "../data/selectors";
import { fetchHourly, type HourlyBucket } from "@/lib/api";
import type { UsageRecord } from "@/types";

const MODE_OPTIONS: { value: TrendMode; label: string }[] = [
  { value: "aggregate", label: "Aggregate" },
  { value: "stacked", label: "Stacked" },
  { value: "100", label: "100%" },
  { value: "lines", label: "Lines" },
];

const TODAY_WINDOWS: TrendWindow[] = ["today", "7", "30", "60", "90"];

function windowDays(w: TrendWindow): number {
  if (w === "today") return 1;
  return Number(w);
}

export interface TrendChartV1Props {
  records: UsageRecord[];
  onPickAgent?: (agent: string) => void;
  onPickDate?: (date: string) => void;
  /** Inject the today key (UTC YYYY-MM-DD) for testability; defaults to browser-local. */
  todayKey?: string;
  /** Inject the IANA TZ for testability; defaults to browser-resolved. */
  tz?: string;
  /** Override the hourly fetcher in tests so we don't hit the real endpoint. */
  hourlyFetcher?: (date: string, tz: string) => Promise<{ buckets: HourlyBucket[] }>;
}

function browserTodayKey(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function browserHour(tz: string): number {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", hour12: false,
  }).format(new Date());
  const h = Number(s.replace(/[^\d]/g, ""));
  return Number.isFinite(h) ? h : new Date().getHours();
}

export function TrendChartV1({
  records, onPickAgent, onPickDate, todayKey, tz, hourlyFetcher,
}: TrendChartV1Props): JSX.Element {
  const window = useV1Store((s) => s.trendWindow);
  const setWindow = useV1Store((s) => s.setTrendWindow);
  const mode = useV1Store((s) => s.trendMode);
  const setMode = useV1Store((s) => s.setTrendMode);

  const resolvedTz = tz ?? (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC");
  const resolvedToday = todayKey ?? browserTodayKey(resolvedTz);
  const nowHour = browserHour(resolvedTz);

  const { data, agents } = useMemo(() => selectTrendSeries(records, windowDays(window)), [records, window]);

  // M-A2 (R1.5): when the user picks the "Today" tab, fetch the 24-bucket
  // hourly series from the server route. Falls back gracefully (empty array
  // → chart shows "no data") if the fetch errors.
  const [hourly, setHourly] = useState<HourlyBucket[] | null>(null);
  const [hourlyError, setHourlyError] = useState<string | null>(null);
  useEffect(() => {
    if (window !== "today") return;
    let cancelled = false;
    const fetcher = hourlyFetcher ?? fetchHourly;
    setHourlyError(null);
    fetcher(resolvedToday, resolvedTz)
      .then((r) => { if (!cancelled) setHourly(r.buckets); })
      .catch((e: unknown) => {
        if (!cancelled) {
          setHourly(null);
          setHourlyError((e as Error).message ?? "hourly fetch failed");
        }
      });
    return () => { cancelled = true; };
  }, [window, resolvedToday, resolvedTz, hourlyFetcher]);

  return (
    <Card data-testid="trend-chart-v1">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base text-foreground">
          {window === "today" ? "Today" : `Daily trend · last ${window} days`}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={window} onValueChange={(v) => setWindow(v as TrendWindow)}>
            <TabsList>
              {TODAY_WINDOWS.map((w) => (
                <TabsTrigger key={w} value={w}>
                  {w === "today" ? "Today" : `${w}d`}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div role="radiogroup" aria-label="Trend mode" className="inline-flex rounded-md border border-border p-0.5 text-[11px]">
            {MODE_OPTIONS.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={mode === m.value}
                onClick={() => setMode(m.value)}
                className={cn(
                  "rounded px-2 py-0.5",
                  mode === m.value ? "bg-zinc-800 text-zinc-50" : "text-muted-foreground hover:text-foreground",
                )}
                data-testid={`trend-mode-${m.value}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="h-[260px]" data-testid="trend-chart-body">
        {window === "today" ? (
          hourly == null ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {hourlyError ? `Hourly unavailable (${hourlyError})` : "Loading hourly…"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={hourly}
                margin={{ top: 6, right: 12, left: 4, bottom: 0 }}
                data-testid="trend-hourly"
              >
                <defs>
                  <linearGradient id="trendV1HourlyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SEMANTIC.info} stopOpacity={0.55} />
                    <stop offset="100%" stopColor={SEMANTIC.info} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="hour"
                  tickFormatter={(h: number) => String(h).padStart(2, "0")}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  interval={1}
                />
                <YAxis
                  tickFormatter={(v: number) => `$${v}`}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  width={42}
                />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(v: number) => formatCost(v)}
                  labelFormatter={(h: number) => `${String(h).padStart(2, "0")}:00`}
                />
                <ReferenceLine
                  x={nowHour}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="3 3"
                  label={{ value: "now", position: "top", fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke={SEMANTIC.info}
                  fill="url(#trendV1HourlyGrad)"
                  strokeWidth={1.5}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )
        ) : data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No trend data yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 6, right: 12, left: 4, bottom: 0 }}
              stackOffset={mode === "100" ? "expand" : "none"}
              onClick={(state) => {
                const s = state as { activeLabel?: string } | null;
                if (s?.activeLabel && onPickDate) onPickDate(s.activeLabel);
              }}
            >
              <defs>
                {agents.map((a) => (
                  <linearGradient key={a} id={`trendV1Grad-${a}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={AGENT_COLORS[a]} stopOpacity={0.85} />
                    <stop offset="100%" stopColor={AGENT_COLORS[a]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="period"
                tickFormatter={(v: string) => v.slice(5)}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                minTickGap={20}
              />
              <YAxis
                tickFormatter={(v: number) => (mode === "100" ? `${Math.round(v * 100)}%` : `$${v}`)}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                width={48}
              />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(value: number, name) => [formatCost(value), AGENT_LABEL[name as keyof typeof AGENT_LABEL] ?? String(name)]}
              />
              {mode === "lines" ? (
                agents.map((a) => (
                  <Area
                    key={a}
                    type="monotone"
                    dataKey={a}
                    stroke={AGENT_COLORS[a]}
                    fill="transparent"
                    strokeWidth={1.5}
                    isAnimationActive={false}
                  />
                ))
              ) : mode === "aggregate" ? (
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke={SEMANTIC.info}
                  fill={SEMANTIC.info}
                  fillOpacity={0.2}
                  strokeWidth={1.5}
                  isAnimationActive={false}
                />
              ) : (
                agents.map((a) => (
                  <Area
                    key={a}
                    type="monotone"
                    dataKey={a}
                    stackId="cost"
                    stroke={AGENT_COLORS[a]}
                    fill={`url(#trendV1Grad-${a})`}
                    strokeWidth={1.5}
                    isAnimationActive={false}
                    onClick={() => onPickAgent?.(a)}
                  />
                ))
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>

      {agents.length > 0 && (
        <div className="px-4 pb-3 -mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
          {agents.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onPickAgent?.(a)}
              className="inline-flex items-center gap-1.5 rounded px-1 hover:text-foreground"
              aria-label={`Filter to ${AGENT_LABEL[a]}`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: AGENT_COLORS[a] }} aria-hidden="true" />
              <span>{AGENT_LABEL[a]}</span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
