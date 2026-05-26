// D10/D11/D12 — Settings popover.
//
// spec-v1.2 §2 (carried forward R2-binding per spec-v2 §7) — three groups:
// Cost mode (D10) · Connectivity / Offline + Native (D11) · Timezone (D12).
// Reset link clears to defaults; 6 px amber dot on trigger when non-default.
//
// Hand-rolled per spec-v2 §1.3 bundle discipline: native <input type=radio>
// for RadioGroup, in-tree Switch primitive, native <select> for Timezone.
// (Native <select> is fine here because Settings popover is the ONLY popover
// open at a time — no nested-popover focus headache that designer DM
// flagged for the range picker's TZ list. The Settings TZ list also caps
// at a curated subset; full Intl.supportedValuesOf integration is D12.v2.)

import { useCallback, useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Switch } from "./ui/switch";
import { cn } from "@/lib/utils";
import { useV1Store, isModeDefault, type CostMode, type ModeState } from "../data/v1-store";

const COST_MODES: { id: CostMode; label: string; hint: string }[] = [
  { id: "calculate", label: "Calculate", hint: "Computed locally from token counts + rates (default)" },
  { id: "auto",      label: "Auto",      hint: "Use ccusage's chosen value per record" },
  { id: "display",   label: "Display",   hint: "Trust ccusage's cost field verbatim" },
];

// Curated common subset; reviewer's note S14-followup may expand to
// Intl.supportedValuesOf('timeZone') with a hand-rolled virtualized list
// in D12.v2 if needed.
const TIMEZONES = [
  Intl.DateTimeFormat().resolvedOptions().timeZone,
  "UTC",
  "America/Los_Angeles",
  "America/New_York",
  "America/Chicago",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
];

const DEDUP_TIMEZONES = Array.from(new Set(TIMEZONES));

export function SettingsPopoverV1(): JSX.Element {
  const mode = useV1Store((s) => s.mode);
  const setMode = useV1Store((s) => s.setMode);
  const resetMode = useV1Store((s) => s.resetMode);
  const open = useV1Store((s) => s.settingsOpen);
  const setOpen = useV1Store((s) => s.setSettingsOpen);
  const dot = !isModeDefault(mode);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="relative inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40"
        aria-label="Settings (cost mode, connectivity, timezone)"
        data-testid="settings-trigger"
      >
        <Settings className="h-3.5 w-3.5" aria-hidden="true" />
        {dot && (
          <span
            aria-label="Custom settings active"
            data-testid="settings-dot"
            className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-400"
          />
        )}
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-4 text-zinc-100" align="end" data-testid="settings-popover">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Settings</div>
          {dot && (
            <button
              type="button"
              onClick={resetMode}
              className="text-[10px] text-sky-300 hover:text-sky-200"
              data-testid="settings-reset"
            >
              Reset to defaults
            </button>
          )}
        </div>

        {/* D10 — Cost mode (hand-rolled radio group; native <input radio>
            picks up arrow-key navigation + Space-to-select for free). */}
        <fieldset className="space-y-1.5">
          <legend className="text-[10px] uppercase tracking-wider text-muted-foreground">Cost mode</legend>
          {COST_MODES.map((m) => (
            <label
              key={m.id}
              className={cn(
                "flex items-start gap-2 rounded-md border px-2 py-1.5 cursor-pointer transition-colors",
                mode.costMode === m.id
                  ? "border-sky-400/40 bg-sky-400/10"
                  : "border-border hover:bg-muted/30",
              )}
            >
              <input
                type="radio"
                name="cost-mode"
                value={m.id}
                checked={mode.costMode === m.id}
                onChange={() => setMode({ costMode: m.id })}
                className="mt-1 h-3 w-3 accent-sky-400"
                data-testid={`cost-mode-${m.id}`}
              />
              <div className="flex-1 text-xs">
                <div className="text-zinc-100">{m.label}</div>
                <div className="text-[10px] text-muted-foreground">{m.hint}</div>
              </div>
            </label>
          ))}
        </fieldset>

        {/* D11 — Connectivity */}
        <fieldset className="space-y-1.5">
          <legend className="text-[10px] uppercase tracking-wider text-muted-foreground">Connectivity</legend>
          <div className="flex items-start gap-3 rounded-md border border-border px-2 py-1.5">
            <Switch
              id="offline-switch"
              checked={mode.offline}
              onCheckedChange={(v) => setMode({ offline: v })}
              aria-label="Offline mode"
            />
            <label htmlFor="offline-switch" className="cursor-pointer">
              <div className="text-xs text-zinc-100">Offline</div>
              <div className="text-[10px] text-muted-foreground">Skip LiteLLM rate fetch · use cached rates</div>
            </label>
          </div>
          <div className="flex items-start gap-3 rounded-md border border-border px-2 py-1.5">
            <Switch
              id="native-switch"
              checked={mode.nativeParser}
              onCheckedChange={(v) => setMode({ nativeParser: v })}
              aria-label="Native parser"
            />
            <label htmlFor="native-switch" className="cursor-pointer">
              <div className="text-xs text-zinc-100">Native parser <span className="text-muted-foreground">(M6 preview)</span></div>
              <div className="text-[10px] text-muted-foreground">Bypass ccusage shellout · in-tree loader</div>
            </label>
          </div>
        </fieldset>

        {/* R4.6 — Config file (spec-v3.1 §3.2). Vertical stack between
            Connectivity and Timezone per PRD §7 Q2. debounced-blur +
            Enter-commit + Esc-revert per §3.3.2 (same convention as
            budget inputs). Empty string clears the active config. */}
        <ConfigPathInput
          value={mode.configPath}
          onCommit={(v) => setMode({ configPath: v })}
        />

        {/* D12 — Timezone (native <select>; popover is the only one open so
            no nested-popover trap to worry about). */}
        <fieldset className="space-y-1.5">
          <legend className="text-[10px] uppercase tracking-wider text-muted-foreground">Timezone</legend>
          <select
            value={mode.timezone}
            onChange={(e) => setMode({ timezone: e.target.value })}
            className="w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-xs text-zinc-100 [color-scheme:dark]"
            aria-label="Timezone"
            data-testid="tz-select"
          >
            {DEDUP_TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </fieldset>

        {/* R3.7 — Budget group (spec-v3 §3.3.1 + §3.3.3).
            Both inputs are client-side policy: server emits the projection
            (`derived.budget.monthEndProjectionUSD`) regardless of cap, and
            the X1 banner / per-block chip mount on the client when the
            projection / per-block-projection cross the user's threshold.
            Empty string clears the cap (null = no fire).
        */}
        <fieldset className="space-y-1.5">
          <legend className="text-[10px] uppercase tracking-wider text-muted-foreground">Budget</legend>
          <div className="rounded-md border border-border px-2 py-1.5 space-y-1">
            <label htmlFor="budget-cap" className="text-xs text-zinc-100">Monthly cap (USD)</label>
            <input
              id="budget-cap"
              type="number"
              inputMode="decimal"
              min={0}
              step={1}
              value={mode.monthlyCapUSD ?? ""}
              onChange={(e) => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                setMode({ monthlyCapUSD: v != null && Number.isFinite(v) && v > 0 ? v : null });
              }}
              placeholder="—"
              className="w-full rounded border border-border bg-transparent px-1.5 py-1 text-xs text-zinc-100 [color-scheme:dark]"
              aria-label="Monthly USD cap"
              data-testid="budget-cap-input"
            />
            <div className="text-[10px] text-muted-foreground">Banner fires when projection &gt; cap</div>
          </div>
          <div className="rounded-md border border-border px-2 py-1.5 space-y-1">
            <label htmlFor="block-token-limit" className="text-xs text-zinc-100">Per-block token limit</label>
            <input
              id="block-token-limit"
              type="number"
              inputMode="numeric"
              min={0}
              step={1_000_000}
              value={mode.perBlockTokenLimit ?? ""}
              onChange={(e) => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                setMode({ perBlockTokenLimit: v != null && Number.isFinite(v) && v > 0 ? v : null });
              }}
              placeholder="—"
              className="w-full rounded border border-border bg-transparent px-1.5 py-1 text-xs text-zinc-100 [color-scheme:dark]"
              aria-label="Per-block token limit"
              data-testid="block-token-limit-input"
            />
            <div className="text-[10px] text-muted-foreground">Chip fires when active-block projection exceeds limit</div>
          </div>
        </fieldset>

        {/* R4.5 B12 — Debug snapshot link in popover footer next to
            Reset link (separator `·`). Opens GET /api/debug in a new
            tab; matches the UI-UX prototype-v4 anchor. */}
        <div className="flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
          {dot && (
            <button
              type="button"
              onClick={resetMode}
              className="text-sky-300 hover:text-sky-200"
              data-testid="settings-reset-footer"
            >
              Reset
            </button>
          )}
          {dot && <span aria-hidden="true">·</span>}
          <a
            href="/api/debug"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground"
            data-testid="settings-debug-link"
          >
            Debug snapshot
          </a>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * R4.6 — Config-file path input with debounced-blur + Enter-commit +
 * Esc-revert semantics (same convention as budget inputs per
 * spec-v3.1 §3.3.2). Local draft buffer keeps the input responsive
 * without triggering a store write on every keystroke.
 */
function ConfigPathInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }): JSX.Element {
  const [draft, setDraft] = useState(value);
  // Sync draft when the store value changes externally (e.g. resetMode).
  useEffect(() => { setDraft(value); }, [value]);
  const commit = useCallback(() => {
    if (draft !== value) onCommit(draft);
  }, [draft, value, onCommit]);
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-[10px] uppercase tracking-wider text-muted-foreground">Config file</legend>
      <input
        type="text"
        spellCheck={false}
        placeholder="/Users/me/.ccusage/ccusage.json"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setDraft(value); (e.target as HTMLInputElement).blur(); }
        }}
        className="h-8 w-full rounded-md border border-border bg-transparent px-2 text-xs font-mono text-zinc-100"
        aria-label="Config file path"
        data-testid="settings-config-path"
      />
      <div className="text-[10px] text-muted-foreground">Path to a JSON config. Empty = use defaults.</div>
    </fieldset>
  );
}

// Re-export type for callers.
export type { ModeState };
