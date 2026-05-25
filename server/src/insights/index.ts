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
export { extractProject } from "./project.js";
export type { ExtractProjectInput } from "./project.js";
export { computeTodayDrivers } from "./drivers.js";
export type { TodayDrivers, DriverSegment, DriversInputs } from "./drivers.js";
export { computeSnapshotDeltas, previousPeriodKeys } from "./deltas.js";
export type { SnapshotDeltas, CardDelta, DeltaInputs } from "./deltas.js";
export { bucketHourly } from "./hourly.js";
export type { HourlyBucket, HourlyInputs } from "./hourly.js";
