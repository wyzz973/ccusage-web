// D9 — Limit-reset banner.
//
// spec-v1.2 §1 (carried forward R2-binding per spec-v2 §7). Mounts inside
// the BlockHistoryStrip card (NOT page-bleed per §3 placement). Single-
// banner invariant with future X1 budget banner.
//
// Dismissable per-session via the v1 store; resurfaces when reset
// timestamp changes (handled by the parent re-mount cycle).

import { AlertTriangle, X } from "lucide-react";
import { useV1Store } from "../data/v1-store";
import type { Derived } from "@/types";

type LimitReset = NonNullable<Derived["limitReset"]>;

export interface LimitResetBannerV1Props {
  limitReset: LimitReset | null | undefined;
}

export function LimitResetBannerV1({ limitReset }: LimitResetBannerV1Props): JSX.Element | null {
  const dismissed = useV1Store((s) => s.limitResetDismissed);
  const dismiss = useV1Store((s) => s.dismissLimitReset);

  if (!limitReset || !limitReset.active || dismissed) return null;

  const minutes = limitReset.minutesUntilReset ?? 0;
  const resetTimeLabel = limitReset.resetAt
    ? new Date(limitReset.resetAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "soon";

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="limit-reset-banner-v1"
      className="flex items-center gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-100"
    >
      <AlertTriangle className="h-3.5 w-3.5 text-amber-300 shrink-0" aria-hidden="true" />
      <span className="flex-1">
        <span className="font-medium">Quota resets at {resetTimeLabel}</span>
        <span className="text-amber-200/80"> · in {minutes} min · 5-h block carries over</span>
      </span>
      <button
        type="button"
        onClick={dismiss}
        className="rounded p-0.5 text-amber-200/70 hover:text-amber-100 hover:bg-amber-400/10"
        aria-label="Dismiss limit-reset banner"
        data-testid="limit-reset-dismiss"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
