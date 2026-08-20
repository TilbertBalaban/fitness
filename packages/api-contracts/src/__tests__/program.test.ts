import { isTerminalRejection, PUSH_APPLIED_TABLES, PUSH_DEFERRED_TABLES } from '../sync';
import { ROUTINE_STATUSES } from '../program';

describe('ROUTINE_STATUSES', () => {
  it('deep-equals [draft, ready] in that exact order', () => {
    expect(ROUTINE_STATUSES).toEqual(['draft', 'ready']);
  });
});

describe('routine push classification', () => {
  it('is in PUSH_APPLIED_TABLES and not in PUSH_DEFERRED_TABLES', () => {
    expect((PUSH_APPLIED_TABLES as readonly string[]).includes('routine')).toBe(true);
    expect((PUSH_DEFERRED_TABLES as readonly string[]).includes('routine')).toBe(false);
  });

  it("isTerminalRejection('unknown_table', 'routine') is now false — the tripwire proving the tuple move happened", () => {
    expect(isTerminalRejection('unknown_table', 'routine')).toBe(false);
  });
});
