// H1 — /history route. spec-v2 §3.6.1.
//
// R2-binding: chronological list of 5h blocks grouped by date, sticky date
// headers, arrow-key navigation, Enter to open the BlockDetailDialog.
// Calendar heatmap + month-over-month bars are R3-stretch (spec-v2 §3.6.3)
// — wireframed only, NOT rendered here. A footer note surfaces the carry-
// over so reviewer reads the hole as intentional.

import { useEffect, useMemo, useRef, useState } from "react";
import { useV1Store } from "../data/v1-store";
import { AGENT_COLORS, AGENT_LABEL, toAgentKey } from "../lib/agent-colors";
import { cn, formatCost, formatNumber } from "@/lib/utils";
import { BlockDetailDialogV1 } from "../components/BlockDetailDialogV1";
import type { Block } from "@/types";

interface DateGroup {
  date: string;       // YYYY-MM-DD
  label: string;
  rows: Block[];
}

function groupByDate(blocks: Block[]): DateGroup[] {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

  const groups = new Map<string, Block[]>();
  for (const b of blocks) {
    if (b.isGap) continue;
    const date = b.startTime.slice(0, 10);
    const list = groups.get(date) ?? [];
    list.push(b);
    groups.set(date, list);
  }
  return Array.from(groups.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, rows]) => {
      let label: string;
      if (date === today) label = `Today · ${date}`;
      else if (date === yesterday) label = `Yesterday · ${date}`;
      else label = `${new Date(date + "T00:00:00Z").toUTCString().slice(0, 3)} · ${date}`;
      return { date, label, rows: rows.sort((a, b) => a.startTime.localeCompare(b.startTime)) };
    });
}

export interface HistoryV1Props {
  blocks: Block[];
}

export function HistoryV1({ blocks }: HistoryV1Props): JSX.Element {
  const setBlockDetailId = useV1Store((s) => s.setBlockDetailId);
  const groups = useMemo(() => groupByDate(blocks), [blocks]);
  const flat = useMemo(() => groups.flatMap((g) => g.rows), [groups]);
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (focusedIdx < 0 || focusedIdx >= flat.length) return;
    rowRefs.current[focusedIdx]?.focus();
  }, [focusedIdx, flat.length]);

  function onKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIdx((i) => Math.min(flat.length - 1, i < 0 ? 0 : i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx((i) => Math.max(0, i < 0 ? 0 : i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusedIdx(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setFocusedIdx(flat.length - 1);
    }
  }

  let runningIdx = -1;

  return (
    <main id="main" className="space-y-4" data-testid="history-v1">
      <header className="text-sm text-muted-foreground">
        Past 5-hour blocks · grouped by date · <span className="text-zinc-300">{flat.length} total</span>
        <span className="ml-3 text-[10px] text-muted-foreground/70">
          Arrow keys to step · Enter for detail
        </span>
      </header>

      {flat.length === 0 ? (
        <div
          className="rounded-xl border border-border bg-card/40 p-8 text-center text-sm text-muted-foreground"
          data-testid="history-empty"
        >
          No blocks on record yet.
        </div>
      ) : (
        <div
          className="rounded-xl border border-border bg-card/40"
          onKeyDown={onKeyDown}
          role="list"
          aria-label="Block history"
          data-testid="history-block-list"
        >
          {groups.map((g) => (
            <section key={g.date} aria-label={g.label}>
              <h2 className="sticky top-0 z-10 bg-background/95 backdrop-blur px-4 py-2 text-sm font-medium text-muted-foreground border-b border-border/40">
                {g.label}
              </h2>
              <ul className="divide-y divide-border/30">
                {g.rows.map((b) => {
                  runningIdx++;
                  const myIdx = runningIdx;
                  const t = new Date(b.startTime).toUTCString().slice(17, 22);
                  const agentKey = toAgentKey(b.models.find((m) => m.startsWith("claude")) ? "claude" : "unknown");
                  const topModel = b.models[0] ?? "—";
                  return (
                    <li key={b.id}>
                      <button
                        type="button"
                        ref={(el) => { rowRefs.current[myIdx] = el; }}
                        onClick={() => setBlockDetailId(b.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setBlockDetailId(b.id);
                          }
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-2 text-left",
                          "hover:bg-muted/30 focus-visible:bg-muted/40",
                          b.isActive && "bg-sky-400/5",
                        )}
                        aria-label={`Block ${t}, ${formatCost(b.costUSD)}, ${topModel}`}
                        data-testid="history-block-row"
                      >
                        <span className="w-14 font-mono tabular-nums text-sm text-zinc-200">{t}</span>
                        <span className="w-12 text-xs text-muted-foreground">5 h</span>
                        <span className="w-20 font-mono tabular-nums text-sm text-zinc-100">{formatCost(b.costUSD)}</span>
                        <span className="w-24 font-mono tabular-nums text-xs text-muted-foreground">{formatNumber(b.totalTokens)} tok</span>
                        <span className="flex-1 truncate text-xs text-muted-foreground" title={topModel}>{topModel}</span>
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ background: AGENT_COLORS[agentKey] }}
                          aria-label={AGENT_LABEL[agentKey]}
                        />
                        {b.isActive && (
                          <span className="text-[10px] uppercase tracking-wider text-sky-300">active</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <footer className="text-xs text-muted-foreground" data-testid="history-r3-note">
        Calendar heatmap + month-over-month bars coming in R3 (see <code>spec-v2.md §3.6.3</code>).
      </footer>

      <BlockDetailDialogV1 blocks={blocks} />
    </main>
  );
}
