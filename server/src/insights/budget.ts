// R3.7 — Month-end projection (server-side facts only).
//
// spec-v3 §3.3.1 — the X1 banner fires when month-end-projection > cap.
// The server emits the projection facts; the **client** applies the
// user's cap policy because the cap is cross-mode user prefs stored
// in localStorage (`ccusage.mode.monthlyCapUSD`), not server-side
// config. This matches the spec-v2 D10–12 pattern where data prefs
// live client-side.
//
// Pure function. Naive linear projection is intentional — spec-v3
// §3.3.1 frames the banner as "early warning", not "precise forecast"
// (so don't fake precision by smoothing weekend dips).

import type { UsageRecord } from "../types.js";

export interface BudgetInputs {
  /** All daily records; the function filters to the current month. */
  dailyRecords: UsageRecord[];
  /** Current month key (YYYY-MM) — drives the slice. */
  monthKey: string;
  /** Current day of month (1..31) — drives the run-rate denominator. */
  dayOfMonth: number;
  /** Total days in current month (28..31). */
  daysInMonth: number;
}

export interface BudgetInsight {
  monthToDateUSD: number;
  /**
   * Naive linear projection: MTD × (daysInMonth / dayOfMonth).
   * Per spec-v3 §3.3.1 intentionally conservative — honest "early
   * warning" beats smoothed false precision.
   */
  monthEndProjectionUSD: number;
  /**
   * Always `null` server-side; the client applies the user's cap from
   * `useV1Store.mode.monthlyCapUSD` and computes overshoot itself.
   * Echoed in the response shape so the field exists for client typing.
   */
  monthlyCapUSD: null;
  overshootUSD: null;
  overshootPct: null;
  perBlockTokenLimit: null;
  /** Always `false` server-side — client does the `projection > cap` check. */
  banner: false;
}

export function computeBudgetInsight(input: BudgetInputs): BudgetInsight {
  const monthToDateUSD = input.dailyRecords
    .filter((r) => r.period.startsWith(input.monthKey))
    .reduce((s, r) => s + (Number.isFinite(r.totalCost) ? r.totalCost : 0), 0);

  const day = Math.max(1, input.dayOfMonth);
  const monthEndProjectionUSD = (monthToDateUSD / day) * input.daysInMonth;

  return {
    monthToDateUSD,
    monthEndProjectionUSD,
    monthlyCapUSD: null,
    overshootUSD: null,
    overshootPct: null,
    perBlockTokenLimit: null,
    banner: false,
  };
}
