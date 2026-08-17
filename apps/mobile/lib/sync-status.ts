import type { AuthOutcome } from './session-guard';

export interface SyncStatus {
  pendingWrites: number;
  lastPushOutcome: AuthOutcome | null;
  lastSuccessfulPushAt: string | null;
}

let lastPushOutcome: AuthOutcome | null = null;
let lastSuccessfulPushAt: string | null = null;

// The connector calls this after each drain (SyncConnector.uploadData) — the one place a push
// outcome is known. No second connectivity concept: it branches on the same AuthOutcome union
// session-guard.ts already defines.
export function recordPushOutcome(outcome: AuthOutcome): void {
  lastPushOutcome = outcome;
  if (outcome === 'ok') {
    lastSuccessfulPushAt = new Date().toISOString();
  }
}

// Read-only state a future sync indicator renders. Never issues a network request — everything
// here is derived from local state the app already knows.
//
// pending-write-count.ts is required here, not imported at module top level: it reaches through
// to db/powersync.ts, whose @powersync/react-native import is ESM the mobile Jest config's
// transformIgnorePatterns doesn't cover. A static import would make merely requiring this file
// (which connector.ts does, for recordPushOutcome) drag that untransformable module into every
// test that loads the connector — including the existing crud-mapping suite that mocks nothing
// PowerSync-related. A plain require() call site defers resolution to call time and compiles to
// CommonJS either way, unlike a dynamic import() (which needs --experimental-vm-modules under
// this project's Jest config) — only a call to getSyncStatus itself pulls pending-write-count.ts
// in.
export async function getSyncStatus(): Promise<SyncStatus> {
  const { pendingWriteCount } = require('./pending-write-count') as typeof import('./pending-write-count');
  return {
    pendingWrites: await pendingWriteCount(),
    lastPushOutcome,
    lastSuccessfulPushAt,
  };
}
