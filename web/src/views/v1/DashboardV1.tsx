import { useEffect, useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { LiveIndicator } from "@/components/LiveIndicator";
import { useUsageStore } from "@/store/usage-store";
import { fetchSnapshot, triggerRefresh } from "@/lib/api";
import { connectSse } from "@/lib/sse";
import { MetricCardV1 } from "./components/MetricCardV1";
import { DriverStrip } from "./components/DriverStrip";
import { ViewToggle } from "./components/ViewToggle";
import { FilterChipRow } from "./components/FilterChipRow";
import { TrendChartV1 } from "./components/TrendChartV1";
import { ModelDonutV1 } from "./components/ModelDonutV1";
import { BlockHistoryStrip } from "./components/BlockHistoryStrip";
import { SessionTableV1 } from "./components/SessionTableV1";
import { DateRangePickerV1 } from "./components/DateRangePickerV1";
import { SettingsPopoverV1 } from "./components/SettingsPopoverV1";
import { ModeBadgesV1 } from "./components/ModeBadgesV1";
import { ProjectsPanelV1 } from "./components/ProjectsPanelV1";
import { ProjectsDialogV1 } from "./components/ProjectsDialogV1";
import { CacheSavingsPanelV1 } from "./components/CacheSavingsPanelV1";
import {
  selectKpis, selectAgentBreakdown, selectDailySparkSeries,
  selectTodayDriversFallback, selectDailyInRange, selectSessionsInRange,
} from "./data/selectors";
import { useV1Store } from "./data/v1-store";
import { HistoryV1 } from "./pages/HistoryV1";
import { AGENT_COLORS, AGENT_LABEL, SEMANTIC, toAgentKey } from "./lib/agent-colors";
import "./style.css";

function localTodayKey(): string {
  const now = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export interface DashboardV1Props {
  skipLiveWiring?: boolean;
  /** Force route for tests; production reads from window.location.pathname. */
  routeOverride?: "main" | "history";
}

function resolveRoute(override?: "main" | "history"): "main" | "history" {
  if (override) return override;
  if (typeof window === "undefined") return "main";
  return window.location.pathname.startsWith("/history") ? "history" : "main";
}

export function DashboardV1({ skipLiveWiring = false, routeOverride }: DashboardV1Props): JSX.Element {
  const snap = useUsageStore((s) => s.snapshot);
  const view = useV1Store((s) => s.view);
  const filters = useV1Store((s) => s.filters);
  const addFilter = useV1Store((s) => s.addFilter);
  const range = useV1Store((s) => s.range);
  const route = resolveRoute(routeOverride);

  useEffect(() => {
    if (skipLiveWiring) return;
    fetchSnapshot().then((s) => useUsageStore.getState().setSnapshot(s)).catch(() => { /* */ });
    return connectSse({
      onSnapshot: (s) => useUsageStore.getState().setSnapshot(s),
      onUpdate:   (s) => useUsageStore.getState().setSnapshot(s),
      onError:    (msg, lastSuccessAt) => useUsageStore.getState().setError(msg, lastSuccessAt),
      onStatus:   (st) => useUsageStore.getState().setStatus(st),
    });
  }, [skipLiveWiring]);

  const kpis = selectKpis(snap);
  const todayKey = useMemo(() => localTodayKey(), []);
  const drivers = snap?.derived.todayDrivers ?? selectTodayDriversFallback(snap, todayKey);
  const deltas = snap?.derived.deltas;
  const projects = snap?.derived.projects ?? [];
  const cache = snap?.derived.cache;
  const limitReset = snap?.derived.limitReset;

  const agentBreakdown = useMemo(
    () => selectAgentBreakdown(snap?.daily.records ?? []),
    [snap],
  );
  const topAgent = agentBreakdown[0];

  const sparkData = useMemo(
    () => selectDailySparkSeries(snap?.daily.records ?? [], 14),
    [snap],
  );
  const sparkColor = view === "by-agent" && topAgent ? AGENT_COLORS[topAgent.agent] : SEMANTIC.info;

  // R2 D2 + S13: re-scope every per-window surface (donut + projects +
  // sessions) through the range picker so they move together.
  const allDaily = snap?.daily.records ?? [];
  const allSessions = snap?.session.records ?? [];
  const inRangeDaily = useMemo(() => selectDailyInRange(allDaily, range), [allDaily, range]);
  const inRangeSessions = useMemo(() => selectSessionsInRange(allSessions, range), [allSessions, range]);
  const blocks = snap?.blocks.records ?? [];

  const showByAgent = view === "by-agent" && topAgent != null;
  const valueAccent = showByAgent ? AGENT_COLORS[topAgent.agent] : undefined;
  const todayValue = showByAgent ? topAgent.cost : kpis.today.cost;
  const subtitle = showByAgent
    ? `Top agent: ${AGENT_LABEL[topAgent.agent]}`
    : "Sum of today's daily records";

  if (route === "history") {
    return (
      <div className="theme-v1 mx-auto max-w-7xl p-6 space-y-4" data-testid="dashboard-v1">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold tracking-tight">ccusage · History</h1>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <LiveIndicator />
            <a
              href={typeof window !== "undefined" ? `${window.location.pathname.replace(/\/history.*/, "/")}${window.location.search || "?mode=v1"}` : "/?mode=v1"}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-muted/40"
            >
              ← Back to dashboard
            </a>
          </div>
        </header>
        <HistoryV1 blocks={blocks} />
      </div>
    );
  }

  return (
    <div className="theme-v1 mx-auto max-w-7xl p-6 space-y-4" data-testid="dashboard-v1">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold tracking-tight">ccusage</h1>
          <ViewToggle />
        </div>
        <div className="flex items-center gap-3 text-xs">
          <LiveIndicator />
          <ModeBadgesV1 />
          <DateRangePickerV1 />
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-muted/40"
            onClick={() => triggerRefresh().catch(() => { /* */ })}
            aria-label="Refresh data"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
          <SettingsPopoverV1 />
        </div>
      </header>

      <FilterChipRow />

      {filters.length > 0 && (
        <div className="rounded-lg border border-sky-400/30 bg-sky-400/5 px-3 py-2 text-xs text-sky-200" role="status">
          Filters applied — KPI numbers shown are scoped to your selection.
        </div>
      )}

      <section
        data-kpi-grid
        className="kpi-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
        aria-label="Headline metrics"
      >
        <MetricCardV1
          testId="metric-card-today"
          title="Today"
          value={todayValue}
          format="cost"
          deltaPct={deltas?.today.pct ?? null}
          deltaAbsolute={Math.abs((deltas?.today.current ?? 0) - (deltas?.today.previous ?? 0))}
          vsLabel={deltas?.today.vsLabel ?? "vs yesterday"}
          spark={sparkData}
          sparkColor={sparkColor}
          subtitle={subtitle}
          valueAccent={valueAccent}
        />
        <MetricCardV1
          title="This week"
          value={kpis.week.cost}
          format="cost"
          deltaPct={deltas?.week.pct ?? null}
          deltaAbsolute={Math.abs((deltas?.week.current ?? 0) - (deltas?.week.previous ?? 0))}
          vsLabel={deltas?.week.vsLabel ?? "vs last week"}
          spark={sparkData}
          sparkColor={sparkColor}
          subtitle="Current ISO week"
        />
        <MetricCardV1
          title="This month"
          value={kpis.month.cost}
          format="cost"
          deltaPct={deltas?.month.pct ?? null}
          deltaAbsolute={Math.abs((deltas?.month.current ?? 0) - (deltas?.month.previous ?? 0))}
          vsLabel={deltas?.month.vsLabel ?? "vs last month"}
          spark={sparkData}
          sparkColor={sparkColor}
          subtitle="Current calendar month"
        />
        <MetricCardV1
          title="All-time"
          value={kpis.allTime.sessions}
          format="count"
          deltaPct={null}
          vsLabel="total sessions"
          spark={sparkData}
          sparkColor={SEMANTIC.good}
          subtitle="Sessions recorded"
          inverted
        />
      </section>

      <DriverStrip {...drivers} />

      <TrendChartV1
        records={allDaily}
        onPickAgent={(a) => addFilter({ kind: "agent", value: toAgentKey(a) })}
        onPickDate={(d) => addFilter({ kind: "date", value: d })}
      />

      {/* B4 2×2 per spec-v2 §3. `data-b4-grid` matches the prototype contract;
          mobile rule (max-width: 768px) collapses to 1-up in style.css. */}
      <section
        data-b4-grid
        className="b4-grid grid grid-cols-1 lg:grid-cols-2 gap-3"
        aria-label="Breakdown panels"
      >
        <ModelDonutV1
          records={inRangeDaily}
          onPickModel={(m) => addFilter({ kind: "model", value: m })}
        />
        <BlockHistoryStrip blocks={blocks} limitReset={limitReset} />
        <ProjectsPanelV1 projects={projects} />
        <CacheSavingsPanelV1 cache={cache} />
      </section>

      <SessionTableV1 records={inRangeSessions} />

      <ProjectsDialogV1 projects={projects} />

      {snap && (
        <footer className="text-[10px] text-muted-foreground text-right">
          ccusage v{snap.ccusageVersion} · snapshot {snap.generatedAt}
        </footer>
      )}
    </div>
  );
}
