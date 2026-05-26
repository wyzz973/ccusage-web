# R3 · Per-Agent Race Runbook

**Audience:** future maintainers tempted to "simplify" `server/src/insights/per-agent.ts`. Read this before you touch that file.

## TL;DR

The per-agent shellout uses an **individual-race-per-agent** pattern, not `Promise.race([Promise.allSettled, timeout])`. The naive pattern silently collapses to all-timeout whenever any one agent is slow. Designer caught it during R3 review; the canary tests in `__tests__/per-agent.test.ts` enforce the correct shape.

## The bug we're guarding against

```ts
// ❌ The "obvious" simplification — DO NOT REINTRODUCE
const winners = await Promise.race([
  Promise.allSettled(AGENTS.map(t => task(t))),
  new Promise(r => setTimeout(() => r("timeout"), 800)),
]);
```

`Promise.allSettled` returns a single promise that stays pending until **every** inner promise settles. So a single slow agent (1.5 s) makes the timeout win the outer race even when 4 of 5 agents finished in 200 ms. The UI sees `status="timeout"`, `succeeded=[]`, even though 80% of the data is in hand.

That's exactly the silent-failure shape spec-v3 §3.2.2 closes. Don't reopen it.

## The correct pattern

```ts
// ✅ Each agent self-resolves within budget
const tasks = AGENTS.map(agent =>
  Promise.race([
    task(agent).then(d => ({status:"ok", agent, data:d}))
               .catch(e => ({status:"fail", agent, err:e})),
    new Promise(r => setTimeout(() => r({status:"timeout", agent}), 800)),
  ])
);
const settled = await Promise.all(tasks);
```

`Promise.all` is safe here because each inner race **always** settles within `budgetMs` by construction (the inner `setTimeout` is the floor). Fast agents land in `succeeded[]`; slow ones in `timedOut[]`; thrown errors in `failed[]` (distinct from timeout — the UI renders them differently per §3.2.3).

## The AbortController plumbing

A single `AbortController` fires at the budget, and its signal is passed into every task. The runner forwards it to `child.kill("SIGTERM")` (then `SIGKILL` after 1 s) so slow shellouts don't zombie post-budget. This is **separate** from the timeout race — the race produces the "timeout" status; the AbortController cleans up the IO.

Failure to honor the signal is non-fatal: the race lands in `timedOut[]` regardless. The signal is for resource hygiene.

## Canary tests

`server/src/insights/__tests__/per-agent.test.ts` — nine tests. The critical one is:

> **"4 fast + 1 slow → status='partial', timedOut.length === 1"**

This test MUST fail on the naive `allSettled` pattern. If you find yourself staring at a refactor that "cleans up the verbose race," run this test against your refactor before committing. If it goes red, the refactor is the regression.

## Wall-clock contract

`/api/per-agent` is wall-clock-bounded by `budgetMs + scheduler-overhead`. The route test pins the empty-fan-out shape at 800 ms (spec-v3 §1.4 default). The UI's TrendChart state machine assumes this — if you raise the budget, raise it in **one** place (`PER_AGENT_BUDGET_MS` in `per-agent.ts`) and verify the e2e `web/tests/e2e/per-agent-budget.spec.ts` still passes.

## Future work (R4 candidates)

1. Swap the route's in-memory task body for a real `runCcusage("session", { extraArgs: ["--agent", agent], signal })` once ccusage gains `--agent` flag support. The race wrapper is already forward-compatible — no changes needed there.
2. Adaptive budget: shrink to 400 ms when the wall-clock for the last 5 polls averaged < 200 ms; expand to 1200 ms after a partial-timeout. (Currently fixed.)
3. Per-agent caching: skip the shellout if the snapshot's `detectedAgents` set hasn't changed since the last per-agent fetch. (Currently re-fans-out every toggle.)
