// R3.6 canary tests for `shellPerAgent`.
//
// ## Why these tests exist
//
// Designer flagged the naive pattern (`Promise.race([allSettled, timeout])`)
// silently collapses to "all-timeout" whenever any single agent is slow,
// because `allSettled` is pending until EVERY sub-promise settles. That's
// the §3.2.2 partial-success-never-renders failure class — exactly the
// silent-failure shape R3 is meant to close.
//
// ## DO NOT delete these tests as redundant
//
// These tests are **property-based regression guards**, not behavioral
// tests for one happy path. They exist specifically to catch the
// "let's clean up the race pattern back to `allSettled`" refactor that
// would re-introduce the silent collapse. If you find yourself thinking
// "this just tests obvious behavior," re-read the header comment of
// `per-agent.ts` — the obvious-looking simplification is the bug.
//
// The three branches (`partial`, `timeout`, `fail`) each pin a distinct
// UI render path per spec-v3 §3.2.2 / §3.2.3 / §3.2.4. Reviewer's
// convergence-criticality posture means the canaries must survive
// future "simplifications".

import { describe, it, expect } from "vitest";
import { shellPerAgent, PER_AGENT_BUDGET_MS } from "../per-agent";

// Helpers: synthetic agent tasks that exercise each branch deterministically.
const fast = <T>(value: T, ms = 50) =>
  (_a: string, _s: AbortSignal): Promise<T> => new Promise((r) => setTimeout(() => r(value), ms));

// A slow task: ignores AbortSignal for the *resolution* race (so the
// outer `setTimeout(timeout)` is what wins) but still cleans up the
// inner timer if aborted so we don't leak handles. This mirrors a
// real ccusage shellout: the task's promise stays pending after the
// budget; the race timeout is what produces the "timeout" status.
// AbortSignal's job is the side-effect (kill child) — covered by its
// own test below.
const slowerThanBudget = <T>(value: T, ms = 1500) =>
  (_a: string, signal: AbortSignal): Promise<T> => new Promise((resolve) => {
    const t = setTimeout(() => resolve(value), ms);
    signal.addEventListener("abort", () => clearTimeout(t));
  });

const throws = (msg: string) =>
  (_a: string, _s: AbortSignal): Promise<never> => Promise.reject(new Error(msg));

const AGENTS = ["claude", "codex", "gemini", "copilot", "openclaw"] as const;

describe("shellPerAgent — race pattern (spec-v3 §3.2 state machine)", () => {
  // §3.2 "all-success" path.
  it("all 5 fast → status='ok', succeeded.length === 5, others empty", async () => {
    const out = await shellPerAgent({
      agents: AGENTS,
      task: fast({ ok: 1 }),
      budgetMs: 200,
    });
    expect(out.status).toBe("ok");
    expect(out.succeeded).toHaveLength(5);
    expect(out.failed).toHaveLength(0);
    expect(out.timedOut).toHaveLength(0);
  });

  // §3.2.2 PARTIAL-SUCCESS path. This is THE canary for the
  // `Promise.allSettled` regression — must fail on the naive pattern.
  // With the correct per-agent race, 4 of 5 finish in 50 ms and 1 takes
  // 1500 ms; the slow one lands in `timedOut[]` at 200 ms, while the
  // others contribute to `succeeded[]`.
  //
  // If a future refactor flips to `Promise.race([allSettled, timeout])`,
  // this test goes from green to red: status === "timeout" with
  // succeeded.length === 0 (because allSettled never resolved before
  // the outer timeout fired). That regression is exactly what we're
  // guarding against.
  it("4 fast + 1 slow → status='partial', fast agents preserved (CANARY for Promise.allSettled regression)", async () => {
    const out = await shellPerAgent({
      agents: AGENTS,
      task: (agent: string, signal: AbortSignal) =>
        agent === "openclaw"
          ? slowerThanBudget({ slow: true }, 1500)(agent, signal)
          : fast({ ok: 1 }, 50)(agent, signal),
      budgetMs: 200,
    });
    expect(out.status).toBe("partial");
    expect(out.succeeded).toHaveLength(4);
    expect(out.timedOut).toHaveLength(1);
    expect(out.timedOut[0]?.agent).toBe("openclaw");
    expect(out.failed).toHaveLength(0);
  });

  // §3.2.4 ALL-TIMEOUT path.
  it("all 5 slower than budget → status='timeout', timedOut.length === 5", async () => {
    const out = await shellPerAgent({
      agents: AGENTS,
      task: slowerThanBudget({ slow: true }, 1500),
      budgetMs: 200,
    });
    expect(out.status).toBe("timeout");
    expect(out.succeeded).toHaveLength(0);
    expect(out.timedOut).toHaveLength(5);
  });

  // §3.2.3 PER-AGENT FAILURE path — distinct from timeout. A thrown
  // error means the agent errored (e.g. ccusage exit-non-zero), not
  // that it was abandoned at the budget mark. UI renders the legend
  // entry with line-through + tooltip; timeout shows in the footer.
  it("4 fast + 1 throws → status='partial' with failed[] separate from timedOut[]", async () => {
    const out = await shellPerAgent({
      agents: AGENTS,
      task: (agent: string, signal: AbortSignal) =>
        agent === "gemini"
          ? throws("ccusage exit 2")(agent, signal)
          : fast({ ok: 1 })(agent, signal),
      budgetMs: 200,
    });
    expect(out.status).toBe("partial");
    expect(out.succeeded).toHaveLength(4);
    expect(out.failed).toHaveLength(1);
    expect(out.failed[0]?.agent).toBe("gemini");
    expect(out.failed[0]?.err.message).toBe("ccusage exit 2");
    expect(out.timedOut).toHaveLength(0); // CRUCIAL: failure ≠ timeout
  });

  // The budget MUST bound wall-clock — even if every agent is slow,
  // the function returns within ~budgetMs + overhead. Asserts the
  // outer `Promise.all` of inner races doesn't extend the wall-clock.
  it("wall-clock bounded by budgetMs even when all agents are slow", async () => {
    const t0 = Date.now();
    await shellPerAgent({
      agents: AGENTS,
      task: slowerThanBudget({ slow: true }, 5000),
      budgetMs: 150,
    });
    const elapsed = Date.now() - t0;
    // Allow ~100ms slack for scheduler + Promise hop overhead.
    expect(elapsed).toBeLessThan(300);
  });

  it("AbortSignal fires at the budget so tasks can cancel their child processes", async () => {
    let abortFiredForAgent: string | null = null;
    await shellPerAgent({
      agents: ["one"],
      task: (agent, signal) => new Promise((resolve) => {
        signal.addEventListener("abort", () => { abortFiredForAgent = agent; });
        setTimeout(() => resolve(null), 2000);
      }),
      budgetMs: 100,
    });
    // Give the abort event one microtask to surface after the budget.
    await new Promise((r) => setTimeout(r, 20));
    expect(abortFiredForAgent).toBe("one");
  });

  it("default budget is 800 ms (spec-v3 §1.4)", () => {
    expect(PER_AGENT_BUDGET_MS).toBe(800);
  });

  it("preserves agent identity in the order they were passed", async () => {
    const out = await shellPerAgent({
      agents: ["a", "b", "c"],
      task: fast(0, 10),
      budgetMs: 200,
    });
    expect(out.succeeded.map((s) => s.agent)).toEqual(["a", "b", "c"]);
  });

  it("succeeded[].data is the raw task return value", async () => {
    const out = await shellPerAgent({
      agents: ["x"],
      task: fast({ total: 42 }),
      budgetMs: 200,
    });
    expect(out.succeeded[0]?.data).toEqual({ total: 42 });
  });
});
