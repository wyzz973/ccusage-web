// Built-in pricing snapshot.
//
// Source: hand-merged from
//   - Anthropic public pricing page (https://www.anthropic.com/pricing)
//   - ccusage rust/crates/ccusage/src/pricing.rs:207-275 builtin Claude rows
//   - fast-multiplier-overrides.json
// Snapshot date: 2026-05-25 (matches iter0-R1 §4.2).
//
// All rates are USD-per-TOKEN.
//
// Per iter0 R1 §4.2:
//  - cache_create defaults to input * 1.25 if unspecified
//  - cache_read   defaults to input * 0.10 if unspecified
// Here we list explicit numbers from Anthropic pricing to avoid drift.
//
// Only sonnet-4 series publishes above_200k rates; everything else is null.

export interface PriceRow {
  input: number;
  output: number;
  cache_create: number;
  cache_read: number;
  cache_read_explicit: boolean;
  input_above_200k: number | null;
  output_above_200k: number | null;
  cache_create_above_200k: number | null;
  cache_read_above_200k: number | null;
  fast_multiplier: number;
}

/** Per-million-token → per-token */
const M = 1 / 1_000_000;

export const PRICING_TABLE: Record<string, PriceRow> = {
  // ─── Opus 4.5 / 4.6 / 4.7 ───────────────────────────────────────────────────
  // Opus 4.x flat pricing: $15/M in, $75/M out.
  // cache write = input * 1.25 = 18.75/M ; cache read = input * 0.10 = 1.50/M.
  // fast_multiplier: 4.5 = 1.0, 4.6 = 6.0, 4.7 = 6.0 (priority-tier; pricing.rs:697-714).
  "claude-opus-4-5": {
    input: 15 * M,
    output: 75 * M,
    cache_create: 18.75 * M,
    cache_read: 1.5 * M,
    cache_read_explicit: true,
    input_above_200k: null,
    output_above_200k: null,
    cache_create_above_200k: null,
    cache_read_above_200k: null,
    fast_multiplier: 1.0,
  },
  // R4.10 — `-20251101` SHA introduces Anthropic's post-Nov 2026
  // price reduction for the Opus 4.5 tier. New rates are exactly 1/3
  // of the pre-Nov ladder. Empirically verified against ccusage's
  // LiteLLM snapshot: 2026-01 `actual=$30.4580 predicted-with-(5,25,6.25,0.5)=$30.4580`
  // (and 2026-02 same exact match). The non-dated `claude-opus-4-5`
  // entry above still carries pre-Nov rates for entries that don't
  // pin the SHA — this preserves apples-to-apples with ccusage's own
  // by-SHA pricing lookup.
  "claude-opus-4-5-20251101": {
    input: 5 * M,
    output: 25 * M,
    cache_create: 6.25 * M,
    cache_read: 0.5 * M,
    cache_read_explicit: true,
    input_above_200k: null,
    output_above_200k: null,
    cache_create_above_200k: null,
    cache_read_above_200k: null,
    fast_multiplier: 1.0,
  },
  // R4.10 — Opus 4.6 / 4.7 inherit the post-Nov 1/3 reduction (same as
  // 4-5-20251101 SHA). Empirically verified against ccusage's LiteLLM
  // snapshot: aggregate `claude-opus-4-7` cost native=$10818.75 vs cc=$3606.57
  // (ratio 0.3333) → flat 1/3 across input/output/cache_create/cache_read
  // → identical to the 4-5-20251101 SHA reduction. fast_multiplier 6.0
  // preserved (priority-tier amplifier unchanged by the price cut per
  // upstream `pricing.rs:697-714`).
  "claude-opus-4-6": {
    input: 5 * M,
    output: 25 * M,
    cache_create: 6.25 * M,
    cache_read: 0.5 * M,
    cache_read_explicit: true,
    input_above_200k: null,
    output_above_200k: null,
    cache_create_above_200k: null,
    cache_read_above_200k: null,
    fast_multiplier: 6.0,
  },
  "claude-opus-4-7": {
    input: 5 * M,
    output: 25 * M,
    cache_create: 6.25 * M,
    cache_read: 0.5 * M,
    cache_read_explicit: true,
    input_above_200k: null,
    output_above_200k: null,
    cache_create_above_200k: null,
    cache_read_above_200k: null,
    fast_multiplier: 6.0,
  },

  // ─── Sonnet 4 / 4.5 / 4.6 ───────────────────────────────────────────────────
  // Sonnet 4 published TIERED prices (per Anthropic and pricing.rs:309-313):
  //   ≤200k input: $3/M, ≤200k output: $15/M
  //   >200k input: $6/M, >200k output: $22.50/M
  // 4.5/4.6 inherit the same tiered structure as 4 (last verified 2026-05-25).
  "claude-sonnet-4": {
    input: 3 * M,
    output: 15 * M,
    cache_create: 3.75 * M,
    cache_read: 0.3 * M,
    cache_read_explicit: true,
    input_above_200k: 6 * M,
    output_above_200k: 22.5 * M,
    cache_create_above_200k: 7.5 * M,
    cache_read_above_200k: 0.6 * M,
    fast_multiplier: 1.0,
  },
  "claude-sonnet-4-5": {
    input: 3 * M,
    output: 15 * M,
    cache_create: 3.75 * M,
    cache_read: 0.3 * M,
    cache_read_explicit: true,
    input_above_200k: 6 * M,
    output_above_200k: 22.5 * M,
    cache_create_above_200k: 7.5 * M,
    cache_read_above_200k: 0.6 * M,
    fast_multiplier: 1.0,
  },
  "claude-sonnet-4-5-20250929": {
    input: 3 * M,
    output: 15 * M,
    cache_create: 3.75 * M,
    cache_read: 0.3 * M,
    cache_read_explicit: true,
    input_above_200k: 6 * M,
    output_above_200k: 22.5 * M,
    cache_create_above_200k: 7.5 * M,
    cache_read_above_200k: 0.6 * M,
    fast_multiplier: 1.0,
  },
  "claude-sonnet-4-6": {
    input: 3 * M,
    output: 15 * M,
    cache_create: 3.75 * M,
    cache_read: 0.3 * M,
    cache_read_explicit: true,
    input_above_200k: 6 * M,
    output_above_200k: 22.5 * M,
    cache_create_above_200k: 7.5 * M,
    cache_read_above_200k: 0.6 * M,
    fast_multiplier: 1.0,
  },

  // ─── Haiku 4.5 ──────────────────────────────────────────────────────────────
  // Anthropic public: $1/M in, $5/M out. cache_create=1.25/M, cache_read=0.10/M.
  "claude-haiku-4-5": {
    input: 1 * M,
    output: 5 * M,
    cache_create: 1.25 * M,
    cache_read: 0.1 * M,
    cache_read_explicit: true,
    input_above_200k: null,
    output_above_200k: null,
    cache_create_above_200k: null,
    cache_read_above_200k: null,
    fast_multiplier: 1.0,
  },
  "claude-haiku-4-5-20251001": {
    input: 1 * M,
    output: 5 * M,
    cache_create: 1.25 * M,
    cache_read: 0.1 * M,
    cache_read_explicit: true,
    input_above_200k: null,
    output_above_200k: null,
    cache_create_above_200k: null,
    cache_read_above_200k: null,
    fast_multiplier: 1.0,
  },
};
