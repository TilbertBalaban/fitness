import { Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { muscleVolumeCells } from '@fitness/analytics-engine';
import type { Database } from '../db/drizzle.module';
import { analyticsWatermark, watermarkId } from '../db/schema/analytics';
import { personalRecord } from '../db/schema/records';
import { sessionExercise, workoutSession } from '../db/schema/session';
import { loadSessionsForDates, writeRollupCells } from './muscle-volume';
import { loadExerciseSetHistory, replayPersonalRecords, type ReplayedRecord } from './personal-record-replay';

type QueryExecutor = Pick<Database, 'select' | 'insert' | 'delete' | 'execute'>;

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

interface StoredRecordKey {
  id: string;
  loggedSetId: string | null;
  prType: string;
}

export interface RecordKeyDiff {
  toInsert: ReplayedRecord[];
  toUpdate: { id: string; record: ReplayedRecord }[];
  toDelete: string[];
}

// The pure three-way decision the whole PR reconcile hinges on, exported so it is unit-testable
// with no database. Keyed by `${loggedSetId}:${prType}` — the same idempotency key
// detectPrsForSession proved client-side (Phase 5, apps/mobile/lib/db/personal-record.ts),
// restated here against Drizzle/Postgres rather than reused, because that function is typed
// against PowerSync's SQLite proxy. A stored row whose logged_set_id is NULL has no key to match
// on and is left untouched entirely by both sides of this diff: deleting an unkeyed row would
// destroy history the fresh replay simply has no opinion about.
export function diffRecordKeys(stored: StoredRecordKey[], replayed: ReplayedRecord[]): RecordKeyDiff {
  const key = (loggedSetId: string, prType: string) => `${loggedSetId}:${prType}`;

  const storedByKey = new Map<string, StoredRecordKey>();
  for (const row of stored) {
    if (row.loggedSetId === null) continue;
    storedByKey.set(key(row.loggedSetId, row.prType), row);
  }

  const replayedByKey = new Map<string, ReplayedRecord>();
  for (const record of replayed) {
    replayedByKey.set(key(record.loggedSetId, record.prType), record);
  }

  const toInsert: ReplayedRecord[] = [];
  const toUpdate: { id: string; record: ReplayedRecord }[] = [];
  for (const [matchKey, record] of replayedByKey) {
    const existing = storedByKey.get(matchKey);
    if (existing) {
      toUpdate.push({ id: existing.id, record });
    } else {
      toInsert.push(record);
    }
  }

  const toDelete: string[] = [];
  for (const [matchKey, row] of storedByKey) {
    if (!replayedByKey.has(matchKey)) toDelete.push(row.id);
  }

  return { toInsert, toUpdate, toDelete };
}

// The same 3-place decimal-string scale personal_record.value's Postgres column enforces
// (numeric(10,3)) — mirrors the client's own formatPrValue (apps/mobile/lib/db/personal-record.ts)
// so a value never accumulates binary-float error crossing this write boundary either.
function formatPrValue(value: number): string {
  return value.toFixed(3);
}

// Deterministic so a re-run of the same replay always names the same row rather than minting a
// duplicate: userId, exerciseId, prType and loggedSetId joined by colons, mirroring
// rollupId/watermarkId's own "deterministic ids so no call site spells the wire format itself"
// convention (apps/api/src/db/schema/analytics.ts).
function personalRecordId(userId: string, record: ReplayedRecord): string {
  return [userId, record.exerciseId, record.prType, record.loggedSetId].join(':');
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
    let affectedDates = affectedLocalDates(input);
    const touchedExerciseIds = new Set(input.touchedExerciseIds);

    // input.touchedExerciseIds and old/newLocalDate are gathered ONLY from ops actually present
    // in this push's batch (apps/api/src/sync/sync.service.ts lines 1673-1902) — a lone
    // session_exercise/logged_set edit with no accompanying workout_session op (the ordinary
    // shape of "I fat-fingered a weight", and also LOG-21's bare local_date-only backfill in the
    // opposite direction) leaves one or both of those call-site inputs empty. Reading the
    // session's CURRENT session_exercise rows joined to its CURRENT local_date, in one select,
    // rescues both shapes at once: it supplies the exercise ids a lone child-row edit never
    // reported, and it supplies the date a lone child-row edit never touched either. Skipped when
    // the row is already gone (input.deleted) — the call site already gathered those ids before
    // the cascade removed them, and there is nothing left here to read.
    if (!input.deleted) {
      const currentSessionExercises = await tx
        .select({ exerciseId: sessionExercise.exerciseId, localDate: workoutSession.localDate })
        .from(sessionExercise)
        .innerJoin(workoutSession, eq(sessionExercise.sessionId, workoutSession.id))
        .where(eq(sessionExercise.sessionId, input.sessionId));

      for (const row of currentSessionExercises) touchedExerciseIds.add(row.exerciseId);
      if (affectedDates.length === 0 && currentSessionExercises.length > 0) {
        affectedDates = [currentSessionExercises[0].localDate];
      }
    }

    // Return early, before any WRITE statement, when there is genuinely nothing this push could
    // have changed on either side of the recompute.
    if (affectedDates.length === 0 && touchedExerciseIds.size === 0) return;

    if (affectedDates.length > 0) {
      // Delete-then-insert over the affected dates (writeRollupCells) is the whole answer to the
      // vacated-cell problem: a date that no longer has qualifying work simply ends up with no
      // rows at all after the delete, because muscleVolumeCells drops any cell with a zero set
      // count and the insert below only ever adds cells that still exist. Recomputing only the
      // NEW date would leave the OLD date's now-stale cells behind — the obvious wrong turn, and
      // it fails silently.
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
    }

    await this.reconcilePersonalRecords(tx, userId, [...touchedExerciseIds]);
  }

  // Replays detectPrs/foldPriorBest (@fitness/pr-rules, via personal-record-replay.ts) over
  // exactly the touched exercises, diffs the fresh answer against the stored ledger, and writes
  // the three-way result in three batched statements — never a statement per record.
  private async reconcilePersonalRecords(tx: QueryExecutor, userId: string, exerciseIds: string[]): Promise<void> {
    if (exerciseIds.length === 0) return;

    const historyByExerciseId = await loadExerciseSetHistory(tx, userId, exerciseIds);
    const replayed: ReplayedRecord[] = [];
    for (const exerciseId of exerciseIds) {
      replayed.push(...replayPersonalRecords({ exerciseId, sets: historyByExerciseId.get(exerciseId) ?? [] }));
    }

    const stored = await tx
      .select({
        id: personalRecord.id,
        loggedSetId: personalRecord.loggedSetId,
        prType: personalRecord.prType,
      })
      .from(personalRecord)
      .where(and(eq(personalRecord.userId, userId), inArray(personalRecord.exerciseId, exerciseIds)));

    const { toInsert, toUpdate, toDelete } = diffRecordKeys(stored, replayed);

    // The only place in this project where derived logic deletes durable user-visible history
    // (T-10-07) — restricted three ways at once: to this userId (via the select above), to
    // inArray(exercise_id, exerciseIds) (via the same select), and to keys the fresh replay did
    // not confirm. One batched statement, never a delete per row.
    if (toDelete.length > 0) {
      await tx.delete(personalRecord).where(inArray(personalRecord.id, toDelete));
    }

    // One batched UPDATE statement family via a VALUES-list join, not a statement per row: a key
    // present in both the stored ledger and the fresh replay keeps its existing id, gains a fresh
    // reconciled_at and a bumped server_seq, and has its value corrected if the replay disagrees.
    if (toUpdate.length > 0) {
      await tx.execute(sql`
        UPDATE personal_record AS pr
        SET value = v.value::numeric(10,3), reconciled_at = now(), server_seq = nextval('sync_seq')
        FROM (VALUES ${sql.join(
          toUpdate.map((row) => sql`(${row.id}::text, ${formatPrValue(row.record.value)}::text)`),
          sql`, `,
        )}) AS v(id, value)
        WHERE pr.id = v.id
      `);
    }

    // One batched multi-row INSERT: a key the replay confirms with no stored row is a fresh
    // record the client never wrote, or a client-written row the replay's own idempotency key
    // (`${loggedSetId}:${prType}`) genuinely does not overlap with anything already stored.
    if (toInsert.length > 0) {
      await tx.insert(personalRecord).values(
        toInsert.map((record) => ({
          id: personalRecordId(userId, record),
          userId,
          exerciseId: record.exerciseId,
          prType: record.prType,
          value: formatPrValue(record.value),
          loggedSetId: record.loggedSetId,
          achievedAt: new Date(record.achievedAt),
          reconciledAt: sql`now()`,
          serverSeq: sql`nextval('sync_seq')`,
        })),
      );
    }
  }
}
