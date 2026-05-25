// D2 — Range picker.
//
// spec-v2 §3.3.1 / §3.3.2: Radix Popover + 6 preset chips + native
// <input type="date"> pair + Compare switch + Default reset.
//
// Single source of truth for "what window is the page showing". Replaces
// the per-component window tabs (TrendChart's Today/7/30/60/90 collapse
// into this picker per spec-v2 §3.3.6).
//
// §3.3.6 "Today is special": Compare disabled when range = Today.

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Switch } from "./ui/switch";
import { cn } from "@/lib/utils";
import { useV1Store, formatRangeLabel, type Range, type RangePreset } from "../data/v1-store";

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "this-mo", label: "This month" },
  { id: "last-mo", label: "Last month" },
];

function isoDay(d: Date): string { return d.toISOString().slice(0, 10); }

function rangeForPreset(id: RangePreset): Range {
  const now = new Date();
  const sub = (days: number): string => isoDay(new Date(now.getTime() - days * 24 * 3600 * 1000));
  if (id === "today")   return { preset: "today",   from: sub(0),  to: sub(0) };
  if (id === "7d")      return { preset: "7d",      from: sub(6),  to: sub(0) };
  if (id === "30d")     return { preset: "30d",     from: sub(29), to: sub(0) };
  if (id === "90d")     return { preset: "90d",     from: sub(89), to: sub(0) };
  if (id === "this-mo") {
    const y = now.getUTCFullYear(); const m = now.getUTCMonth();
    return { preset: "this-mo", from: isoDay(new Date(Date.UTC(y, m, 1))), to: sub(0) };
  }
  // last-mo
  const y = now.getUTCFullYear(); const m = now.getUTCMonth();
  const firstOfLast = new Date(Date.UTC(y, m - 1, 1));
  const lastOfLast = new Date(Date.UTC(y, m, 0));
  return { preset: "last-mo", from: isoDay(firstOfLast), to: isoDay(lastOfLast) };
}

export function DateRangePickerV1(): JSX.Element {
  const range = useV1Store((s) => s.range);
  const setRange = useV1Store((s) => s.setRange);
  const compareOn = useV1Store((s) => s.compareOn);
  const toggleCompare = useV1Store((s) => s.toggleCompare);
  const resetRange = useV1Store((s) => s.resetRange);
  const open = useV1Store((s) => s.rangeOpen);
  const setOpen = useV1Store((s) => s.setRangeOpen);

  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  useEffect(() => { setFrom(range.from); setTo(range.to); }, [range.from, range.to]);

  const compareDisabled = range.preset === "today";

  const onPreset = (id: RangePreset): void => {
    const r = rangeForPreset(id);
    setRange(r);
    if (compareDisabled && id === "today" && compareOn) toggleCompare();
    setOpen(false);
  };

  const commitCustom = (): void => {
    if (from && to && from <= to) {
      setRange({ preset: "custom", from, to });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium tabular-nums text-zinc-100 hover:bg-muted/40"
        aria-label={`Date range: ${formatRangeLabel(range)}`}
        data-testid="range-trigger"
      >
        <span>{formatRangeLabel(range)}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" data-testid="range-popover">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Range</div>
          <div role="radiogroup" aria-label="Range presets" className="grid grid-cols-3 gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={range.preset === p.id}
                onClick={() => onPreset(p.id)}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs transition-colors",
                  range.preset === p.id
                    ? "border-sky-400/40 bg-sky-400/10 text-sky-200"
                    : "border-border text-zinc-200 hover:bg-muted/40",
                )}
                data-testid={`range-preset-${p.id}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Custom</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">From</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                onBlur={commitCustom}
                onKeyDown={(e) => { if (e.key === "Enter") commitCustom(); }}
                className="rounded-md border border-border bg-transparent px-2 py-1 text-xs text-zinc-50 [color-scheme:dark]"
                data-testid="range-custom-from"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">To</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                onBlur={commitCustom}
                onKeyDown={(e) => { if (e.key === "Enter") commitCustom(); }}
                className="rounded-md border border-border bg-transparent px-2 py-1 text-xs text-zinc-50 [color-scheme:dark]"
                data-testid="range-custom-to"
              />
            </label>
          </div>
        </div>

        <div className="border-t border-border pt-3 flex items-start gap-3">
          <Switch
            id="compare-switch"
            checked={compareOn}
            onCheckedChange={toggleCompare}
            disabled={compareDisabled}
            aria-label="Compare to previous period"
          />
          <label htmlFor="compare-switch" className="cursor-pointer">
            <div className="text-xs text-zinc-100">Compare to previous period</div>
            <div className="text-[10px] text-muted-foreground">
              {compareDisabled ? "Disabled while range = Today" : "Same-length window immediately prior"}
            </div>
          </label>
        </div>

        <button
          type="button"
          onClick={() => { resetRange(); setOpen(false); }}
          className="border-t border-border pt-3 text-left text-[11px] text-sky-300 hover:text-sky-200 w-full"
          data-testid="range-reset"
        >
          Default <span className="text-muted-foreground">(clears to 30d, compare off)</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}
