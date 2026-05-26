# R4 Slip Plan

**Why this doc exists.** Per PRD v4 §5.2 + R3.1 process correction:
every PRD §1 item that doesn't land in `docs/swarm/r4-closure-trace.md`
MUST appear here with explicit rationale + R5 disposition. Silent
absence from both = gate-8 critical finding (M-R3-1 precedent).

The "no surprises" pattern: reviewer cross-checks
`every PRD v4 §1 item ∈ closure-trace ∪ slip-plan`, so this list is
the single back-flip for that audit.

Per researcher §A.2, four R5-deferral slots are pre-allocated; R4
implementer adds new entries here ONLY if a §1 item slips
mid-round.

---

## Pre-allocated R5 deferrals (researcher v4 §A.2)

### `#sqlite-deep-pricing`
**Scope:** Hermes subscription-included sessions ("$0-per-session inside
subscription bucket") + Goose accumulated-totals delta-math nuance.
**R4 rationale:** R4.1/R4.2 ship basic ingestion + flat cost only. The
sophisticated edges need their own investigation cycle (upstream's
`liuzemei` fix per researcher v2 §2.6).
**R5 disposition:** Tokens are correct at the basic-ingestion layer;
only cost magnitude for subscription users is affected. Parity rows
score off coverage not edge-case fidelity, so R4 still moves A2.10 +
A2.12 from 0.5 → 1.0.

### `#mcp-resources`
**Scope:** MCP Tools/Resources schema expansion beyond R3.4 snapshot
wrapper (budget-check tool, statusline-query tool).
**R4 rationale:** C2 already 1.0 post-R3.4.
**R5 disposition:** Polish; no parity uplift.

### `#niche-agent-uplift`
**Scope:** Per-agent UI promotion for Kimi / Qwen / Kilo / pi
(A2.11 / A2.13 / A2.14 / A2.15 — each 0.5 → 0.75 or higher).
**R4 rationale:** Low user prevalence per researcher v2 §B.1; R4.9
promotes the top 4 non-Claude (OpenCode / Amp / Droid / Codebuff)
which cover the meaningful long tail.
**R5 disposition:** Absorbs +1.0 pp; criterion-2 path requires this.

### `#codex-first-class`
**Scope:** Codex per-agent KPI tile (vs the SessionTable appearance via
R4.3 alone).
**R4 rationale:** Adds ~+0.25 pp; needs separate "Codex Insights"
panel layout (designer surface).
**R5 disposition:** Polish if convergence buffer needed; doesn't affect
criterion-1 trigger.

---

## R4 in-round deferrals (added as items slip)

### `#multi-agent-discovery`
**Slipped from:** R4.0 (S-R2-2 smoke gate convergence)
**PRD v4 reference:** §1 R4.0 (prerequisite Phase 0) — gate-5 condition
**Findings (R4.0.b investigation):** R4.0.b's parser-relaxation fix is
correct and lands cleanly, BUT it does NOT close the §B smoke gap as
researcher §B.2 predicted. Direct probe shows Jan 2026 lines now have
2529 kept / 0 dropped post-fix, so over-rejection is no longer the
dominant mechanism. The residual smoke gap is **discovery scope
mismatch**:

| Source | Walks | 2026-01 tokens |
|---|---|---|
| Our `discoverJsonlFiles` | `$CLAUDE_CONFIG_DIR / ~/.claude/projects` only | 54.9 M |
| Bare `ccusage monthly` | "all detected coding (agent) CLI usage" per `ccusage --help` (Claude + Codex + Gemini + Copilot + OpenClaw + Hermes + Goose + OpenCode + Amp + Droid + Codebuff + pi + Kimi + Qwen + Kilo) | 545.3 M |

User's `~/.codex/sessions/` alone has 186 files.

**R4 disposition (R4.0.c response — team-lead Option 4):** smoke
oracle re-parameterised to `ccusage claude <cmd>` for apples-to-apples
scope. Token totals + block count now PASS post-R4.0.c
(54,883,696 = 54,883,696 exact). Discovery-scope expansion (walking
the other 14 agent roots) is honestly out of R4.0 scope; lands in R5
or via R4.1/R4.2 SQLite adapters' per-agent path discovery
(Hermes + Goose contribute `~/.hermes/state.db` + `~/.local/share/goose/state.db`
walking in their batch).

**R5 disposition:** Implement a multi-agent `discoverJsonlFiles` that
walks `~/.codex/sessions/`, `~/.gemini/projects/`, `~/.copilot/`,
`~/.openclaw/`, etc. paths per the per-source patterns iter0-R1 §2
documents. Mirrors ccusage's bare-`monthly` aggregation behavior. Once
landed, the smoke gate can drop the `claude` sub-source restriction
and assert across all agents (or keep both forms for layered
coverage).

**Status:** R4.0.c re-parameterisation closed 3 of 6 smoke assertions
(was 2 of 6 post-R4.0.a/b); the remaining 3 cost-related failures are
a separate pricing-data drift bug — R4.10 territory, see
`#opus-4-5-20251101-pricing-drift` below.

### `#opus-4-5-20251101-pricing-drift`
**Slipped from:** R4.0 (gate-5 6-of-6 smoke condition); will be closed by **R4.10**.
**PRD v4 reference:** §1 R4.10 (Pricing snapshot refresh)
**Findings (R4.0.c follow-up probe):** Post-R4.0.c per-source
re-parameterisation, the smoke shows native cost on
`claude-opus-4-5-20251101` is EXACTLY 3× ccusage's reported cost for
2026-01 (`native=$91.3741 cc=$30.4580`, ratio 0.3333). Same
breakdowns:

| Component | Tokens | Our rate ($/M) | Our cost | ccusage cost |
|---|---|---|---|---|
| input | 68,341 | 15 | $1.03 | (1/3 ours) |
| output | 6,092 | 75 | $0.46 | (1/3 ours) |
| cache_create | 2,453,522 | 18.75 | $46.00 | (1/3 ours) |
| cache_read | 29,259,029 | 1.5 | $43.89 | (1/3 ours) |
| **total** | | | **$91.37** | **$30.46** |

Exact 1/3 ratio across all components → not a tier-asymmetry; it's a
unit-price drift specifically for the `-20251101` SHA. Our
`pricing-data.ts` has identical rates for `claude-opus-4-5` and
`claude-opus-4-5-20251101`; ccusage's LiteLLM snapshot has the
post-`-20251101` rate at 1/3.

**R4 disposition:** Closed by R4.10 (in-round). R4.10's
hand-merge step picks up the new Anthropic rows from the weekly
LiteLLM cron — `claude-opus-4-5-20251101`'s revised rates land in
that commit. After R4.10, smoke goes 3 of 6 → 6 of 6 (the 3 cost
assertions all converge with the updated rates).

**Status:** **CLOSED by R4.10 commit.** Probe confirmed scope is wider
than just `-20251101`: `claude-opus-4-6` and `claude-opus-4-7` carry
the same 1/3 reduction. All three rows updated; smoke 6 of 6 PASS.
Closure-trace entry at `r4-closure-trace.md#r4-10`.
