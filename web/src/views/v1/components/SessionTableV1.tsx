import { useMemo, useRef, useState, useLayoutEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn, formatCost, formatNumber } from "@/lib/utils";
import { AGENT_COLORS, AGENT_LABEL, toAgentKey } from "../lib/agent-colors";
import { useV1Store } from "../data/v1-store";
import { applySessionFilters } from "../data/selectors";
import type { UsageRecord } from "@/types";

// B5 · Sessions table — virtualized to fix Round-1 bug #2 (323-row blow-up
// on real data). Hand-rolled windowing avoids pulling in react-window
// while still keeping the DOM bounded.

const ROW_HEIGHT = 36;
const OVERSCAN = 5;
const CONTAINER_HEIGHT = 420;

type SortKey = "period" | "agent" | "project" | "totalTokens" | "totalCost";

export interface SessionTableV1Props {
  records: UsageRecord[];
  /** Inject a row height for tests (jsdom can't lay out flex children). */
  rowHeight?: number;
  containerHeight?: number;
}

export function SessionTableV1({
  records,
  rowHeight = ROW_HEIGHT,
  containerHeight = CONTAINER_HEIGHT,
}: SessionTableV1Props): JSX.Element {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("totalCost");
  const [desc, setDesc] = useState(true);
  const filters = useV1Store((s) => s.filters);
  const addFilter = useV1Store((s) => s.addFilter);

  const rows = useMemo(() => {
    const filtered = applySessionFilters(records, filters, q);
    const get = (x: UsageRecord): string | number => {
      if (sortKey === "project") return x.project ?? "";
      const v = (x as unknown as Record<string, unknown>)[sortKey];
      if (typeof v === "number") return v;
      if (typeof v === "string") return v;
      return "";
    };
    return [...filtered].sort((a, b) => {
      const av = get(a), bv = get(b);
      if (av < bv) return desc ? 1 : -1;
      if (av > bv) return desc ? -1 : 1;
      return 0;
    });
  }, [records, filters, q, sortKey, desc]);

  // ── windowing ───────────────────────────────────────────────────────
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(containerHeight);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      if (el.clientHeight > 0) setViewportH(el.clientHeight);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const total = rows.length;
  const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const visibleCount = Math.ceil(viewportH / rowHeight) + 2 * OVERSCAN;
  const endIdx = Math.min(total, startIdx + visibleCount);
  const visible = rows.slice(startIdx, endIdx);
  const padTop = startIdx * rowHeight;
  const padBottom = Math.max(0, (total - endIdx) * rowHeight);

  function HeaderCell({ label, k, align = "left" }: { label: string; k: SortKey; align?: "left" | "right" }) {
    const active = sortKey === k;
    return (
      <th
        scope="col"
        className={cn(
          "px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground bg-card",
          align === "right" && "text-right",
        )}
      >
        <button
          type="button"
          onClick={() => { if (active) setDesc(!desc); else { setSortKey(k); setDesc(true); } }}
          className={cn("inline-flex items-center gap-1 hover:text-zinc-100", active && "text-zinc-100")}
          aria-sort={active ? (desc ? "descending" : "ascending") : "none"}
        >
          {label}
          {active && <span className="text-[9px]">{desc ? "▼" : "▲"}</span>}
        </button>
      </th>
    );
  }

  return (
    <Card data-testid="session-table-v1">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base text-foreground">
          Sessions <span className="ml-1 text-xs text-muted-foreground">({rows.length})</span>
        </CardTitle>
        <Input
          placeholder="Search sessions"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-8 w-56"
          aria-label="Search sessions"
        />
      </CardHeader>
      <CardContent className="p-0">
        <div
          ref={viewportRef}
          data-testid="session-table-viewport"
          className="overflow-auto"
          style={{ maxHeight: containerHeight }}
          onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        >
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border">
                <HeaderCell label="Session" k="period" />
                <HeaderCell label="Agent" k="agent" />
                <HeaderCell label="Project" k="project" />
                <HeaderCell label="Tokens" k="totalTokens" align="right" />
                <HeaderCell label="Cost" k="totalCost" align="right" />
              </tr>
            </thead>
            <tbody data-testid="session-table-tbody">
              {padTop > 0 && (
                <tr aria-hidden="true" style={{ height: padTop }}>
                  <td colSpan={5} />
                </tr>
              )}
              {visible.map((s) => {
                const k = toAgentKey(s.agent);
                // M2 (R2): project column shows the short displayName for
                // readability while the chip dispatch keeps the canonical
                // form for stable identity (S3 fix).
                const projCanonical = s.project ?? "";
                const projDisplay = projCanonical
                  ? projCanonical.replace(/^-/, "").split("-").filter(Boolean).pop() ?? projCanonical
                  : "—";
                return (
                  <tr
                    key={s.period}
                    style={{ height: rowHeight }}
                    className="cursor-pointer border-b border-border/40 hover:bg-zinc-900/60"
                    onClick={() => addFilter({ kind: "session", value: s.period })}
                    data-testid="session-row"
                  >
                    <td className="px-3 py-2 font-mono text-xs">{s.period.slice(0, 24)}</td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
                        style={{ borderColor: AGENT_COLORS[k], color: AGENT_COLORS[k] }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: AGENT_COLORS[k] }} aria-hidden="true" />
                        {AGENT_LABEL[k]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {projCanonical ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            addFilter({ kind: "project", value: projCanonical, displayName: projDisplay });
                          }}
                          className="hover:text-foreground hover:underline truncate max-w-[14ch]"
                          title={projCanonical}
                          data-testid="session-project-cell"
                        >
                          {projDisplay}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{formatNumber(s.totalTokens)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCost(s.totalCost)}</td>
                  </tr>
                );
              })}
              {padBottom > 0 && (
                <tr aria-hidden="true" style={{ height: padBottom }}>
                  <td colSpan={5} />
                </tr>
              )}
              {total === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No sessions match</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
