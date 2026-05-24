import { create } from "zustand";
import type { Snapshot } from "@/types";
import type { ConnectionStatus } from "@/lib/sse";

interface UsageState {
  snapshot: Snapshot | null;
  connectionStatus: ConnectionStatus;
  lastError: string | null;
  lastSuccessAt: string | null;
  setSnapshot: (s: Snapshot) => void;
  setStatus: (s: ConnectionStatus) => void;
  setError: (msg: string | null, lastSuccessAt: string | null) => void;
}

export const useUsageStore = create<UsageState>((set) => ({
  snapshot: null,
  connectionStatus: "connecting",
  lastError: null,
  lastSuccessAt: null,
  setSnapshot: (s) => set({ snapshot: s, lastSuccessAt: s.generatedAt, lastError: null }),
  setStatus: (s) => set({ connectionStatus: s }),
  setError: (msg, lastSuccessAt) => set({ lastError: msg, lastSuccessAt }),
}));
