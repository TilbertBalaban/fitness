import type {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from '@powersync/common';
import {
  SYNC_PUSH_PATH,
  isTerminalRejection,
  type SyncCrudOp,
  type SyncCrudOpType,
  type SyncPushRequest,
  type SyncPushResponse,
} from '@fitness/api-contracts';
import { apiFetch } from '../api-client';
import { API_URL } from '../auth-storage';
import { recordPushOutcome, recordRejectedOps } from '../sync-status';

// @fitness/api-contracts exports bare paths (no origin) — every other apiFetch call site in this
// app (auth-storage.ts's AUTH_ENDPOINT, sign-out.ts, _layout.tsx) builds a full URL from API_URL
// first. A bare path passed straight to fetch() resolves against the CURRENT PAGE's own origin on
// web, not the API — a real, previously-unexercised bug (both calls below 404'd against the Expo
// dev server's own origin the first time this connector actually ran in a real browser).
const SYNC_TOKEN_PATH = `${API_URL}/v1/sync/token`;

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
    // fetch() defaults an unlabeled string body to `Content-Type: text/plain` — Nest's JSON
    // body-parser only parses application/json, so without this header `body` arrives as
    // undefined server-side (TypeError: Cannot read properties of undefined (reading 'batch')),
    // a bug this connector never hit before it first ran against a real HTTP server in a browser.
    const { response, outcome } = await apiFetch(`${API_URL}${SYNC_PUSH_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (outcome !== 'ok' || !response) {
      recordPushOutcome(outcome);
      // 'offline' -> leave queued for the next connectivity event (D-09's transport-failure
      // branch). 'revoked' -> routes to the same session-invalidation path Phase 1 already built.
      // 'rejected' -> a genuine validation failure; surfaced by leaving the transaction queued
      // rather than completed, but does not retry in a tight loop — PowerSync's own retry cadence
      // (default 5s wait) governs the next attempt, so this branch adds no extra retry logic.
      return;
    }

    // A completed HTTP 2xx is not the same as "every op in this transaction was accepted" —
    // POST /v1/sync/push always returns 2xx and puts per-op failures in the body's `rejected`
    // array (CR-01). An unreadable body is not evidence of success either.
    let result: SyncPushResponse;
    try {
      result = (await response.json()) as SyncPushResponse;
    } catch {
      recordPushOutcome(outcome, true);
      return;
    }

    const rejected = result.rejected ?? [];
    if (rejected.length === 0) {
      recordPushOutcome(outcome, false);
      await transaction.complete();
      return;
    }

    // op_id is transaction.crud's clientId stringified (toSyncCrudOp) — the same mapping recovers
    // which table each rejection belongs to without a new field on the wire.
    const tableByOpId = new Map(transaction.crud.map((entry) => [String(entry.clientId), entry.table]));
    recordRejectedOps(
      rejected.map((r) => ({
        opId: r.op_id,
        reason: r.reason,
        table: tableByOpId.get(r.op_id) ?? '',
        recordedAt: new Date().toISOString(),
      })),
    );
    recordPushOutcome(outcome, true);

    // A curable rejection (missing_parent, batch_too_large, or an unrecognized table name that a
    // later deploy might add) must not be completed away — that would permanently discard a write
    // that could still succeed. An incurable one (not_owner, invalid_field, deleted, or a known
    // PUSH_DEFERRED_TABLES table) is recorded above and completed here so the queue does not retry
    // it forever.
    const allTerminal = rejected.every((r) => isTerminalRejection(r.reason, tableByOpId.get(r.op_id) ?? ''));
    if (allTerminal) {
      await transaction.complete();
    }
  }
}
