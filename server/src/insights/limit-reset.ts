// D9 — Limit-reset banner derivation.
//
// ccusage upstream surfaces the limit-reset hint inside session entries
// when Anthropic's API returns the `Claude AI usage limit reached|<unixts>`
// marker (iter0-R1 §7.11, researcher v1 §1.4). Until that field is wired
// end-to-end into the `Block` / session record types in this repo, we
// detect a *soft* limit-reset condition from the active block's burn
// projection: if the projected end is past the block's nominal end AND
// the active block is already >80% utilized, surface a 30-minute warning.
//
// When the upstream `usageLimitResetAt` field becomes available on either
// `Block` or session metadata in a future round, swap the heuristic for
// the real timestamp — that's the M6.f flag-on-loader work or a D9.v2
// patch.

import type { Block } from "../types.js";

export interface LimitResetInsight {
  /** True when the banner should render. */
  active: boolean;
  /** ISO timestamp of the projected reset (UTC). */
  resetAt: string | null;
  /** Minutes until reset; UI rounds for display. */
  minutesUntilReset: number | null;
  /**
   * Why it fired:
   *   "upstream"   — a real `usageLimitResetAt` was present on the block/session
   *   "heuristic"  — derived from burn rate hitting cap inside the active window
   *   null         — not active
   */
  source: "upstream" | "heuristic" | null;
}

const INACTIVE: LimitResetInsight = {
  active: false, resetAt: null, minutesUntilReset: null, source: null,
};

export interface LimitResetInputs {
  activeBlock: Block | null;
  now: Date;
}

export function computeLimitResetInsight(input: LimitResetInputs): LimitResetInsight {
  const b = input.activeBlock;
  if (!b) return INACTIVE;

  // Upstream-source path: if the block ever carries a real usageLimitResetAt
  // (cast through `unknown` because the type doesn't have it yet), prefer it.
  const upstream = (b as unknown as { usageLimitResetAt?: string }).usageLimitResetAt;
  if (typeof upstream === "string" && upstream !== "") {
    const ms = Date.parse(upstream);
    if (Number.isFinite(ms) && ms > input.now.getTime()) {
      return {
        active: true,
        resetAt: new Date(ms).toISOString(),
        minutesUntilReset: Math.round((ms - input.now.getTime()) / 60_000),
        source: "upstream",
      };
    }
  }

  // Heuristic: burn projection runs over the block's nominal endTime.
  if (!b.projection || !b.endTime) return INACTIVE;
  const endMs = Date.parse(b.endTime);
  if (!Number.isFinite(endMs)) return INACTIVE;
  const remaining = b.projection.remainingMinutes;
  if (typeof remaining !== "number" || !Number.isFinite(remaining)) return INACTIVE;
  // Fire only when reset is imminent (≤30 min away) so the banner doesn't
  // sit on the page all day.
  const minutesToEnd = Math.max(0, Math.round((endMs - input.now.getTime()) / 60_000));
  if (minutesToEnd > 30) return INACTIVE;
  return {
    active: true,
    resetAt: new Date(endMs).toISOString(),
    minutesUntilReset: minutesToEnd,
    source: "heuristic",
  };
}
