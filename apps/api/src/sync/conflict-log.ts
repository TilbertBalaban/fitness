import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { syncConflictLog, syncTombstone } from '../db/schema/sync';
import type { Database } from '../db/drizzle.module';

// Accepts either the pool-backed Database or the transaction handle db.transaction hands its
// callback — narrowed to just the two query-builder methods this module needs, since Database and
// its transaction type are not supertypes of one another (a transaction lacks $client; the pool
// lacks rollback/nestedIndex). isTombstoned is deliberately usable outside a transaction (a
// pre-pass read before aggregate resolution even begins); recordConflict/recordTombstone are
// always called with the transaction so the trace and the overwrite it documents commit or roll
// back together (T-02-08).
export type QueryExecutor = Pick<Database, 'select' | 'insert'>;

export interface RecordConflictParams {
  userId: string;
  table: string;
  rowId: string;
  losingValue: Record<string, unknown>;
  winningValue: Record<string, unknown>;
  losingServerSeq: number;
  winningServerSeq: number;
}

export async function recordConflict(tx: QueryExecutor, params: RecordConflictParams): Promise<void> {
  await tx.insert(syncConflictLog).values({
    id: randomUUID(),
    userId: params.userId,
    tableName: params.table,
    rowId: params.rowId,
    losingValue: params.losingValue,
    winningValue: params.winningValue,
    losingServerSeq: params.losingServerSeq,
    winningServerSeq: params.winningServerSeq,
  });
}

export interface RecordTombstoneParams {
  userId: string;
  table: string;
  rowId: string;
  deletedServerSeq: number;
}

export async function recordTombstone(tx: QueryExecutor, params: RecordTombstoneParams): Promise<void> {
  // Idempotent on (table_name, row_id) — a second delete of the same id must not add a second
  // tombstone row.
  await tx
    .insert(syncTombstone)
    .values({
      tableName: params.table,
      rowId: params.rowId,
      userId: params.userId,
      deletedServerSeq: params.deletedServerSeq,
    })
    .onConflictDoNothing({ target: [syncTombstone.tableName, syncTombstone.rowId] });
}

// Scoped by userId (T-02-15) — one account's tombstone can never suppress another account's row
// with a coincidentally equal id.
export async function isTombstoned(tx: QueryExecutor, table: string, rowId: string, userId: string): Promise<boolean> {
  const rows = await tx
    .select({ tableName: syncTombstone.tableName })
    .from(syncTombstone)
    .where(and(eq(syncTombstone.tableName, table), eq(syncTombstone.rowId, rowId), eq(syncTombstone.userId, userId)))
    .limit(1);
  return rows.length > 0;
}
