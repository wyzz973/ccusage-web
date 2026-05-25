// D1 — Top projects panel.
//
// spec-v2 §3.2.2. Horizontal share bars normalized to max(top5.cost),
// NOT total — that's a separate question per §3.2.2's note.
// The explicit numeric label uses pctOfWindow from the server (which IS
// share-of-window with paired N/D per spec-v2 §1.1).
//
// Click row → addFilter project chip (D1 closes G14).
// Click "View all" → opens ProjectsDialogV1.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatCost, formatNumber } from "@/lib/utils";
import { useV1Store } from "../data/v1-store";
import type { Derived } from "@/types";

type Project = NonNullable<Derived["projects"]>[number];

export interface ProjectsPanelV1Props {
  projects: Project[];
}

export function ProjectsPanelV1({ projects }: ProjectsPanelV1Props): JSX.Element {
  const addFilter = useV1Store((s) => s.addFilter);
  const setProjectsDialogOpen = useV1Store((s) => s.setProjectsDialogOpen);

  const top5 = projects.slice(0, 5);
  const max = Math.max(...top5.map((p) => p.cost), 1);

  return (
    <Card className="h-full" data-testid="projects-panel-v1">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base text-foreground">Top projects</CardTitle>
        {projects.length > 0 && (
          <span className="text-[11px] text-muted-foreground">({projects.length} total)</span>
        )}
      </CardHeader>
      <CardContent className="space-y-1.5">
        {top5.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No project metadata in current window. Try expanding the time range.
          </div>
        ) : (
          <>
            <ul className="space-y-0.5" role="list">
              {top5.map((p) => (
                <li key={p.canonical}>
                  <button
                    type="button"
                    onClick={() => addFilter({ kind: "project", value: p.canonical, displayName: p.displayName })}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-md -mx-2 px-2 py-1.5",
                      "hover:bg-muted/30 transition-colors text-left",
                    )}
                    aria-label={`Filter to project ${p.displayName}, ${formatCost(p.cost)}`}
                    title={p.canonical}
                    data-testid="project-row"
                  >
                    <span className="flex-1 truncate text-xs text-zinc-100 max-w-[20ch]">{p.displayName}</span>
                    <div className="w-32 h-2 rounded bg-muted/40 overflow-hidden">
                      <div
                        className="h-full bg-zinc-400/30 group-hover:bg-zinc-300/40 transition-colors"
                        style={{ width: `${Math.max(4, (p.cost / max) * 100)}%` }}
                        aria-hidden="true"
                      />
                    </div>
                    <span className="w-20 text-right font-mono tabular-nums text-xs text-zinc-100">{formatCost(p.cost)}</span>
                    <span className="w-12 text-right font-mono tabular-nums text-[10px] text-muted-foreground">{p.pctOfWindow}%</span>
                    <span className="w-16 text-right font-mono tabular-nums text-[10px] text-muted-foreground">{formatNumber(p.tokens)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {projects.length > 5 && (
              <div className="pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setProjectsDialogOpen(true)}
                  className="text-xs text-sky-300 hover:text-sky-200"
                  data-testid="projects-view-all"
                >
                  View all ({projects.length})
                </button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
