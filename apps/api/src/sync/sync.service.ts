import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import {
  SYNCED_TABLES,
  SYNC_MAX_BATCH_OPS,
  type SyncCrudOp,
  type SyncPushResponse,
  type SyncRejectionReason,
} from '@fitness/api-contracts';
import { DRIZZLE, type Database } from '../db/drizzle.module';
import { workoutSession } from '../db/schema';

const TABLE_MAP = { workout_session: workoutSession } as const;

interface WorkoutSessionOpData {
  routine_day_id?: string | null;
  equipment_profile_id?: string | null;
  started_at?: string;
  ended_at?: string | null;
  status?: string;
  device_id?: string | null;
}

function toWorkoutSessionValues(id: string, userId: string, data: Record<string, unknown> | null | undefined) {
  const d = (data ?? {}) as WorkoutSessionOpData;
  return {
    id,
    userId,
    routineDayId: d.routine_day_id ?? null,
    equipmentProfileId: d.equipment_profile_id ?? null,
    startedAt: d.started_at ? new Date(d.started_at) : new Date(),
    endedAt: d.ended_at ? new Date(d.ended_at) : null,
    status: d.status ?? 'in_progress',
    deviceId: d.device_id ?? null,
  };
}

@Injectable()
export class SyncService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // Resolves ownership from the authenticated session only — never from a client-supplied
  // user_id in an op's data (T-02-01). Batch-size gating is the controller's job; this method
  // assumes it is only ever called with an already-bounded batch.
  async applyBatch(userId: string, batch: SyncCrudOp[]): Promise<SyncPushResponse> {
    const applied: string[] = [];
    const rejected: { op_id: string; reason: SyncRejectionReason }[] = [];
    let highestServerSeq = 0n;

    await this.db.transaction(async (tx) => {
      for (const op of batch) {
        if (!(SYNCED_TABLES as readonly string[]).includes(op.type)) {
          rejected.push({ op_id: op.op_id, reason: 'unknown_table' });
          continue;
        }

        const table = TABLE_MAP[op.type as keyof typeof TABLE_MAP];

        // Re-verified on every op, not just on first insert (T-02-01): an id already accepted
        // once is never treated as already-owned without this re-read inside the same transaction.
        const existing = await tx
          .select({ userId: table.userId })
          .from(table)
          .where(eq(table.id, op.id))
          .for('update');

        if (existing.length > 0 && existing[0].userId !== userId) {
          rejected.push({ op_id: op.op_id, reason: 'not_owner' });
          continue;
        }

        if (op.op === 'DELETE') {
          if (existing.length > 0) {
            await tx.delete(table).where(eq(table.id, op.id));
          }
          const seqResult = await tx.execute<{ seq: string }>(sql`select nextval('sync_seq') as seq`);
          const seqValue = BigInt(seqResult.rows[0].seq);
          if (seqValue > highestServerSeq) highestServerSeq = seqValue;
          applied.push(op.op_id);
          continue;
        }

        // PUT / PATCH — upsert keyed on the client UUID (D-02); a replayed op yields one row,
        // not a duplicate-key error. serverSeq is bumped explicitly on both branches — the
        // column's own nextval() default only fires on INSERT, never on an ON CONFLICT UPDATE.
        const values = toWorkoutSessionValues(op.id, userId, op.data);
        const nextSeq = sql`nextval('sync_seq')`;
        const [{ serverSeq }] = await tx
          .insert(table)
          .values({ ...values, serverSeq: nextSeq })
          .onConflictDoUpdate({ target: table.id, set: { ...values, serverSeq: nextSeq } })
          .returning({ serverSeq: table.serverSeq });

        const seqValue = BigInt(serverSeq);
        if (seqValue > highestServerSeq) highestServerSeq = seqValue;
        applied.push(op.op_id);
      }
    });

    return { applied, rejected, server_seq: highestServerSeq.toString() };
  }
}
