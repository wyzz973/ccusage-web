// D1 — Full project list modal with search.
//
// spec-v2 §3.2.3. Radix Dialog (ARIA + focus trap + Esc). Search filters
// across displayName + canonical.

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCost, formatNumber } from "@/lib/utils";
import { useV1Store } from "../data/v1-store";
import type { Derived } from "@/types";

type Project = NonNullable<Derived["projects"]>[number];

export interface ProjectsDialogV1Props {
  projects: Project[];
}

export function ProjectsDialogV1({ projects }: ProjectsDialogV1Props): JSX.Element {
  const open = useV1Store((s) => s.projectsDialogOpen);
  const setOpen = useV1Store((s) => s.setProjectsDialogOpen);
  const addFilter = useV1Store((s) => s.addFilter);
  const [q, setQ] = useState("");

  const filtered = q.trim()
    ? projects.filter((p) =>
        p.displayName.toLowerCase().includes(q.toLowerCase()) ||
        p.canonical.toLowerCase().includes(q.toLowerCase()),
      )
    : projects;
  const max = Math.max(...projects.map((p) => p.cost), 1);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl" data-testid="projects-dialog">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle>All projects · {projects.length} total</DialogTitle>
        </div>
        <div className="px-5 py-3 border-b border-border">
          <Input
            placeholder="Search projects…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8"
            autoFocus
            data-testid="projects-dialog-search"
          />
        </div>
        <ul className="max-h-[60vh] overflow-auto px-2 py-2" role="list">
          {filtered.map((p) => (
            <li key={p.canonical}>
              <button
                type="button"
                onClick={() => {
                  addFilter({ kind: "project", value: p.canonical, displayName: p.displayName });
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/40 text-left"
                title={p.canonical}
              >
                <span className="flex-1 truncate text-sm text-zinc-100">{p.displayName}</span>
                <div className="w-32 h-2 rounded bg-muted/40 overflow-hidden">
                  <div
                    className="h-full bg-zinc-400/30"
                    style={{ width: `${Math.max(4, (p.cost / max) * 100)}%` }}
                    aria-hidden="true"
                  />
                </div>
                <span className="w-24 text-right font-mono tabular-nums text-sm text-zinc-100">{formatCost(p.cost)}</span>
                <span className="w-12 text-right font-mono tabular-nums text-[10px] text-muted-foreground">{p.pctOfWindow}%</span>
                <span className="w-20 text-right font-mono tabular-nums text-[11px] text-muted-foreground">{formatNumber(p.tokens)} tok</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="py-8 text-center text-sm text-muted-foreground">No projects match "{q}"</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
