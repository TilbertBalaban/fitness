import { isTerminalRejection, PUSH_APPLIED_TABLES, PUSH_DEFERRED_TABLES, SYNCED_TABLES } from '../sync';
import {
  CYCLE_KINDS,
  EMPTY_TARGET,
  ROUTINE_STATUSES,
  isEmptyOverride,
  resolveTarget,
  type ResolvedTarget,
} from '../program';

describe('ROUTINE_STATUSES', () => {
  it('deep-equals [draft, ready] in that exact order', () => {
    expect(ROUTINE_STATUSES).toEqual(['draft', 'ready']);
  });

  // The tripwire on this plan's own prohibitions: active/frozen/archived each live on a different
  // column (user_preference.active_routine_id, routine.progression_frozen, routine.archived_at)
  // and must never be reintroduced as a third/fourth status value — see docs/program-vocabularies.md.
  it('contains neither active, frozen, nor archived', () => {
    expect((ROUTINE_STATUSES as readonly string[]).includes('active')).toBe(false);
    expect((ROUTINE_STATUSES as readonly string[]).includes('frozen')).toBe(false);
    expect((ROUTINE_STATUSES as readonly string[]).includes('archived')).toBe(false);
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

describe('CYCLE_KINDS', () => {
  it('deep-equals [training, deload, time_off] in that exact order', () => {
    expect(CYCLE_KINDS).toEqual(['training', 'deload', 'time_off']);
  });

  // The vocabulary is exactly three values — a deload is a cycle you still train (lighter), time
  // off is a cycle you do not train at all, and no other exception exists.
  it('has no rest, week, or taper member', () => {
    expect((CYCLE_KINDS as readonly string[]).includes('rest')).toBe(false);
    expect((CYCLE_KINDS as readonly string[]).includes('week')).toBe(false);
    expect((CYCLE_KINDS as readonly string[]).includes('taper')).toBe(false);
  });
});

describe('routine_cycle sync classification', () => {
  it('SYNCED_TABLES contains routine_cycle', () => {
    expect((SYNCED_TABLES as readonly string[]).includes('routine_cycle')).toBe(true);
  });
});

describe('resolveTarget', () => {
  const base: ResolvedTarget = {
    targetSets: 3,
    targetRepMin: 8,
    targetRepMax: 12,
    targetRir: 2,
    targetRestSeconds: 120,
  };

  it('returns a value deep-equal to base when override is null — a cycle with no override row is not a special case', () => {
    expect(resolveTarget(base, null)).toEqual(base);
  });

  it('returns a value deep-equal to base when override is undefined', () => {
    expect(resolveTarget(base, undefined)).toEqual(base);
  });

  it('returns a value deep-equal to base when override is an empty object', () => {
    expect(resolveTarget(base, {})).toEqual(base);
  });

  it('resolves per field, not per row — an override naming only targetSets leaves the other four reading from base', () => {
    const result = resolveTarget(base, { targetSets: 5 });
    expect(result.targetSets).toBe(5);
    expect(result.targetRepMin).toBe(base.targetRepMin);
    expect(result.targetRepMax).toBe(base.targetRepMax);
    expect(result.targetRir).toBe(base.targetRir);
    expect(result.targetRestSeconds).toBe(base.targetRestSeconds);
  });

  it('a null override field resolves to the base value — null in an override means "not overridden", never "cleared"', () => {
    expect(resolveTarget(base, { targetSets: null }).targetSets).toBe(base.targetSets);
  });

  it('an override on an unprescribed exercise (EMPTY_TARGET base) is still an override', () => {
    const result = resolveTarget(EMPTY_TARGET, { targetSets: 5 });
    expect(result.targetSets).toBe(5);
    expect(result.targetRepMin).toBeNull();
    expect(result.targetRepMax).toBeNull();
    expect(result.targetRir).toBeNull();
    expect(result.targetRestSeconds).toBeNull();
  });

  it('resolveTarget(EMPTY_TARGET, null) returns five nulls', () => {
    expect(resolveTarget(EMPTY_TARGET, null)).toEqual(EMPTY_TARGET);
  });

  it('does not mutate either argument', () => {
    const baseCopy = { ...base };
    const override = { targetSets: 5 };
    const overrideCopy = { ...override };
    resolveTarget(base, override);
    expect(base).toEqual(baseCopy);
    expect(override).toEqual(overrideCopy);
  });
});

describe('isEmptyOverride', () => {
  it('is true for an empty object', () => {
    expect(isEmptyOverride({})).toBe(true);
  });

  it('is true when every field is explicitly null', () => {
    expect(
      isEmptyOverride({
        targetSets: null,
        targetRepMin: null,
        targetRepMax: null,
        targetRir: null,
        targetRestSeconds: null,
      }),
    ).toBe(true);
  });

  it('is false when a field is 0 — zero is a value, not an absence', () => {
    expect(isEmptyOverride({ targetSets: 0 })).toBe(false);
  });
});

describe('routine_exercise_cycle_target sync classification', () => {
  it('SYNCED_TABLES contains routine_exercise_cycle_target', () => {
    expect((SYNCED_TABLES as readonly string[]).includes('routine_exercise_cycle_target')).toBe(true);
  });
});
