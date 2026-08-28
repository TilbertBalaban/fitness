import {
  detachRowPartnerName,
  isFinalGroupMember,
  nextSupersetMemberIndex,
  supersetMembers,
  supersetPartnerLabel,
  type SupersetMemberInput,
} from '../superset';

function exercise(overrides: Partial<SupersetMemberInput> & { id: string }): SupersetMemberInput {
  return {
    orderIndex: 0,
    supersetGroupId: null,
    exerciseName: overrides.id,
    ...overrides,
  };
}

describe('supersetMembers', () => {
  it('returns only itself for an ungrouped exercise', () => {
    const exercises = [exercise({ id: 'e1' }), exercise({ id: 'e2' })];
    expect(supersetMembers(exercises, 'e1')).toEqual([exercises[0]]);
  });

  it('returns the live members sharing this group id, ascending by orderIndex', () => {
    const a = exercise({ id: 'a', orderIndex: 1, supersetGroupId: 'g1' });
    const b = exercise({ id: 'b', orderIndex: 0, supersetGroupId: 'g1' });
    const c = exercise({ id: 'c', orderIndex: 2, supersetGroupId: null });
    expect(supersetMembers([a, b, c], 'a')).toEqual([b, a]);
  });
});

describe('isFinalGroupMember', () => {
  it('returns true for an exercise whose supersetGroupId is null', () => {
    const exercises = [exercise({ id: 'e1' })];
    expect(isFinalGroupMember(exercises, 'e1')).toBe(true);
  });

  it('returns false for the lower-orderIndex member and true for the higher-orderIndex member of a two-member group', () => {
    const low = exercise({ id: 'low', orderIndex: 0, supersetGroupId: 'g1' });
    const high = exercise({ id: 'high', orderIndex: 1, supersetGroupId: 'g1' });
    const exercises = [low, high];
    expect(isFinalGroupMember(exercises, 'low')).toBe(false);
    expect(isFinalGroupMember(exercises, 'high')).toBe(true);
  });

  it('scopes "highest" to the group at the start of a long session, never to the session as a whole (Pitfall 4)', () => {
    // A two-member group sits at orderIndex 0 and 1 of a five-exercise session — a globally-scoped
    // "highest order_index" implementation would wrongly treat exercises 2-4 as outranking the group.
    const groupLow = exercise({ id: 'g-low', orderIndex: 0, supersetGroupId: 'g1' });
    const groupHigh = exercise({ id: 'g-high', orderIndex: 1, supersetGroupId: 'g1' });
    const rest = [2, 3, 4].map((orderIndex) => exercise({ id: `solo-${orderIndex}`, orderIndex }));
    const exercises = [groupLow, groupHigh, ...rest];

    expect(isFinalGroupMember(exercises, 'g-high')).toBe(true);
    expect(isFinalGroupMember(exercises, 'g-low')).toBe(false);
  });

  it('returns true only for the highest-orderIndex member of a three-member group, and false for the other two (D-15)', () => {
    const a = exercise({ id: 'a', orderIndex: 0, supersetGroupId: 'g1' });
    const b = exercise({ id: 'b', orderIndex: 1, supersetGroupId: 'g1' });
    const c = exercise({ id: 'c', orderIndex: 2, supersetGroupId: 'g1' });
    const exercises = [a, b, c];

    expect(isFinalGroupMember(exercises, 'a')).toBe(false);
    expect(isFinalGroupMember(exercises, 'b')).toBe(false);
    expect(isFinalGroupMember(exercises, 'c')).toBe(true);
  });

  it('returns true for the sole remaining live member of a group whose other member was removed mid-session (D-24)', () => {
    // The removed partner is simply absent from the input list, exactly as loadSessionTree's
    // removed_at IS NULL filter would produce — the survivor still carries the group id.
    const survivor = exercise({ id: 'survivor', orderIndex: 1, supersetGroupId: 'g1' });
    const exercises = [survivor];

    expect(isFinalGroupMember(exercises, 'survivor')).toBe(true);
  });
});

describe('nextSupersetMemberIndex', () => {
  it('returns null for a final member', () => {
    const low = exercise({ id: 'low', orderIndex: 0, supersetGroupId: 'g1' });
    const high = exercise({ id: 'high', orderIndex: 1, supersetGroupId: 'g1' });
    const exercises = [low, high];
    expect(nextSupersetMemberIndex(exercises, 1)).toBeNull();
  });

  it('returns null for an ungrouped exercise', () => {
    const exercises = [exercise({ id: 'solo' })];
    expect(nextSupersetMemberIndex(exercises, 0)).toBeNull();
  });

  it('returns the list index of the next live member of the same group for a non-final member', () => {
    const low = exercise({ id: 'low', orderIndex: 0, supersetGroupId: 'g1' });
    const mid = exercise({ id: 'mid', orderIndex: 1 });
    const high = exercise({ id: 'high', orderIndex: 2, supersetGroupId: 'g1' });
    const exercises = [low, mid, high];

    expect(nextSupersetMemberIndex(exercises, 0)).toBe(2);
  });
});

describe('supersetPartnerLabel', () => {
  it('returns null for an ungrouped exercise', () => {
    const exercises = [exercise({ id: 'solo' })];
    expect(supersetPartnerLabel(exercises, 'solo')).toBeNull();
  });

  it('returns null for a group with one live member (D-24)', () => {
    const survivor = exercise({ id: 'survivor', supersetGroupId: 'g1', exerciseName: 'Bench Press' });
    expect(supersetPartnerLabel([survivor], 'survivor')).toBeNull();
  });

  it('returns "Superset with {name}" for a two-member group', () => {
    const a = exercise({ id: 'a', orderIndex: 0, supersetGroupId: 'g1', exerciseName: 'Bench Press' });
    const b = exercise({ id: 'b', orderIndex: 1, supersetGroupId: 'g1', exerciseName: 'Bent Over Row' });
    expect(supersetPartnerLabel([a, b], 'a')).toBe('Superset with Bent Over Row');
  });

  it('returns "Superset (3 exercises)" for a three-member group', () => {
    const a = exercise({ id: 'a', orderIndex: 0, supersetGroupId: 'g1' });
    const b = exercise({ id: 'b', orderIndex: 1, supersetGroupId: 'g1' });
    const c = exercise({ id: 'c', orderIndex: 2, supersetGroupId: 'g1' });
    expect(supersetPartnerLabel([a, b, c], 'b')).toBe('Superset (3 exercises)');
  });
});

describe('detachRowPartnerName', () => {
  it('returns null for an ungrouped exercise', () => {
    const exercises = [exercise({ id: 'solo' })];
    expect(detachRowPartnerName(exercises, 'solo')).toBeNull();
  });

  it('returns the other member\'s name for a two-member group', () => {
    const a = exercise({ id: 'a', orderIndex: 0, supersetGroupId: 'g1', exerciseName: 'Bench Press' });
    const b = exercise({ id: 'b', orderIndex: 1, supersetGroupId: 'g1', exerciseName: 'Bent Over Row' });
    expect(detachRowPartnerName([a, b], 'a')).toBe('Bent Over Row');
    expect(detachRowPartnerName([a, b], 'b')).toBe('Bench Press');
  });

  it('names the immediately adjacent live member by orderIndex for a group of three or more (A-P7)', () => {
    const a = exercise({ id: 'a', orderIndex: 0, supersetGroupId: 'g1', exerciseName: 'Squat' });
    const b = exercise({ id: 'b', orderIndex: 1, supersetGroupId: 'g1', exerciseName: 'Leg Press' });
    const c = exercise({ id: 'c', orderIndex: 2, supersetGroupId: 'g1', exerciseName: 'Leg Curl' });
    const exercises = [a, b, c];

    expect(detachRowPartnerName(exercises, 'a')).toBe('Leg Press');
    expect(detachRowPartnerName(exercises, 'b')).toBe('Leg Curl');
    expect(detachRowPartnerName(exercises, 'c')).toBe('Leg Press');
  });
});
