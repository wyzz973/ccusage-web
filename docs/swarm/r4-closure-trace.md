# R4 Closure Trace

**Why this doc exists.** R3 ended with an 18.6 pp gap between
Implementer's parity projection (80.7 %) and Reviewer's recount
(62.1 %), root-caused to silent drops of 7 of 13 committed §1 items.
The slip-plan retrofitted the audit trail post-hoc — useful, but
**reactive**.

R4 is the convergence-shot round (must-fix=0 fires CRITERION-1 and
halts the swarm), so any Reviewer-Implementer scope ambiguity costs
an entire R5 round. Per Researcher v4 §C, this doc closes that gap
in advance: **Implementer fills in one entry per committed §1 item
AS THE COMMIT LANDS**, not post-hoc. Every entry carries the SHA +
file-list + AC test path + Reviewer-expected-delta so the audit is
mechanical, not interpretive.

Items NOT in this doc → must be in `docs/swarm/r4-slip-plan.md` with
explicit rationale + lead escalation reference. No exceptions.

---

## Template

```markdown
## R4.<id> · <one-line summary>

**PRD v4 §1 reference:** <section>
**Parity row(s) closed:** <e.g. A2.10 0.5→1.0>
**Effort estimate (PRD):** <XS|S|M|L>
**Effort actual:** <XS|S|M|L>
**Commit SHA(s):** <list>
**Files touched:** <git show --stat extract — must match the PRD's claimed scope>
**AC tests landed:**
  - <test path> ::: <test name>
**Surface grep proof:**
  - `grep -rn "<surface-name>" server/src web/src` → <line-count, sample line>
**Smoke / e2e proof (if applicable):**
  - <test output snippet showing the surface works against real data>
**Reviewer recount expectation:** <row delta, e.g. +0.25 pp on A2.10>
**Status:** committed | partial (slip-plan slot opened) | deferred-to-R5 (slip-plan slot opened)
```

---

## Closed items

<!-- Implementer appends one entry per commit. -->

## R4.0.c · Smoke oracle re-parameterise to `ccusage claude <cmd>`

**PRD v4 §1 reference:** R4.0 (S-R2-2 closure batch, combined regression validation)
**Parity row(s) closed:** none direct (smoke gate is gate-5, not a parity row); partial smoke convergence — see "Smoke" below
**Effort estimate (PRD):** XS (folded into R4.0.a/b)
**Effort actual:** ~45 min (instrumentation + oracle helper + slip-plan)
**Commit SHA(s):** (this commit)
**Files touched:**
  - `server/src/native/__tests__/native-real-parity.smoke.test.ts` — added local `ccusageClaudeOracle<T>(cmd)` helper that spawns `ccusage claude <cmd> --mode calculate --timezone <tz> --json` directly + normalises per-source field names (`date`/`week`/`month` → `period`) back to the unified shape. All 5 oracle call sites swapped from `runCcusage` to the new helper.
  - `docs/swarm/r4-slip-plan.md` (new) — opens `#multi-agent-discovery` (R5-deferred) + `#opus-4-5-20251101-pricing-drift` (R4.10-scheduled in-round) per the no-silent-drops protocol.
**AC tests landed:** none new; existing smoke assertions are the AC surface, re-pointed to a comparable scope.
**Surface grep proof:**
  - `grep -n "ccusageClaudeOracle\|runCcusage" server/src/native/__tests__/native-real-parity.smoke.test.ts` → 5 uses of the new helper; only mention of runCcusage is in a doc comment explaining why we bypass it.
**Smoke / e2e proof:**
  - Pre R4.0.c (post R4.0.b): 2 of 6 pass — block count + smoke wiring; token assertion reported `native=54883696 cc=545332437` (apples-vs-oranges — bare ccusage walked 15-agent default).
  - Post R4.0.c: **3 of 6 pass**. New PASS: token totals (apples-to-apples now matches exactly, `native=54883696 cc=54883696`). Block count still PASS. Wiring still PASS.
  - Residual 3 cost-related FAILs: `native=$97.67 cc=$36.76` for 2026-01 monthly, with the per-model breakdown showing an EXACT 1/3 ratio for `claude-opus-4-5-20251101` ($91.37 vs $30.46). Root cause: pricing-data drift specifically for the `-20251101` SHA — our `pricing-data.ts` carries pre-`-20251101` rates; ccusage's LiteLLM snapshot reflects the post-`-20251101` reduction. Closed by R4.10 in-round; slip-plan entry at `#opus-4-5-20251101-pricing-drift`.
**Reviewer recount expectation:** 0 pp (smoke gate cleanup); convergence of remaining 3 assertions deferred to R4.10's pricing snapshot refresh.
**Status:** committed — smoke gate convergence partial pending R4.10; multi-agent discovery deferred to R5 with explicit slip-plan slot.

## R4.0.b · Remove 3 fields from NULL_FORBIDDEN_FIELDS (§B.2 H2)

**PRD v4 §1 reference:** R4.0 (S-R2-2 closure batch, hypothesis B.2)
**Parity row(s) closed:** none direct (correctness fix); predicted "4 of 6 smoke assertions" — see "Findings" below
**Effort estimate (PRD):** ~30 min
**Effort actual:** ~20 min for the fix + fixture/oracle extension + investigation
**Commit SHA(s):** (this commit)
**Files touched:**
  - `server/src/native/parser.ts` — removed `isApiErrorMessage`, `cache_creation_input_tokens`, `cache_read_input_tokens` from `NULL_FORBIDDEN_FIELDS`. Downstream `?? 0` / `=== true` defensive coercion already handles the nulls.
  - `server/src/__fixtures__/native/synthetic.jsonl` — +3 fixture lines (req-10/11/12) each carrying one of the now-tolerated null fields with valid usage block.
  - `server/src/__fixtures__/native/oracle.synthetic.json` — oracle regenerated: totalCost 1.36795 (was 1.35745), totalTokens 288900 (was 284400), claude-haiku-4-5 cost 0.0175 (was 0.007), edgeCases.lines_kept extended.
  - `server/src/native/__tests__/native-parity.golden.test.ts` — assertion count 7→10; new test "tolerable-null lines are KEPT" pins the §B.2 contract.
**AC tests landed:**
  - `server/src/native/__tests__/native-parity.golden.test.ts` ::: "synthetic R4.0.b: tolerable-null lines (isApiErrorMessage/cache_*_input_tokens) are KEPT"
**Surface grep proof:**
  - `grep -A12 "NULL_FORBIDDEN_FIELDS = \[" server/src/native/parser.ts` → 7 entries (was 10); the three removed fields are absent.
**Smoke / e2e proof:**
  - Direct probe (`tsx`): pre-R4.0.b parser would have rejected `{"isApiErrorMessage":null}` lines; post-fix accepts them. Verified via standalone `hasUnsupportedNullField` probe.
  - **`RUN_REAL_PARITY=1` smoke result: 2 of 6 pass (unchanged from R4.0.a baseline).** Block-count still PASS; tokens/per-model/daily/monthly still FAIL with the SAME numbers as pre-R4.0.b (`native=54883696 cc=545332437` for 2026-01).
  - **Finding: §B.2's predicted "closes 4 of 6 smoke assertions" did NOT materialize.** Investigation (probes in tool-runs) shows the parser change DID take effect — direct probe against the real Jan 2026 lines shows 2529 kept / 0 dropped post-fix. The smoke gap is dominated by a DIFFERENT root cause: `discoverJsonlFiles` only walks Claude roots (`~/.claude/projects`), but `ccusage monthly` is "all detected coding (agent) CLI usage" — it sums Claude + Codex + Gemini + Copilot + OpenClaw + Hermes + Goose + etc. The user's `~/.codex/sessions/` alone has 186 files. The smoke's apples-vs-oranges comparison (single-agent native vs multi-agent ccusage) explains the residual drift.
**Reviewer recount expectation:** 0 pp (correctness fix; existing parity rows unchanged)
**Status:** committed — correctness portion of §B.2 closed; smoke gate convergence requires multi-agent discovery (out-of-scope for R4.0; escalating to team-lead)
**Slip-plan slot opened:** see `docs/swarm/r4-slip-plan.md#r4-0-c-smoke-residual` (next commit after this one)

## R4.0.a · Port `identify_session_blocks` cluster-and-gap algorithm

**PRD v4 §1 reference:** R4.0 (S-R2-2 closure batch, hypothesis B.1)
**Parity row(s) closed:** none direct (A5 was already 1.0 from R2); closes 1 of 6 smoke assertions
**Effort estimate (PRD):** ~3 h
**Effort actual:** ~1 h (algorithm port + 7 unit tests)
**Commit SHA(s):** (this commit)
**Files touched:**
  - `server/src/native/runner.ts` — `buildBlocks` rewritten to cluster + gap; `floorToTzHour` helper added; `toRealBlock`/`toGapBlock` extracted for readability
  - `server/src/native/__tests__/blocks-cluster.test.ts` (new) — 7 tests covering: 12h+6h-gap cluster shape, intra-5h non-split, exceeds-start-but-not-last split, TZ-local floor anchor, active/inactive detection, empty-input invariant
**AC tests landed:**
  - `server/src/native/__tests__/blocks-cluster.test.ts` ::: "12h stream with a 6h mid-gap → 2 real blocks + 1 gap block (NOT 3 grid windows)" — the spec's pinned scenario from Researcher §B.1
  - `server/src/native/__tests__/blocks-cluster.test.ts` ::: "TZ honor: floors cluster start to LOCAL hour, not UTC hour"
  - (5 more covering invariants)
**Surface grep proof:**
  - `grep -n "floorToTzHour\|toRealBlock\|toGapBlock" server/src/native/runner.ts` → algorithm scaffolding in place; closes the UTC-anchor + fixed-grid divergences flagged at lines 282-327 pre-R4
**Smoke / e2e proof:**
  - `RUN_REAL_PARITY=1 npm test -- native-real-parity` pre-fix: `block count: native=609 cc=198` (FAIL, 3.07×)
  - Post-fix: **PASS** (within ±5% / ±2 blocks band per smoke contract)
  - Other 4 smoke assertions still fail (token / per-model / daily / monthly) — R4.0.b addresses
**Reviewer recount expectation:** 0 pp (correctness fix; existing parity rows unchanged)
**Status:** committed
