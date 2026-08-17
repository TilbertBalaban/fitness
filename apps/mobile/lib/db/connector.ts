import type {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from '@powersync/common';
import { SYNC_PUSH_PATH, type SyncCrudOp, type SyncCrudOpType, type SyncPushRequest } from '@fitness/api-contracts';
import { apiFetch } from '../api-client';
import { recordPushOutcome } from '../sync-status';

const SYNC_TOKEN_PATH = '/v1/sync/token';

function toSyncCrudOp(entry: CrudEntry): SyncCrudOp {
  return {
    op_id: String(entry.clientId),
    op: entry.op as SyncCrudOpType,
    type: entry.table,
    id: entry.id,
    data: entry.opData ?? null,
  };
}

// The PowerSync backend connector — the only function that ever calls the mutating sync
// endpoint (D-01). uploadData never calls fetch directly and never introduces a second
// definition of offline: the push outcome is branched on the existing AuthOutcome union.
export class SyncConnector implements PowerSyncBackendConnector {
  // 'revoked' -> null (not signed in, per the SDK's own contract); every other non-ok outcome
  // throws so PowerSync's own retry cadence governs the next attempt, same as uploadData never
  // adding a second retry loop of its own. A failure here only ever affects pull — it never
  // touches the crud queue, so a local write keeps working with the service unreachable (T-02-29).
  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const { response, outcome } = await apiFetch(SYNC_TOKEN_PATH);
    if (outcome === 'revoked') return null;
    if (outcome !== 'ok' || !response) {
      throw new Error(`Unable to fetch a PowerSync sync token (outcome: ${outcome})`);
    }
    const { token, endpoint } = (await response.json()) as { token: string; endpoint: string };
    return { endpoint, token };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    const body: SyncPushRequest = { batch: transaction.crud.map(toSyncCrudOp) };
    const { outcome } = await apiFetch(SYNC_PUSH_PATH, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    recordPushOutcome(outcome);

    if (outcome === 'ok') {
      await transaction.complete();
      return;
    }
    // 'offline' -> leave queued for the next connectivity event (D-09's transport-failure branch).
    // 'revoked' -> routes to the same session-invalidation path Phase 1 already built.
    // 'rejected' -> a genuine validation failure; surfaced by leaving the transaction queued
    // rather than completed, but does not retry in a tight loop — PowerSync's own retry cadence
    // (default 5s wait) governs the next attempt, so this branch adds no extra retry logic.
  }
}
