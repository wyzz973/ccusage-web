import { useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn, formatCost } from "@/lib/utils";
import { AGENT_COLORS, AGENT_LABEL, SEMANTIC, toAgentKey } from "../lib/agent-colors";
import { useV1Store, type TrendMode, formatRangeLabel } from "../data/v1-store";
import { selectTrendSeries, selectDailyInRange } from "../data/selectors";
import { fetchHourly, fetchPerAgent, type HourlyBucket, type PerAgentResponse } from "@/lib/api";
import type { UsageRecord } from "@/types";

const MODE_OPTIONS: { value: TrendMode; label: string }[] = [
  { value: "aggregate", label: "Aggregate" },
  { value: "stacked", label: "Stacked" },
  { value: "100", label: "100%" },
  { value: "lines", label: "Lines" },
];

function daysBetween(from: string, to: string): number {
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 30;
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

function isoDayShift(date: string, days: number): string {
  const ms = Date.parse(date + "T00:00:00Z");
  if (!Number.isFinite(ms)) return date;
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
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
  /** R3.6 — override the per-agent fetcher in tests (avoid hitting /api/per-agent). */
  perAgentFetcher?: (date: string, tz: string) => Promise<PerAgentResponse>;
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
  records, onPickAgent, onPickDate, todayKey, tz, hourlyFetcher, perAgentFetcher,
}: TrendChartV1Props): JSX.Element {
  // R2 D2: range picker (in B0) is the single source of truth — the old
  // Today/7/30/60/90 tabs are gone per spec-v2 §3.3.6.
  const range = useV1Store((s) => s.range);
  const mode = useV1Store((s) => s.trendMode);
  const setMode = useV1Store((s) => s.setTrendMode);
  const compareOn = useV1Store((s) => s.compareOn);
  // R3.6 — per-agent state machine. View toggle drives the fan-out fire.
  const view = useV1Store((s) => s.view);
  const perAgent = useV1Store((s) => s.perAgent);
  const setPerAgent = useV1Store((s) => s.setPerAgent);
  const setPerAgentLoading = useV1Store((s) => s.setPerAgentLoading);

  const resolvedTz = tz ?? (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC");
  const resolvedToday = todayKey ?? browserTodayKey(resolvedTz);
  const nowHour = browserHour(resolvedTz);

  const isToday = range.preset === "today";
  const windowDays_ = daysBetween(range.from, range.to);
  const inRange = useMemo(() => selectDailyInRange(records, range), [records, range]);
  const { data, agents } = useMemo(() => selectTrendSeries(inRange, windowDays_), [inRange, windowDays_]);

  // R2 D2: Compare overlay — same-length window immediately prior.
  const compareData = useMemo(() => {
    if (!compareOn || isToday) return null;
    const priorTo = isoDayShift(range.from, -1);
    const priorFrom = isoDayShift(priorTo, -(windowDays_ - 1));
    const slice = selectDailyInRange(records, { from: priorFrom, to: priorTo });
    const { data: prior } = selectTrendSeries(slice, windowDays_);
    // Map prior into the current row indices so the recharts series aligns by index.
    return prior;
  }, [compareOn, isToday, range.from, records, windowDays_]);

  const mergedData = useMemo(() => {
    if (!compareData) return data;
    return data.map((row, i) => ({ ...row, prev: compareData[i]?.total ?? null }));
  }, [data, compareData]);

  // M-A2 (R1.5): when range = Today, fetch the 24-bucket hourly series.
  const [hourly, setHourly] = useState<HourlyBucket[] | null>(null);
  const [hourlyError, setHourlyError] = useState<string | null>(null);
  useEffect(() => {
    if (!isToday) return;
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
  }, [isToday, resolvedToday, resolvedTz, hourlyFetcher]);

  // R3.6 — per-agent fan-out. Fires once when view flips to "by-agent";
  // re-fires if the today key changes (midnight rollover) or the TZ moves.
  //
  // CRITICAL: `setPerAgentLoading()` runs SYNCHRONOUSLY before the await
  // so the 100ms skeleton gate (spec-v3 §1.4) renders BEFORE the server
  // round-trip. The fetcher is awaited after; do not move the loading
  // setter into the .then() — that re-introduces the silent-fail shape.
  useEffect(() => {
    if (view !== "by-agent") return;
    let cancelled = false;
    const fetcher = perAgentFetcher ?? fetchPerAgent;
    setPerAgentLoading();
    fetcher(resolvedToday, resolvedTz)
      .then((r) => {
        if (cancelled) return;
        setPerAgent({
          status: r.status,
          succeeded: r.succeeded,
          failed: r.failed.map((f) => ({ agent: f.agent, err: String((f.err as { message?: string }).message ?? f.err) })),
          timedOut: r.timedOut,
          elapsedMs: r.elapsedMs,
          budgetMs: r.budgetMs,
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setPerAgent({
          status: "timeout",
          succeeded: [], failed: [],
          timedOut: [],
          elapsedMs: 0, budgetMs: 800,
        });
        // Swallow — the state machine already reflects the failure.
        void e;
      });
    return () => { cancelled = true; };
  }, [view, resolvedToday, resolvedTz, perAgentFetcher, setPerAgent, setPerAgentLoading]);

  return (
    <Card data-testid="trend-chart-v1">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base text-foreground">
          {isToday ? "Today · hourly" : `Cost trend · ${formatRangeLabel(range)}`}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-3">
          {/* R2 D2 (spec-v2 §3.3.6): per-chart window tabs removed —
              B0 Range picker is the single source of truth. */}
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
        {isToday ? (
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
              data={mergedData}
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
              {/* R2 D2 (spec-v2 §3.3.3) — dashed ghost line for the
                  same-length prior window. Suppressed in 100%-stack mode
                  (the y-axis is a ratio and a $-line on it would mislead). */}
              {compareOn && mode !== "100" && (
                <Area
                  type="monotone"
                  dataKey="prev"
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 3"
                  fill="transparent"
                  strokeWidth={1.5}
                  isAnimationActive={false}
                  data-testid="trend-compare-ghost"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>

      {agents.length > 0 && (
        <div className="px-4 pb-3 -mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
          {agents.map((a) => {
            // R3.6 §3.2.3 — per-agent failure decoration: line-through + tooltip
            // when the agent landed in `failed[]` or `timedOut[]` from the
            // last fan-out. Distinct visual from the success state so the
            // user can see which agents we couldn't render.
            const failedEntry = perAgent.failed.find((f) => toAgentKey(f.agent) === a);
            const timedOutEntry = perAgent.timedOut.find((t) => toAgentKey(t.agent) === a);
            const decorated = view === "by-agent" && (failedEntry != null || timedOutEntry != null);
            const tip = failedEntry
              ? `Per-agent fetch failed: ${failedEntry.err}`
              : timedOutEntry
              ? `Per-agent fetch timed out after ${perAgent.budgetMs}ms`
              : undefined;
            return (
              <button
                key={a}
                type="button"
                onClick={() => onPickAgent?.(a)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-1 hover:text-foreground",
                  decorated && "line-through opacity-60",
                )}
                aria-label={`Filter to ${AGENT_LABEL[a]}`}
                title={tip}
                data-testid={`trend-legend-${a}`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: AGENT_COLORS[a] }} aria-hidden="true" />
                <span>{AGENT_LABEL[a]}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* R3.6 §3.2 state-machine footer. Visible only in "by-agent" view;
          surfaces partial-success + all-timeout outcomes so the user is
          never silently looking at a degraded chart. */}
      {view === "by-agent" && perAgent.status !== "idle" && perAgent.status !== "ok" && (
        <div
          data-testid="per-agent-status"
          className={cn(
            "mx-4 mb-3 -mt-1 rounded-md border px-3 py-1.5 text-[11px]",
            perAgent.status === "loading" && "border-border bg-muted/30 text-muted-foreground",
            perAgent.status === "partial" && "border-amber-400/40 bg-amber-400/5 text-amber-200",
            perAgent.status === "timeout" && "border-rose-400/40 bg-rose-400/5 text-rose-200",
          )}
          role="status"
          aria-live="polite"
        >
          {perAgent.status === "loading" && "Fetching per-agent breakdown…"}
          {perAgent.status === "partial" && (
            <>
              Showing {perAgent.succeeded.length} of {perAgent.succeeded.length + perAgent.failed.length + perAgent.timedOut.length} agents
              {perAgent.timedOut.length > 0 && ` · ${perAgent.timedOut.length} timed out at ${perAgent.budgetMs}ms`}
              {perAgent.failed.length > 0 && ` · ${perAgent.failed.length} failed`}
            </>
          )}
          {perAgent.status === "timeout" && (
            <>Per-agent breakdown unavailable (all {perAgent.timedOut.length + perAgent.failed.length} agents missed the {perAgent.budgetMs}ms budget). Showing aggregate.</>
          )}
        </div>
      )}
    </Card>
  );
}
