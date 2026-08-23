import type { SyncRejectionReason } from '@fitness/api-contracts';

// SQLSTATE classes whose violation is a property of the pushed payload rather than of the moment
// it was pushed: 22 (data exception — bad numeric literal, out-of-range value, invalid text
// representation) and 23 (integrity constraint violation — check, not-null, foreign key, unique).
// Retrying the identical op with the identical data reproduces the identical error, so the client
// is told invalid_field and is free to complete the crud transaction away.
const PERMANENT_SQLSTATE_CLASSES = new Set(['22', '23']);

// Drizzle does not rethrow the driver's error: it wraps it in a DrizzleQueryError whose `cause`
// carries the pg error (and therefore the SQLSTATE). Reading `code` off the top-level throw alone
// finds nothing and silently classifies every real constraint violation as transient — the exact
// inverse of the bug being fixed here, and invisible to a unit test that constructs its own error.
const MAX_CAUSE_DEPTH = 5;

function sqlStateOf(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && current !== null && current !== undefined; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

// Everything a transaction can throw that is not one of the permanent classes is transient by
// default: 40P01 (deadlock — two of the same user's devices pushing overlapping aggregates is
// enough), 40001 (serialization failure), 57014 (statement timeout), class 08 (connection
// failure), and any non-Postgres throw from our own code, which a later deploy can cure. Mapping
// all of those to invalid_field — as this catch used to — told the client "this data is
// permanently unacceptable", and the client answered by calling transaction.complete() and
// deleting an entire offline editing session from its local queue over a blip (CR-02).
//
// The default therefore leans non-terminal on purpose. A server bug that throws on every retry
// leaves the queue stalled, which is visible (recordRejectedOps plus a never-advancing
// lastSuccessfulPushAt) and curable by deploying a fix; the opposite default silently destroys
// writes that were never recoverable in the first place.
export function classifyTransactionError(error: unknown): SyncRejectionReason {
  const code = sqlStateOf(error);
  if (code === undefined) return 'server_error';
  return PERMANENT_SQLSTATE_CLASSES.has(code.slice(0, 2)) ? 'invalid_field' : 'server_error';
}
