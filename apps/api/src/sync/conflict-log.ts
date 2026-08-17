import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { syncConflictLog, syncTombstone } from '../db/schema/sync';
import type { Database } from '../db/drizzle.module';

// The transaction handle db.transaction hands its callback — extracted from Database's own
// transaction method rather than declared independently, so this type can never drift out of
// sync with the real runtime value. Accepting this (not the pool-backed Database) is what makes
// the trace and the overwrite it documents commit or roll back together (T-02-08).
export type Tx = Parameters<Database['transaction']>[0] extends (tx: infer T, ...rest: never[]) => unknown
  ? T
  : never;

export interface RecordConflictParams {
  userId: string;
  table: string;
  rowId: string;
  losingValue: Record<string, unknown>;
  winningValue: Record<string, unknown>;
  losingServerSeq: number;
  winningServerSeq: number;
}

export async function recordConflict(tx: Tx, params: RecordConflictParams): Promise<void> {
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

export async function recordTombstone(tx: Tx, params: RecordTombstoneParams): Promise<void> {
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
export async function isTombstoned(tx: Tx, table: string, rowId: string, userId: string): Promise<boolean> {
  const rows = await tx
    .select({ tableName: syncTombstone.tableName })
    .from(syncTombstone)
    .where(and(eq(syncTombstone.tableName, table), eq(syncTombstone.rowId, rowId), eq(syncTombstone.userId, userId)))
    .limit(1);
  return rows.length > 0;
}
