import { isTerminalRejection } from '@fitness/api-contracts';
import { classifyTransactionError } from '../rejection-reason';

// A Postgres driver error as `pg` surfaces it: a plain Error carrying a SQLSTATE on `code`.
function pgError(code: string): Error {
  return Object.assign(new Error(`simulated ${code}`), { code });
}

describe('classifyTransactionError', () => {
  it.each([
    ['40P01', "deadlock detected — two of the same user's devices pushing overlapping aggregates"],
    ['40001', 'serialization failure'],
    ['57014', 'statement timeout'],
    ['08006', 'connection failure'],
    ['53300', 'too many connections'],
  ])('classifies SQLSTATE %s (%s) as server_error, which the client must not treat as terminal', (code) => {
    const reason = classifyTransactionError(pgError(code));
    expect(reason).toBe('server_error');
    expect(isTerminalRejection(reason, 'routine')).toBe(false);
  });

  it.each([
    ['23514', 'check constraint violation'],
    ['23502', 'not-null violation'],
    ['23503', 'foreign key violation'],
    ['23505', 'unique violation'],
    ['22P02', 'invalid text representation'],
    ['22003', 'numeric value out of range'],
  ])('classifies SQLSTATE %s (%s) as invalid_field — retrying the identical payload cannot succeed', (code) => {
    const reason = classifyTransactionError(pgError(code));
    expect(reason).toBe('invalid_field');
    expect(isTerminalRejection(reason, 'routine')).toBe(true);
  });

  // Drizzle wraps every driver error in a DrizzleQueryError and hangs the pg error off `cause`.
  // Reading only the top-level `code` classified every real constraint violation as transient —
  // caught by the e2e suite, invisible to the hand-built errors above.
  it('reads the SQLSTATE through a DrizzleQueryError-shaped wrapper rather than only off the top-level throw', () => {
    const wrapped = Object.assign(new Error('Failed query: insert into ...'), { cause: pgError('23503') });
    expect(classifyTransactionError(wrapped)).toBe('invalid_field');
  });

  it('gives up after a bounded number of cause hops rather than following a self-referential chain forever', () => {
    const looping: { cause?: unknown } = {};
    looping.cause = looping;
    expect(classifyTransactionError(looping)).toBe('server_error');
  });

  it.each([
    ['a throw from our own code with no SQLSTATE', new TypeError('cannot read properties of undefined')],
    ['a non-Error throw', 'boom' as unknown],
    ['null', null as unknown],
    ['an error whose code is not a string', Object.assign(new Error('odd'), { code: 42 })],
  ])('defaults %s to server_error rather than destroying the write', (_label, thrown) => {
    expect(classifyTransactionError(thrown)).toBe('server_error');
  });
});
