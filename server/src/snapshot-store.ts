import type { Snapshot, HealthInfo } from "./types";

export type Listener = (snap: Snapshot) => void;

export interface SnapshotStore {
  get(): Snapshot | null;
  set(snap: Snapshot): void;
  recordError(message: string): void;
  getHealth(): HealthInfo;
  subscribe(fn: Listener): () => void;
}

export function createSnapshotStore(): SnapshotStore {
  let current: Snapshot | null = null;
  let lastError: string | null = null;
  const listeners = new Set<Listener>();

  return {
    get() { return current; },
    set(snap) {
      if (current && current.generatedAt === snap.generatedAt) return;
      current = snap;
      lastError = null;
      for (const l of listeners) l(snap);
    },
    recordError(message) {
      lastError = message;
    },
    getHealth() {
      return {
        status: lastError ? "degraded" : "ok",
        lastPollAt: current?.generatedAt ?? null,
        lastError,
      };
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}
