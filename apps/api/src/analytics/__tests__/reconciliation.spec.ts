import { AnalyticsReconciliationService, affectedLocalDates, diffRecordKeys, type ReconcileSessionInput } from '../reconciliation.service';
import type { ReplayedRecord } from '../personal-record-replay';

function record(overrides: Partial<ReplayedRecord> & { loggedSetId: string; prType: ReplayedRecord['prType'] }): ReplayedRecord {
  return {
    exerciseId: 'ex-1',
    value: 100,
    achievedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// A tx double whose select resolves to an empty result set (no rows for input.sessionId — the
// production shape whenever the aggregate root genuinely has no children) and whose write methods
// fail loudly if ever invoked — the empty-input case must never reach a write.
function emptyTx() {
  const fail = () => {
    throw new Error('tx must not be written to when there is nothing to reconcile');
  };
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    }),
    insert: fail,
    delete: fail,
    execute: fail,
  } as never;
}

describe('affectedLocalDates', () => {
  it('is the non-null members of {oldLocalDate, newLocalDate}, deduplicated', () => {
    expect(affectedLocalDates({ oldLocalDate: '2026-08-20', newLocalDate: '2026-08-21' })).toEqual([
      '2026-08-20',
      '2026-08-21',
    ]);
  });

  it('dedupes when a PATCH left local_date unchanged', () => {
    expect(affectedLocalDates({ oldLocalDate: '2026-08-20', newLocalDate: '2026-08-20' })).toEqual(['2026-08-20']);
  });

  it('is a single date for a fresh session with no prior local_date', () => {
    expect(affectedLocalDates({ oldLocalDate: null, newLocalDate: '2026-08-21' })).toEqual(['2026-08-21']);
  });

  it('is a single date for a DELETE, where the new date is null', () => {
    expect(affectedLocalDates({ oldLocalDate: '2026-08-20', newLocalDate: null })).toEqual(['2026-08-20']);
  });

  it('is empty when both dates are null', () => {
    expect(affectedLocalDates({ oldLocalDate: null, newLocalDate: null })).toEqual([]);
  });
});

describe('diffRecordKeys', () => {
  it('a key present in both stored and replayed is an update, keeping the stored row id', () => {
    const stored = [{ id: 'stored-1', loggedSetId: 'set-1', prType: 'heaviest_weight' }];
    const replayed = [record({ loggedSetId: 'set-1', prType: 'heaviest_weight', value: 120 })];

    const diff = diffRecordKeys(stored, replayed);

    expect(diff.toUpdate).toEqual([{ id: 'stored-1', record: replayed[0] }]);
    expect(diff.toInsert).toEqual([]);
    expect(diff.toDelete).toEqual([]);
  });

  it('a key present only in the replay is an insert', () => {
    const replayed = [record({ loggedSetId: 'set-2', prType: 'best_e1rm', value: 130 })];

    const diff = diffRecordKeys([], replayed);

    expect(diff.toInsert).toEqual(replayed);
    expect(diff.toUpdate).toEqual([]);
    expect(diff.toDelete).toEqual([]);
  });

  it('a key present only in the stored ledger is a delete — the case the client is never allowed to do itself', () => {
    const stored = [{ id: 'stored-3', loggedSetId: 'set-3', prType: 'best_set_volume' }];

    const diff = diffRecordKeys(stored, []);

    expect(diff.toDelete).toEqual(['stored-3']);
    expect(diff.toInsert).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
  });

  it('a stored row with a NULL logged_set_id has no key to match on and is left untouched entirely', () => {
    const stored = [{ id: 'unkeyed', loggedSetId: null, prType: 'heaviest_weight' }];

    const diff = diffRecordKeys(stored, []);

    expect(diff.toDelete).toEqual([]);
    expect(diff.toInsert).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
  });

  it('an unchanged stored ledger against the same replay produces neither an insert nor a delete', () => {
    const stored = [{ id: 'stored-1', loggedSetId: 'set-1', prType: 'heaviest_weight' }];
    const replayed = [record({ loggedSetId: 'set-1', prType: 'heaviest_weight', value: 100 })];

    const diff = diffRecordKeys(stored, replayed);

    expect(diff.toInsert).toEqual([]);
    expect(diff.toDelete).toEqual([]);
    expect(diff.toUpdate).toHaveLength(1);
  });
});

describe('AnalyticsReconciliationService', () => {
  it('constructs with no arguments, so it stays constructible outside Nest\'s container', () => {
    expect(() => new AnalyticsReconciliationService()).not.toThrow();
  });

  it('reads the session\'s current children once but writes nothing when the push touched nothing at all', async () => {
    const service = new AnalyticsReconciliationService();
    const input: ReconcileSessionInput = {
      sessionId: 'session-1',
      touchedExerciseIds: [],
      oldLocalDate: null,
      newLocalDate: null,
      deleted: false,
    };

    await expect(service.reconcileSession(emptyTx(), 'user-1', input)).resolves.toBeUndefined();
  });

  it('a DELETE with no touched exercises and no affected dates returns without reading the session\'s children', async () => {
    const service = new AnalyticsReconciliationService();
    const input: ReconcileSessionInput = {
      sessionId: 'session-1',
      touchedExerciseIds: [],
      oldLocalDate: null,
      newLocalDate: null,
      deleted: true,
    };
    const fail = () => {
      throw new Error('a deleted aggregate must never read for children it knows are already gone');
    };
    const tx = { select: fail, insert: fail, delete: fail, execute: fail } as never;

    await expect(service.reconcileSession(tx, 'user-1', input)).resolves.toBeUndefined();
  });
});
