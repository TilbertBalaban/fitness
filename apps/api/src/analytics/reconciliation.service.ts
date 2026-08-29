import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { muscleVolumeCells } from '@fitness/analytics-engine';
import type { Database } from '../db/drizzle.module';
import { analyticsWatermark, watermarkId } from '../db/schema/analytics';
import { loadSessionsForDates, writeRollupCells } from './muscle-volume';

type QueryExecutor = Pick<Database, 'select' | 'insert' | 'delete'>;

export interface ReconcileSessionInput {
  sessionId: string;
  touchedExerciseIds: string[];
  oldLocalDate: string | null;
  newLocalDate: string | null;
  deleted: boolean;
}

// Pure and exported so its dedup/absence behaviour is unit-testable with no database: the
// non-null members of {oldLocalDate, newLocalDate}, deduplicated. Empty exactly when a push
// touched neither an old nor a new local_date — the empty-input early return below.
export function affectedLocalDates(input: Pick<ReconcileSessionInput, 'oldLocalDate' | 'newLocalDate'>): string[] {
  return [...new Set([input.oldLocalDate, input.newLocalDate].filter((date): date is string => date !== null))];
}

// The server-authoritative recompute entry point invoked from inside applyBatch's aggregate
// transaction. No-argument constructor so it stays constructible outside Nest's container,
// exactly as SyncService's own default parameter needs (the three existing `new SyncService(db)`
// call sites must keep compiling untouched).
@Injectable()
export class AnalyticsReconciliationService {
  async reconcileSession(tx: QueryExecutor, userId: string, input: ReconcileSessionInput): Promise<void> {
    // Reconciliation must NOT re-check ownership: applyBatch has already rejected every op whose
    // aggregate root the pushing user does not own, before this method is ever called, and a
    // second independently-trusted lookup here is exactly the pattern 10-RESEARCH's Security
    // Domain forbids — userId is the server-resolved session id this method receives, never a
    // payload field.
    const affectedDates = affectedLocalDates(input);
    if (affectedDates.length === 0) return;

    const sessions = await loadSessionsForDates(tx, userId, affectedDates);
    const cells = muscleVolumeCells(sessions);
    await writeRollupCells(tx, userId, affectedDates, cells);

    const maxAffectedDate = affectedDates.reduce((max, date) => (date > max ? date : max));
    const nextSeq = sql`nextval('sync_seq')`;
    await tx
      .insert(analyticsWatermark)
      .values({
        id: watermarkId(userId),
        userId,
        computedThroughDate: maxAffectedDate,
        serverSeq: nextSeq,
      })
      .onConflictDoUpdate({
        target: analyticsWatermark.id,
        set: {
          computedThroughDate: sql`GREATEST(${analyticsWatermark.computedThroughDate}, excluded.computed_through_date)`,
          serverSeq: nextSeq,
        },
      });

    await this.reconcilePersonalRecords(tx, userId, input);
  }

  // Seam for 10-02: replaying detectPrs/foldPriorBest (@fitness/pr-rules) over
  // input.touchedExerciseIds. Currently a no-op — this plan implements the rollup half only, so
  // the later plan extends this method rather than restructuring reconcileSession's call shape.
  private async reconcilePersonalRecords(_tx: QueryExecutor, _userId: string, _input: ReconcileSessionInput): Promise<void> {
    return;
  }
}
