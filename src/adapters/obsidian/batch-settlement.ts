import type { App } from "obsidian";

// The App outlives plugin module reloads. A module-local queue would let a newly
// enabled instance read/replace recovery while the old instance is settling it.
const SETTLEMENT = Symbol.for("number-suite.batch-settlement.v1");
interface SettlementState { pending: Promise<void> | null }
type SettlementHost = App & { [SETTLEMENT]?: SettlementState };

/** Hold the recovery owner until dispatched writes and compensation have settled. */
export async function withBatchSettlement(app: App, operation: () => Promise<void>): Promise<void> {
  const host = app as SettlementHost;
  let state = host[SETTLEMENT];
  if (state === undefined) {
    state = { pending: null };
    Object.defineProperty(host, SETTLEMENT, { value: state });
  }
  const previous = state.pending;
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  state.pending = current;
  try {
    if (previous !== null) await previous;
    await operation();
  } finally {
    if (state.pending === current) state.pending = null;
    release();
  }
}
