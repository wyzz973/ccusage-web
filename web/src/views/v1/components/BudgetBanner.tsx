import { AlertTriangle, X } from "lucide-react";
import { formatCost } from "@/lib/utils";
import { useV1Store } from "../data/v1-store";

// R3.7 — X1 budget banner (spec-v3 §3.3.1).
//
// Renders when:
//   1. user has a `mode.monthlyCapUSD` set (cap is a client-side policy
//      preference; server emits the projection in `derived.budget.monthEndProjectionUSD`)
//   2. server's projection > cap
//   3. user hasn't dismissed it for today
//
// page-bleed rose; role="alert" aria-live="assertive" so screenreaders
// announce it on transition. Dismiss-for-today scopes the suppression
// to a single calendar day — next day's banner is independent.
//
// Single-banner invariant with D9 (LimitResetBanner): when both fire the
// X1 banner wins the page-bleed slot and shows D9 as an addendum line.
// (Implementation: callers should pass `limitResetActive` so the addendum
// renders inside the body.)
export interface BudgetBannerProps {
  monthEndProjectionUSD: number | null;
  /** Today key (YYYY-MM-DD) — drives the dismiss-for-today comparison. */
  todayKey: string;
  /** When true, the D9 quota-reset addendum renders inside the body. */
  limitResetActive?: boolean;
  /** Optional reset time (locale string) for the addendum. */
  limitResetTimeLabel?: string | null;
}

export function BudgetBanner({
  monthEndProjectionUSD, todayKey, limitResetActive, limitResetTimeLabel,
}: BudgetBannerProps): JSX.Element | null {
  const cap = useV1Store((s) => s.mode.monthlyCapUSD);
  const dismissedFor = useV1Store((s) => s.x1BannerDismissedFor);
  const dismiss = useV1Store((s) => s.dismissX1BannerToday);

  const projection = monthEndProjectionUSD ?? 0;
  // Single-source of truth for the fire-condition. Don't duplicate this
  // check elsewhere — surfaces that need to know "is the banner up?"
  // should read it from a selector, not re-derive.
  const fire = cap != null && cap > 0 && projection > cap;
  const dismissedToday = dismissedFor === todayKey;
  if (!fire || dismissedToday) return null;

  const overshoot = projection - cap;
  const overPct = Math.round((overshoot / cap) * 100);

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="budget-banner"
      className="flex items-start gap-2 rounded-md border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100"
    >
      <AlertTriangle className="h-4 w-4 text-rose-300 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1 space-y-0.5">
        <div className="font-medium">
          Projected to exceed monthly cap by {formatCost(overshoot)} ({overPct}% over)
        </div>
        <div className="text-xs text-rose-200/80">
          Month-end projection {formatCost(projection)} · cap {formatCost(cap)}
          {limitResetActive && limitResetTimeLabel && (
            // D9 addendum (single-banner invariant — see spec-v1.2 §1.8).
            <span> · Quota resets at {limitResetTimeLabel}</span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => dismiss(todayKey)}
        data-testid="budget-banner-dismiss"
        className="rounded p-0.5 text-rose-200/70 hover:text-rose-100 hover:bg-rose-400/10"
        aria-label="Dismiss budget banner (for today)"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
