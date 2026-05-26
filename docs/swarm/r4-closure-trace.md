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

## R4.4 · R3.6 real per-agent shellout swap (server portion)

**PRD v4 §1 reference:** R4.4
**Parity row(s) closed:** A2.2 / A2.3 / A2.4 / A2.5 each 0.75 → 1.0 (combined with R3.5 chip-row); +1.0 pp net
**Effort estimate (PRD):** M (~5 h)
**Effort actual:** ~45 min (race wrapper untouched per AC1; only task body + injection scaffolding)
**Commit SHA(s):** (this commit)
**Files touched:**
  - `server/src/ccusage-runner.ts` — new `runCcusageAgent(agent, cmd, opts)` per-source CLI helper. Builds `[agent, cmd, "--json", ...]` argv per the order ccusage 20.x requires (verified: `ccusage --json claude session` is rejected; `ccusage claude session --json` is accepted). Honors `signal` for AbortController cancellation.
  - `server/src/routes.ts` — `RoutesDeps` extended with `perAgentTask` (test injection), `ccusageBin`, `perAgentTaskTimeoutMs` (defaults to `budgetMs + 200ms` slack). `/api/per-agent` route swaps the in-memory filter task for `defaultPerAgentTask` which calls `runCcusageAgent(agent, "session", { extraArgs: ["--mode", "calculate", "--since", YYYYMMDD, "--until", YYYYMMDD], signal })`. Race wrapper from R3 stays UNCHANGED (per AC5 the canary).
  - `server/src/app.ts` — threads `cfg.ccusageBin` into `createRoutes` for the production default.
  - `server/src/__tests__/routes.test.ts` — existing fan-out test refactored to inject `perAgentTask` stub (preserves R3 envelope assertion); new tests pin the AbortSignal contract + the R3.6.AC5 silent-swallow → `failed[]` classification.
**AC tests landed:**
  - `server/src/__tests__/routes.test.ts` ::: "fans out per detected agent — `perAgentTask` injection preserves R3 semantics" (AC1 surface verification)
  - `server/src/__tests__/routes.test.ts` ::: "R4.4: passes a real AbortSignal to the task (race wrapper contract)" (AC2 signal forwarding)
  - `server/src/__tests__/routes.test.ts` ::: "R4.4: thrown task error lands in `failed[]` (R3.6.AC5 silent-swallow preserved)" (AC4 failure-mode preservation)
  - `server/src/insights/__tests__/per-agent.test.ts` ::: ALL 9 R3 canary tests still PASS (AC5 — "MUST still pass; if the naive Promise.race([allSettled, timeout]) pattern leaks back in, the canary fails red"; verified clean re-run post-swap)
**Surface grep proof:**
  - `grep -rn "runCcusageAgent.*session" server/src` → 2 hits (definition + route call site); per R4.4.AC6 "closure-trace row references this line".
**Smoke / e2e proof:**
  - `npm test --workspace=server`: 314/314 (+3 new R4.4 + helper coverage).
  - `npm run test:e2e --workspace=web`: 3/3 PASS — including the R3.6 per-agent contract test (`per-agent-budget.spec.ts`) which mocks `/api/per-agent` and verifies the all-timeout footer surfaces. Race wrapper contract intact per AC2.
**Reviewer recount expectation:** +1.0 pp on A2.2-A2.5 combined (each 0.75 → 1.0 per partial-credit-only-when-data-ships rule).
**Status:** committed — server side complete; the per-agent chip row UI uplift (showing per-agent KPI numbers in the FilterChipRow) is in the web R4 batch.

## R4.5 (server-side portion) · B12 + B16 + B18 + B19 flag passthroughs

**PRD v4 §1 reference:** R4.5 (B12 / B16 / B18 / B19; B14 + B15 are web-only and ship in the bulk web batch)
**Parity row(s) closed:** B12 0 → 0.5 (debug endpoint exists; UI link in web batch promotes to 1.0); B16 0 → 1.0 (full server-side); B18 0 → 1.0 (cache); B19 0 → 1.0 (refresh-hint)
**Effort estimate (PRD):** ~3 h for the server-side subset
**Effort actual:** ~45 min (compact scope; existing endpoint extensions + config-loader keys)
**Commit SHA(s):** (this commit)
**Files touched:**
  - `server/src/insights/config-loader.ts` — `Config` interface extended with `sessionLengthHours` (R4.5 B16) and `recentBlocks` (R4.5 B15 — server publishes, web reads). Validation block extended (positive-number guard, same shape as `tokenLimit`).
  - `docs/config-schema.json` — mirror schema entries with descriptions.
  - `server/src/native/runner.ts` — `NativeRunnerOptions.sessionLengthHours` added; `buildBlocks` + `toRealBlock` accept `sessionMs` parameter (default unchanged `BLOCK_MS`); cluster algorithm uses the passed value.
  - `server/src/app.ts` — `ccusageExtraArgs` push `--session-length <N>` when configured; native runner receives `sessionLengthHours` via opts.
  - `server/src/routes.ts` — new `GET /api/debug` (B12: returns generatedAt + health + snapshot recordCounts/derived hints + config + pricing marker); `/api/statusline` extended with `?cache=N` (server-side TTL cache) and `?refresh=N` (`Cache-Control: max-age=N` hint).
**AC tests landed:**
  - `server/src/native/__tests__/blocks-cluster.test.ts` ::: "R4.5 B16: sessionLengthHours=2 makes a 3h gap split a cluster (vs default 5h would not)"
  - `server/src/native/__tests__/blocks-cluster.test.ts` ::: "R4.5 B16: sessionLengthHours=0 or negative falls back to default 5h"
  - `server/src/__tests__/routes.test.ts` ::: "?cache=N serves the same payload to repeat requests within N seconds"
  - `server/src/__tests__/routes.test.ts` ::: "no ?cache= → no server-side caching (each request reads fresh)"
  - `server/src/__tests__/routes.test.ts` ::: "?refresh=N sets Cache-Control: max-age=<N>"
  - `server/src/__tests__/routes.test.ts` ::: "no ?refresh= → no Cache-Control header is set by the route"
  - `server/src/__tests__/routes.test.ts` ::: GET /api/debug · 3 tests (empty store, populated, with config)
**Surface grep proof:**
  - `grep -n "sessionLengthHours\|sessionMs" server/src/native/runner.ts` → 5 hits (interface field, opts plumb, buildBlocks/toRealBlock parameter, cluster threshold)
  - `grep -n "statuslineCache\|/api/debug\|cache=N\|refresh=N" server/src/routes.ts` → 4+ surface hits
**Smoke / e2e proof:** smoke-gate unaffected (block algorithm change is back-compat: default sessionMs preserved); 312/312 server tests green.
**Reviewer recount expectation:** +3.0 pp on B12/B16/B18/B19 (server-side) + 0.5 pp pending (B12 web link in web batch promotes from 0.5 to 1.0).
**Status:** committed — server-side flag passthroughs complete; B12 web link + B14 `id:` SessionTable prefix + B15 BlocksPanel Recent/All tabs scheduled for the web R4 batch (after R4.4 swap).

## R4.8 · Native `--mode display` / `--mode auto` polish — ALREADY SHIPPED in R3

**PRD v4 §1 reference:** R4.8
**Parity row(s) closed:** none direct (A13/A14/A15 already 1.0); unlocked R4.0.c apples-to-apples smoke gate.
**Effort estimate (PRD):** S (~3 h)
**Effort actual:** ~5 min verification — R4.8 work already shipped in R3 §D batch (`03ec63a` series).
**Commit SHA(s):** pre-R4 (R3 §D.5 / S-R2-2 closure batch); R4 itself touches no new code on this item.
**Files touched (pre-R4):**
  - `server/src/native/loader.ts:48-60` — `applyCostMode(e, mode)` already handles all 3 modes (`calculate` short-circuit, `display` trust-raw-or-zero, `auto` prefer-raw-fallback-recompute) per the JSDoc at line 22-37.
  - `server/src/native/__tests__/cost-mode.test.ts` — 10 unit tests covering AC4's 9-case matrix (3 modes × {costUSD present, null, absent}) + the bonus apples-to-apples cross-check.
**AC tests landed (pre-R4):**
  - `cost-mode.test.ts` ::: "`calculate` (default) always recomputes — ignores rawCostUSD"
  - `cost-mode.test.ts` ::: "`display` always uses rawCostUSD — bypasses recompute"
  - `cost-mode.test.ts` ::: "`display` treats null rawCostUSD as 0"
  - `cost-mode.test.ts` ::: "`display` treats absent rawCostUSD as 0"
  - `cost-mode.test.ts` ::: "`auto` prefers raw when finite"
  - `cost-mode.test.ts` ::: "`auto` falls back to recompute when raw is null"
  - `cost-mode.test.ts` ::: "`auto` falls back to recompute when raw is absent"
  - `cost-mode.test.ts` ::: "apples-to-apples: `calculate` and `auto-with-no-rawCostUSD` agree (R3 §D.2 closure)"
  - `cost-mode.test.ts` ::: "modes never mutate rawCostUSD (preserved verbatim on the cooked entry)"
**Surface grep proof:**
  - `grep -n "applyCostMode" server/src/native/loader.ts` → 3 hits (definition + 2 call sites in loadJsonlContent + loadJsonlFiles)
**Smoke / e2e proof:**
  - R4.0.c smoke harness (now 6/6 PASS) implicitly validates the `calculate` mode path on real data — that's what AC5 ("smoke band tightening folded into R4.0.c") asked for.
**Reviewer recount expectation:** 0 pp (no new parity uplift; correctness portion of A13/A14/A15 already 1.0).
**Status:** committed (pre-R4 in R3 §D batch); R4 verification confirms the implementation matches the R4.8.AC1-AC5 spec. PRD R4.8 is effectively a verification-only item this round — no new code, no smoke contract regression.

## R4.7 · A12 upstream wire-through trip (conditional, NOT FIRED in R4)

**PRD v4 §1 reference:** R4.7
**Parity row(s) closed:** A12 0.5 → 1.0 ONLY IF upstream lands `usage_limit_reset_time` before R4 review; otherwise stays 0.5.
**Effort estimate (PRD):** XS (~1 h conditional)
**Effort actual:** 5 min (probe + slip-plan)
**Commit SHA(s):** none (no code lands when conditional doesn't fire)
**Files touched:** none (R3.13 watch-CI workflow already in place at `.github/workflows/upstream-limit-reset-watch.yml` from R3.1's `84f25ef`)
**AC tests landed:** R3.13 unit + integration tests already cover the wire-through path; no new tests needed.
**Probe results (R4 implementer trip):**
  - `curl -sSfL https://ccusage.com/guide/blocks-reports | grep usage_limit_reset_time` → 0 hits
  - `ccusage claude blocks --json` schema inspection → field not yet emitted
**Disposition:** Per PRD R4.7.AC5: "If upstream hasn't landed by R4 review, closure-trace marks R4.7 as `partial (slip-plan slot opened)` with a forward-reference to upstream auto-PR. No silent drop."
**Reviewer recount expectation:** 0 pp (A12 stays 0.5; R5 absorbs whenever the watch-CI fires the auto-PR).
**Status:** **partial** — wire-through code already in place from R3.13; auto-fire mechanism is the weekly `upstream-limit-reset-watch.yml` workflow. R5 absorbs the +0.5 pp when upstream lands. Slip-plan slot opened at `r4-slip-plan.md#r4-7-conditional-not-fired`.

## R4.10 · Pricing snapshot refresh — Opus 4.x post-Nov rate reduction

**PRD v4 §1 reference:** R4.10
**Parity row(s) closed:** none direct (rows score off coverage, not freshness); closes gate-5 smoke 6/6 condition (was 3/6 post-R4.0.c)
**Effort estimate (PRD):** XS (~1 h)
**Effort actual:** ~30 min (probe + 6-line pricing edit + oracle bump + tests)
**Commit SHA(s):** (this commit)
**Files touched:**
  - `server/src/native/pricing-data.ts` — three Anthropic Opus entries (`claude-opus-4-5-20251101`, `claude-opus-4-6`, `claude-opus-4-7`) rate-reduced from `(15, 75, 18.75, 1.5)` per-M to `(5, 25, 6.25, 0.5)` per-M. `fast_multiplier=6.0` preserved on 4.6/4.7 (priority-tier amplifier is independent of the per-unit price cut, per upstream `pricing.rs:697-714`). `claude-opus-4-5` (no SHA) intentionally kept at pre-Nov rates as the historical fallback.
  - `server/src/__fixtures__/native/oracle.synthetic.json` — `opus-4-7-fast` row updated $0.315 → $0.105 (1/3 reduction); `totals.totalCost` 1.36795 → 1.15795. Comment extended with the R4.10 rationale.
  - `server/src/native/__tests__/pricing.test.ts` — existing `opus-4-7` row assertion updated to `5e-6`; new test pins the post-Nov rates for opus-4-5-20251101 AND opus-4-6/4-7 (3 model coverage + fast_multiplier preservation check).
  - `server/src/native/__tests__/parser.test.ts` — `fast_multiplier` cost expectation updated to `$0.105` (was `$0.315`).
  - `server/src/native/__tests__/cost.test.ts` — same rate change reflection.
**AC tests landed:**
  - `server/src/native/__tests__/pricing.test.ts` ::: "R4.10: claude-opus-4-5-20251101 carries post-Nov reduced rates (1/3 of pre-Nov)"
  - `server/src/native/__tests__/pricing.test.ts` ::: "R4.10: opus-4-6 / opus-4-7 inherit post-Nov reduced rates + preserve fast_multiplier=6.0"
**Surface grep proof:**
  - `grep -nE "claude-opus-4-[5-7]\"" server/src/native/pricing-data.ts` → 4 entries (4-5, 4-5-20251101, 4-6, 4-7); R4.10 reduction applied to the latter 3.
**Smoke / e2e proof:**
  - Pre R4.10 (post R4.0.c): 3 of 6 pass (block + token + smoke wiring); 3 cost FAILs all exact 1/3 ratio on Opus 4.x.
  - Post R4.10: **6 of 6 pass.** Empirical verification probe (`/tmp/probe10.mjs`): `claude-opus-4-7` aggregate cost went from `ours=$10818.75 theirs=$3606.57` (ratio 3.0) to within band; same for 4-6 and 4-5-20251101.
**Reviewer recount expectation:** 0 pp on parity matrix (rows score off coverage); +1 gate (gate-5 now 6/6 pass, was 5/6 fail at R3.1 close).
**Status:** committed — closes gate-5 smoke condition; opus-4-5-20251101 slip-plan entry now resolved (see `r4-slip-plan.md#opus-4-5-20251101-pricing-drift`).

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
