import { AnalyticsReconciliationService, affectedLocalDates, type ReconcileSessionInput } from '../reconciliation.service';

function unusedTx() {
  const fail = () => {
    throw new Error('tx must not be touched when affectedDates is empty');
  };
  return { select: fail, insert: fail, delete: fail } as never;
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

describe('AnalyticsReconciliationService', () => {
  it('constructs with no arguments, so it stays constructible outside Nest\'s container', () => {
    expect(() => new AnalyticsReconciliationService()).not.toThrow();
  });

  it('returns immediately, touching no database, when the affected-date set is empty', async () => {
    const service = new AnalyticsReconciliationService();
    const input: ReconcileSessionInput = {
      sessionId: 'session-1',
      touchedExerciseIds: [],
      oldLocalDate: null,
      newLocalDate: null,
      deleted: false,
    };

    await expect(service.reconcileSession(unusedTx(), 'user-1', input)).resolves.toBeUndefined();
  });
});
