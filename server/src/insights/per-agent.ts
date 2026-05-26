// R3.6 — lazy per-agent shellout with wall-clock budget.
//
// ## The contract (spec-v3 §3.2 + §1.4)
//
// When the user flips the "By agent" toggle, the UI fires a single
// fan-out call to this server function. The function runs 5 per-agent
// queries in parallel, each racing against the per-agent budget (800 ms
// default). A partial-success outcome is normal: fast agents win, slow
// agents land in `timedOut[]`. The UI renders what it has + a clear
// status footer; it does NOT silently render an "Unknown" series or
// silently flip the toggle back. That silent-failure shape is exactly
// the R1 S5 / R2 carryover this round closes.
//
// ## DO NOT 'simplify' to Promise.allSettled
//
// The naive pattern looks shorter but is structurally broken:
//
//   const winners = await Promise.race([
//     Promise.allSettled(AGENTS.map(...)),  // pending until ALL settle
//     timeout(800),                          // wins when ANY agent is slow
//   ]);
//
// `Promise.allSettled` resolves only when EVERY sub-promise settles. So
// a single slow agent makes the timeout win the race even when 4 of 5
// agents finished in 200 ms. Result: §3.2.2 partial-success state never
// renders — the exact silent-collapse this round is meant to prevent.
//
// The correct pattern (below) races EACH agent individually against the
// per-agent budget, then collects with `Promise.all`. Designer reviewed +
// signed off; canary tests in __tests__/per-agent.test.ts assert that
// the right pattern survives `partial`, `timeout`, `fail` branches.
//
// Test runbook: docs/swarm/r3-per-agent-runbook.md

export const PER_AGENT_BUDGET_MS = 800;

export type PerAgentStatus = "ok" | "partial" | "timeout";

export type AgentResult<TData = unknown> =
  | { status: "ok";      agent: string; data: TData }
  | { status: "fail";    agent: string; err: Error }
  | { status: "timeout"; agent: string };

export interface PerAgentSummary<TData = unknown> {
  status: PerAgentStatus;
  succeeded: Array<{ agent: string; data: TData }>;
  failed:    Array<{ agent: string; err: Error }>;
  timedOut:  Array<{ agent: string }>;
  elapsedMs: number;
  budgetMs: number;
}

/**
 * A single per-agent task. Receives an AbortSignal that fires at the
 * budget; the task SHOULD respect it (e.g. forward to child.kill via
 * the runner) to avoid zombie processes. Failure to respect the signal
 * is non-fatal — the race will land in `timedOut[]` either way.
 */
export type PerAgentTask<TData> = (agent: string, signal: AbortSignal) => Promise<TData>;

export interface ShellPerAgentOptions<TData> {
  /** Agents to fan out across. */
  agents: readonly string[];
  /** Per-agent task factory. */
  task: PerAgentTask<TData>;
  /** Override the wall-clock budget. Default 800 ms (spec-v3 §1.4). */
  budgetMs?: number;
  /** Injection point for tests; defaults to wall-clock `Date.now`. */
  now?: () => number;
}

/**
 * Race each agent against the budget INDIVIDUALLY (not allSettled vs
 * timeout — see header comment for why). Returns a tagged-union summary
 * that the route layer can hand to the UI verbatim.
 *
 * The `AbortController` plumbing is shared across all agents so a single
 * SIGTERM can ripple through any in-flight ccusage shellouts at the
 * budget mark. Without this, slow shellouts would zombie post-budget.
 */
export async function shellPerAgent<TData>(
  opts: ShellPerAgentOptions<TData>,
): Promise<PerAgentSummary<TData>> {
  const budgetMs = opts.budgetMs ?? PER_AGENT_BUDGET_MS;
  const now = opts.now ?? Date.now;
  const start = now();

  const ctrl = new AbortController();
  const abortTimer = setTimeout(() => ctrl.abort(), budgetMs);

  const tasks: Promise<AgentResult<TData>>[] = opts.agents.map((agent) =>
    Promise.race<AgentResult<TData>>([
      opts.task(agent, ctrl.signal)
        .then((data): AgentResult<TData> => ({ status: "ok", agent, data }))
        .catch((err): AgentResult<TData> => ({ status: "fail", agent, err: err instanceof Error ? err : new Error(String(err)) })),
      new Promise<AgentResult<TData>>((resolve) =>
        setTimeout(() => resolve({ status: "timeout", agent }), budgetMs),
      ),
    ])
  );

  // `Promise.all` here is safe — each task self-resolves within budgetMs
  // by construction (the inner race always finishes the agent's slot).
  const settled = await Promise.all(tasks);
  clearTimeout(abortTimer);

  const succeeded: Array<{ agent: string; data: TData }> = [];
  const failed:    Array<{ agent: string; err: Error }> = [];
  const timedOut:  Array<{ agent: string }> = [];
  for (const s of settled) {
    if (s.status === "ok")        succeeded.push({ agent: s.agent, data: s.data });
    else if (s.status === "fail") failed.push({ agent: s.agent, err: s.err });
    else                          timedOut.push({ agent: s.agent });
  }

  const status: PerAgentStatus =
    succeeded.length === opts.agents.length ? "ok" :
    succeeded.length === 0                  ? "timeout" :
                                              "partial";

  return {
    status,
    succeeded, failed, timedOut,
    elapsedMs: now() - start,
    budgetMs,
  };
}
