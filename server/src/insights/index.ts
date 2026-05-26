// Public surface of the `insights` module.
//
// This module is the data layer that augments `Snapshot.derived` with
// fields the v1 UI consumes. Everything here is a pure function — no
// process, no clock except for `now` parameters — so tests are trivial.

export {
  getTodayKey, getMonthKey,
  getWeekStartKey, getISOWeekNumberKey,
  getISOWeekKey, // deprecated alias, retained for back-compat
} from "./period-keys.js";
export { extractProject, decodeProject } from "./project.js";
export type { ExtractProjectInput, DecodedProject, DisplayNameSource } from "./project.js";
export { computeProjectRollups } from "./projects.js";
export type { ProjectRollup, ProjectsInputs } from "./projects.js";
export { computeCacheInsight } from "./cache.js";
export type { CacheInsight, CacheInputs } from "./cache.js";
export { computeLimitResetInsight } from "./limit-reset.js";
export type { LimitResetInsight, LimitResetInputs } from "./limit-reset.js";
export { computeTodayDrivers } from "./drivers.js";
export type { TodayDrivers, DriverSegment, DriversInputs } from "./drivers.js";
export { computeSnapshotDeltas, previousPeriodKeys } from "./deltas.js";
export type { SnapshotDeltas, CardDelta, DeltaInputs } from "./deltas.js";
export { bucketHourly } from "./hourly.js";
export type { HourlyBucket, HourlyInputs } from "./hourly.js";
export { computeDetectedAgents } from "./detected-agents.js";
export type { DetectedAgentsInputs } from "./detected-agents.js";
export { computeBudgetInsight } from "./budget.js";
export type { BudgetInsight, BudgetInputs } from "./budget.js";
export {
  shellPerAgent, PER_AGENT_BUDGET_MS,
  type PerAgentStatus, type AgentResult,
  type PerAgentSummary, type PerAgentTask, type ShellPerAgentOptions,
} from "./per-agent.js";
export { loadConfig, findProjectConfig } from "./config-loader.js";
export type { Config, LoadedConfig, ConfigLoaderDeps } from "./config-loader.js";
