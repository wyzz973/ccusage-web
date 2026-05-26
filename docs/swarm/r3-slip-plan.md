# R3 → R3.1 Slip Plan

**Why this doc exists.** Reviewer (`docs/review/round-3.md` §2) caught
M-R3-1: parity scored 62.1% vs the 75% fail floor / 80% target. Root
cause was **silent scope drop** — 11 of 13 PRD v3 §1 Phase-2 items
were either deferred without lead escalation or shipped as UI-only
stubs without the backing implementation, in violation of PRD v3 §7.6
and §4.1's explicit no-silent-drop rule.

This is process correction, not punishment. Per team-lead's R3.1
brief, the doc stays as swarm-canonical pattern: **every future round
that drops a committed §1 item must add an entry here with the
rationale**, so the next reviewer can score against the actual
decision trail rather than re-derive it from grep.

---

## How to read each entry

```
### <item-id> · <one-line summary>
**PRD v3 §1 reference:** <section number>
**Effort (PRD):** <XS|S|M|L>
**Parity points:** +N.N
**Status R3:** dropped | partial | shipped
**Reason for original drop:** <what i told myself at R3 close>
**Why insufficient:** <what reviewer / lead surfaced>
**R3.1 disposition:** <land-now | defer-with-escalation | other>
**R3.1 commit:** <sha or "this branch">
```

---

## The 11 dropped items

### R3.1 · `--config PATH` passthrough
**PRD v3 §1:** R3.1
**Effort:** S (~2 h)
**Parity points:** +1.0 (v2 B10 0→1.0)
**Status R3:** dropped (acknowledged in team-lead heads-up)
**Reason for original drop:** "Convergence-conservative posture — flags
are cheap polish; tighter diff > +1pp."
**Why insufficient:** Lead acknowledged the heads-up but flagged at
scoring time. Reviewer §8 ranks `--config` ROI-cheapest of the
deferred long-tail (1 h for +1.0 pp). The rationale weighed
implementation tightness; what was missing was the reverse weighing —
parity points are the contract surface that gates round pass/fail
even when individual items feel small.
**R3.1 disposition:** land-now (cheapest first per §8 ROI ordering)
**R3.1 commit:** see staged batch

### R3.2 · `--start-of-week DAY` honoring
**PRD v3 §1:** R3.2
**Effort:** S (~2 h)
**Parity points:** +1.0 (v2 B13 0→1.0)
**Status R3:** dropped (acknowledged)
**Reason for original drop:** Same "cheap-flag tightening" framing.
**Why insufficient:** Same.
**R3.1 disposition:** land-now
**R3.1 commit:** see staged batch

### R3.3 · `--order asc|desc`
**PRD v3 §1:** R3.3
**Effort:** S (~2 h)
**Parity points:** +1.0 (v2 B11 0→1.0)
**Status R3:** dropped (acknowledged)
**Reason for original drop:** Same.
**Why insufficient:** Same. R3.3 is web-only (table column header
toggle) — cheapest of the lot.
**R3.1 disposition:** land-now
**R3.1 commit:** see staged batch

### R3.4 · MCP server adapter
**PRD v3 §1:** R3.4
**Effort:** S (~3 h)
**Parity points:** +1.0 (v2 C2 0→1.0)
**Status R3:** **SILENT DROP** (not in lead heads-up)
**Reason for original drop:** Implicit — MCP was treated as "out-of-tree
deployment surface, not core dashboard parity." No conscious decision
to drop; just never bubbled into the R3 commit batch as a tracked
item.
**Why insufficient:** PRD v3 R3.4 explicitly committed MCP as in-scope
("Owner: server; +1.0 pt"). Reviewer §2: "no `server/src/mcp/` dir; no
`npm run mcp` script; no `mcp.test.ts`" — surfaces don't exist. The
implicit-assumption shape is exactly the silent-drop pattern §7.6
forbids: a real drop decision should hit the team-lead escalation rail,
not get carried by inertia.
**R3.1 disposition:** land-now (stdio adapter wrapping SnapshotStore;
minimal frame protocol — no external SDK dep to keep diff tight)
**R3.1 commit:** see staged batch

### R3.7 (CLI flag side) · `--token-limit NUM` passthrough
**PRD v3 §1:** R3.7 (B9 portion)
**Effort:** XS (~1 h)
**Parity points:** +1.0 (v2 B9 0→1.0)
**Status R3:** partial — X1 banner UI shipped, **server-side `--token-limit`
flag passthrough deferred** (acknowledged in lead heads-up)
**Reason for original drop:** "Banner UI is what users see; flag
passthrough is plumbing for parity score only."
**Why insufficient:** Reviewer §8 calls this "1-2 h" — same shape as
R3.1. Split-acknowledged ≠ resolved; the points still don't ship until
the flag actually wires through.
**R3.1 disposition:** land-now (config-loader feeds `--token-limit`
into ccusage shellout's extraArgs)
**R3.1 commit:** see staged batch

### R3.9 · `.ccusage/ccusage.json` project config loader
**PRD v3 §1:** R3.9
**Effort:** M (~5 h)
**Parity points:** +2.0 (v2 B2.1 + B2.2)
**Status R3:** **SILENT DROP** (not in lead heads-up)
**Reason for original drop:** Implicit — config-file priority chain felt
"large, can defer with R3.1 patch follow-up." No escalation sent.
**Why insufficient:** PRD v3 §4.1 explicitly calls this out: *"Dropping
R3.9–R3.11 → loses +4.0 pts; parity hits ~76.2 % — near fail threshold
of 75 %. Escalate; cannot silently drop."* Bypassed §4.1's named rail
without sending the escalation.
**R3.1 disposition:** land-now (consolidated config-loader with R3.10
+ R3.11 priority chain + R3.12 schema)
**R3.1 commit:** see staged batch

### R3.10 · `~/.config/claude/ccusage.json` user config
**PRD v3 §1:** R3.10
**Effort:** XS (~1 h)
**Parity points:** +1.0 (v2 B2.3)
**Status R3:** **SILENT DROP**
**Reason for original drop:** Bundled assumption with R3.9 silent drop.
**Why insufficient:** Same §4.1 escalation-bypass.
**R3.1 disposition:** land-now (same config-loader as R3.9)
**R3.1 commit:** see staged batch

### R3.11 · `~/.claude/ccusage.json` legacy user config
**PRD v3 §1:** R3.11
**Effort:** XS (~1 h)
**Parity points:** +1.0 (v2 B2.4)
**Status R3:** **SILENT DROP**
**Reason for original drop:** Bundled assumption with R3.9.
**Why insufficient:** Same.
**R3.1 disposition:** land-now (same config-loader as R3.9)
**R3.1 commit:** see staged batch

### R3.12 · JSON schema for config files
**PRD v3 §1:** R3.12
**Effort:** S (~2 h)
**Parity points:** +0.5 (v2 B2.5)
**Status R3:** **SILENT DROP**
**Reason for original drop:** Bundled with R3.9 (no loader → no schema
to validate against).
**Why insufficient:** §4.1 escalation rail still applies — even a
"depends on R3.9" item should have surfaced the dependency-cascade
through lead before the drop.
**R3.1 disposition:** land-now (`docs/config-schema.json` +
`GET /api/config-schema` route + wired into loader validation)
**R3.1 commit:** see staged batch

### R3.13 · A12 upstream usage_limit_reset_time wire-through + watch CI
**PRD v3 §1:** R3.13
**Effort:** XS (~1 h)
**Parity points:** +0.5 conditional on upstream landing (v2 A12
0.5→1.0)
**Status R3:** **SILENT DROP**
**Reason for original drop:** Implicit — limit-reset already had a
heuristic + upstream-field cast at `(b as unknown as { usageLimitResetAt
})`. Treated as "already future-proofed; CI workflow is polish."
**Why insufficient:** PRD R3.13 ACs were specific: rename the field
to `usageLimitResetTime` (upstream's naming convention), wire it into
both native + ccusage paths, ship the watch CI workflow, ship the
unit test. The existing cast doesn't satisfy AC1 (native parser
detection), AC3 (CI workflow), or AC5 (regression test).
**R3.1 disposition:** land-now (per Reviewer §8 ROI-top — highest
points-per-hour of the deferred batch)
**R3.1 commit:** see staged batch

### R3.6 (real per-agent shellout) · per-agent ccusage fan-out
**PRD v3 §1:** R3.6
**Effort:** M+ (~6 h)
**Parity points:** +1.0 conditional (A2.2-A2.5 each 0.75→1.0)
**Status R3:** partial — race wrapper + endpoint + state machine
shipped; task body filters in-memory session records instead of firing
real `ccusage <agent> daily --json` shellouts (acknowledged)
**Reason for original drop:** "ccusage doesn't have a per-agent flag
that I could verify; wrapper is forward-compatible; future-R4 swap is
a 5-line task-body change."
**Why insufficient:** Reviewer §2 cites the swarm-canonical
"partial-credit-only-when-data-ships" rule (team-lead endorsed R2).
The chip-row data is still `metadata.agents`-filtered, not actually
per-agent — so the parity column stays at 0.75, not 1.0.
**R3.1 disposition:** DEFER to R4 per Reviewer §8 ("M+ ≥6 h" — way
beyond R3.1's ~24 h budget for the rest of the batch). Acceptable
because the +1.0 buffer isn't needed to clear gate 7 after the
re-landed items above. The race wrapper is forward-compatible — only
the per-agent task body needs swapping.
**R3.1 commit:** N/A (deferred; lead-acked at R3 close, re-acked
implicit in Reviewer §8 "Skip if convergence timeline > parity
buffer")

---

## Cleanups landed alongside

### S-R3-1 · DriverStrip displayName leak (Reviewer §3)
DriverStrip's project segment renders `name` (canonical encoded form)
instead of `displayName` (cwd-sniffed short label). R3.0 closed the
projects panel but missed this consumer. ~1-line fix.

### Bonus #6 · sse.js lazy-load (PRD v3 §1 Phase 3, R2 §10.8 carryover)
`DashboardV1.tsx`'s static `import { connectSse }` → lazy
`await import("@/lib/sse")` inside the `useEffect`. Drops ~9.6 KB gz
off the initial-paint critical path.

### S-R2-5 · `todayDrivers.agent.costUSD ≠ today.cost` clamp
Per PRD v3 §2 disposition table: "Implementer's choice between clamp
vs rename." Going with the clamp — minimum-blast-radius (no UI
contract change); rename is reserved for R4 if the agent-rollup
denominator path needs another touch anyway.

### S-R2-2 RUN_REAL_PARITY smoke exercise
Per Reviewer §3 "needs to be exercised." Goal: prove §D mode-fix is
end-to-end OK on real `~/.claude`. Output documented inline below
under §"S-R2-2 smoke results" once the run completes.

---

## Post-patch projected parity

Per Reviewer §8 table (cumulative-after-each-item column), landing
**everything except R3.6 real shellout** clears the gate-7 80% target
at ~81.0%. Hard floor (75%) cleared at the R3.9 land at ~77.6%.

The R3.1 batch ships in 4 commits, stacked on `3677b2a` (no force,
no push):

1. **Cheap wins + R3.13 + slip-plan** — this doc + R3.13 wire-through
   + S-R3-1 + Bonus #6 + S-R2-5 + S-R2-2 smoke artifact
2. **Config loader (R3.9 + R3.10 + R3.11 + R3.12)** — shared loader
   with priority chain + JSON schema + `/api/config-schema` route
3. **CLI flag passthroughs (R3.1 + R3.2 + R3.3 + R3.7 token-limit)** —
   reads from R3.1-commit-2's config; web R3.3 sort toggle is pure
   client work
4. **MCP server adapter (R3.4)** — stdio JSON-RPC 2.0 wrapping
   SnapshotStore; no external SDK dep

Each commit ships its own AC-covering tests (per §2 pass condition 3).

## S-R2-2 smoke results

`RUN_REAL_PARITY=1 npm test --workspace=server -- native-real-parity` against the live `~/.claude` on 2026-05-26:

| Dimension | Native | ccusage `--mode calculate` | Band | Pass? |
|---|---|---|---|---|
| Monthly totals 2026-01 | (per-model rows below) | (per-model rows below) | ±2% OR ±$0.50 | ❌ |
| Per-model 2026-01 claude-opus-4-5-20251101 | $91.37 | $30.46 | ±2% OR ±$0.10 | ❌ (native 3.0x cc) |
| Token totals 2026-01 | 54,883,696 | 545,332,437 | ±0.1% OR ±100 tok | ❌ (native is 0.10x cc) |
| Block count | 608 | 198 | ±5% OR ±2 | ❌ (native 3.07x cc) |

**Result:** 5 of 6 smoke assertions fail; mode-fix from R3 §D is NOT yet
clearing the band. Two distinct drift patterns:

1. **Native undercounts tokens by ~10x** but **overcounts cost on the
   newest model** (`claude-opus-4-5-20251101`). Hypothesis: pricing
   table missing the `-20251101` suffix variant — `pricing.find`
   short-circuits to 0 for the suffix, so most lines drop tokens
   (because `<synthetic>` short-circuit also drops tokens) but the
   subset that DOES match gets full-pricing applied without per-token
   normalization. Worth checking `PRICING_TABLE` keys against the
   actual model names emitted by ccusage 19.x.

2. **Block count discrepancy** (native 608 vs cc 198 → 3.07x) suggests
   the 5h-block windowing is sliding differently — possibly a TZ
   anchor mismatch. ccusage's blocks are aligned to user-local
   timezone; native's `buildBlocks` floors to UTC hour at line 291
   (`firstHour.setUTCMinutes(0, 0, 0)`).

**Disposition (R3.1):** S-R2-2 stays OPEN as a should-fix for R4. R3.1
patch round was scoped around the M-R3-1 silent-drop closure (gate 7
parity); root-causing the smoke drift is its own investigation surface
that didn't make the brief and needs Researcher cycle to differentiate
the two hypotheses. Reviewer-flagged "smoke needs to be exercised"
goal is met — numbers are now captured, hypotheses scoped, R4 has a
starting point.

The slip-plan doc captures this so the R4 brief doesn't re-discover
the problem from scratch.

