import {
  SWAP_RESULT_CAP,
  SWAP_SCORE_THRESHOLD,
  explainMatch,
  scoreAlternatives,
  type SwapConstraints,
  type SwapExercise,
  type SwapMuscleMapping,
  type SwapPreference,
  type SwapSignal,
} from '../smart-swap';

function ex(overrides: Partial<SwapExercise> & { id: string; name: string }): SwapExercise {
  return {
    movementPattern: null,
    equipmentRequired: null,
    variationOfId: null,
    ...overrides,
  };
}

function mapping(exerciseId: string, muscleGroupId: string, role: 'primary' | 'secondary', weightFactor: string): SwapMuscleMapping {
  return { exerciseId, muscleGroupId, role, weightFactor };
}

describe('scoreAlternatives', () => {
  it('ranks a shared-primary-muscle candidate above a shared-secondary-muscle candidate at a similar weight_factor', () => {
    const target = ex({ id: 'target', name: 'Bench Press' });
    const primaryMatch = ex({ id: 'cand-primary', name: 'Incline Bench Press' });
    const secondaryMatch = ex({ id: 'cand-secondary', name: 'Triceps Pushdown' });
    const mappings = [
      mapping('target', 'chest', 'primary', '1.00'),
      mapping('cand-primary', 'chest', 'primary', '1.00'),
      mapping('cand-secondary', 'chest', 'secondary', '1.00'),
    ];

    const results = scoreAlternatives(target, [primaryMatch, secondaryMatch], mappings, [], null);
    const primaryResult = results.find((r) => r.id === 'cand-primary');
    const secondaryResult = results.find((r) => r.id === 'cand-secondary');

    expect(primaryResult).toBeDefined();
    expect(secondaryResult).toBeDefined();
    expect(primaryResult!.score).toBeGreaterThan(secondaryResult!.score);
  });

  it('among two candidates with identical muscle overlap, the one matching movement_pattern outranks the one that does not', () => {
    const target = ex({ id: 'target', name: 'Barbell Squat', movementPattern: 'squat' });
    const matchingPattern = ex({ id: 'cand-a', name: 'Front Squat', movementPattern: 'squat' });
    const differentPattern = ex({ id: 'cand-b', name: 'Leg Extension', movementPattern: 'isolation' });
    const mappings = [
      mapping('target', 'quads', 'primary', '1.00'),
      mapping('cand-a', 'quads', 'primary', '1.00'),
      mapping('cand-b', 'quads', 'primary', '1.00'),
    ];

    const results = scoreAlternatives(target, [matchingPattern, differentPattern], mappings, [], null);
    const a = results.find((r) => r.id === 'cand-a')!;
    const b = results.find((r) => r.id === 'cand-b')!;

    expect(a.score).toBeGreaterThan(b.score);
  });

  it('breaks a muscle-and-pattern tie via a matching equipment_required bonus', () => {
    const target = ex({ id: 'target', name: 'Barbell Bench Press', movementPattern: 'horizontal_push', equipmentRequired: 'barbell' });
    const sameEquipment = ex({ id: 'same-equipment', name: 'Barbell Incline Press', movementPattern: 'horizontal_push', equipmentRequired: 'barbell' });
    const differentEquipment = ex({ id: 'different-equipment', name: 'Dumbbell Incline Press', movementPattern: 'horizontal_push', equipmentRequired: 'dumbbell' });
    const mappings = [
      mapping('target', 'chest', 'primary', '1.00'),
      mapping('same-equipment', 'chest', 'primary', '1.00'),
      mapping('different-equipment', 'chest', 'primary', '1.00'),
    ];

    const results = scoreAlternatives(target, [sameEquipment, differentEquipment], mappings, [], null);
    const sameResult = results.find((r) => r.id === 'same-equipment')!;
    const differentResult = results.find((r) => r.id === 'different-equipment')!;

    expect(sameResult.score).toBeGreaterThan(differentResult.score);
  });

  it('finds a lat pulldown a reasonable alternative to a pull-up despite sharing no variation_of_id', () => {
    const target = ex({ id: 'pull-up', name: 'Pull-Up', movementPattern: 'vertical_pull', equipmentRequired: 'bodyweight' });
    const latPulldown = ex({ id: 'lat-pulldown', name: 'Lat Pulldown', movementPattern: 'vertical_pull', equipmentRequired: 'cable' });
    const mappings = [
      mapping('pull-up', 'lats', 'primary', '1.00'),
      mapping('pull-up', 'biceps', 'secondary', '0.50'),
      mapping('lat-pulldown', 'lats', 'primary', '1.00'),
      mapping('lat-pulldown', 'biceps', 'secondary', '0.50'),
    ];

    const results = scoreAlternatives(target, [latPulldown], mappings, [], null);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('lat-pulldown');
    expect(results[0].score).toBeGreaterThanOrEqual(SWAP_SCORE_THRESHOLD);
  });

  it('ranks a variation_of_id sibling above a non-sibling with identical muscle overlap', () => {
    const target = ex({ id: 'target', name: 'Barbell Squat', variationOfId: 'squat-parent' });
    const sibling = ex({ id: 'sibling', name: 'Front Squat', variationOfId: 'squat-parent' });
    const nonSibling = ex({ id: 'non-sibling', name: 'Hack Squat', variationOfId: null });
    const mappings = [
      mapping('target', 'quads', 'primary', '1.00'),
      mapping('sibling', 'quads', 'primary', '1.00'),
      mapping('non-sibling', 'quads', 'primary', '1.00'),
    ];

    const results = scoreAlternatives(target, [sibling, nonSibling], mappings, [], null);
    const siblingResult = results.find((r) => r.id === 'sibling')!;
    const nonSiblingResult = results.find((r) => r.id === 'non-sibling')!;

    expect(siblingResult.score).toBeGreaterThan(nonSiblingResult.score);
  });

  it('never includes the target exercise in its own results', () => {
    const target = ex({ id: 'target', name: 'Bench Press' });
    const mappings = [mapping('target', 'chest', 'primary', '1.00')];

    const results = scoreAlternatives(target, [target], mappings, [], null);

    expect(results).toHaveLength(0);
  });

  it('excludes a candidate the user marked never_suggest, even with a perfect muscle match', () => {
    const target = ex({ id: 'target', name: 'Bench Press' });
    const candidate = ex({ id: 'candidate', name: 'Incline Bench Press' });
    const mappings = [mapping('target', 'chest', 'primary', '1.00'), mapping('candidate', 'chest', 'primary', '1.00')];
    const preferences: SwapPreference[] = [{ userId: 'user-a', exerciseId: 'candidate', archivedAt: null, neverSuggest: true }];

    const results = scoreAlternatives(target, [candidate], mappings, preferences, 'user-a');

    expect(results).toHaveLength(0);
  });

  it('excludes a candidate the user archived', () => {
    const target = ex({ id: 'target', name: 'Bench Press' });
    const candidate = ex({ id: 'candidate', name: 'Incline Bench Press' });
    const mappings = [mapping('target', 'chest', 'primary', '1.00'), mapping('candidate', 'chest', 'primary', '1.00')];
    const preferences: SwapPreference[] = [
      { userId: 'user-a', exerciseId: 'candidate', archivedAt: '2026-08-01T00:00:00.000Z', neverSuggest: false },
    ];

    const results = scoreAlternatives(target, [candidate], mappings, preferences, 'user-a');

    expect(results).toHaveLength(0);
  });

  it("does not let another user's never_suggest flag suppress a candidate for this user", () => {
    const target = ex({ id: 'target', name: 'Bench Press' });
    const candidate = ex({ id: 'candidate', name: 'Incline Bench Press' });
    const mappings = [mapping('target', 'chest', 'primary', '1.00'), mapping('candidate', 'chest', 'primary', '1.00')];
    const preferences: SwapPreference[] = [{ userId: 'other-user', exerciseId: 'candidate', archivedAt: null, neverSuggest: true }];

    const results = scoreAlternatives(target, [candidate], mappings, preferences, 'user-a');

    expect(results.map((r) => r.id)).toContain('candidate');
  });

  it('excludes every candidate requiring an equipment type named in excludeEquipment', () => {
    const target = ex({ id: 'target', name: 'Bench Press' });
    const machineCandidate = ex({ id: 'machine', name: 'Chest Press Machine', equipmentRequired: 'machine' });
    const dumbbellCandidate = ex({ id: 'dumbbell', name: 'Dumbbell Bench Press', equipmentRequired: 'dumbbell' });
    const mappings = [
      mapping('target', 'chest', 'primary', '1.00'),
      mapping('machine', 'chest', 'primary', '1.00'),
      mapping('dumbbell', 'chest', 'primary', '1.00'),
    ];
    const constraints: SwapConstraints = { excludeEquipment: ['machine'] };

    const results = scoreAlternatives(target, [machineCandidate, dumbbellCandidate], mappings, [], null, constraints);
    const ids = results.map((r) => r.id);

    expect(ids).not.toContain('machine');
    expect(ids).toContain('dumbbell');
  });

  it('with an allowEquipment list, returns only candidates whose equipment_required is in it or is null', () => {
    const target = ex({ id: 'target', name: 'Bench Press' });
    const allowed = ex({ id: 'allowed', name: 'Dumbbell Bench Press', equipmentRequired: 'dumbbell' });
    const disallowed = ex({ id: 'disallowed', name: 'Machine Chest Press', equipmentRequired: 'machine' });
    const noEquipment = ex({ id: 'bodyweight-ex', name: 'Push-Up', equipmentRequired: null });
    const mappings = [
      mapping('target', 'chest', 'primary', '1.00'),
      mapping('allowed', 'chest', 'primary', '1.00'),
      mapping('disallowed', 'chest', 'primary', '1.00'),
      mapping('bodyweight-ex', 'chest', 'primary', '1.00'),
    ];
    const constraints: SwapConstraints = { allowEquipment: ['dumbbell'] };

    const results = scoreAlternatives(target, [allowed, disallowed, noEquipment], mappings, [], null, constraints);
    const ids = results.map((r) => r.id);

    expect(ids).toContain('allowed');
    expect(ids).toContain('bodyweight-ex');
    expect(ids).not.toContain('disallowed');
  });

  it('compares weight_factor as a number, not a lexical string, when computing contributions', () => {
    const target = ex({ id: 'target', name: 'Deadlift' });
    const strongMatch = ex({ id: 'strong', name: 'Romanian Deadlift' });
    const weakMatch = ex({ id: 'weak', name: 'Good Morning' });
    const mappings = [
      mapping('target', 'hamstrings', 'primary', '1.00'),
      mapping('strong', 'hamstrings', 'primary', '0.90'),
      mapping('weak', 'hamstrings', 'primary', '0.30'),
    ];

    const results = scoreAlternatives(target, [strongMatch, weakMatch], mappings, [], null);
    const strong = results.find((r) => r.id === 'strong')!;
    const weak = results.find((r) => r.id === 'weak')!;

    expect(strong.score).toBeCloseTo(0.9, 5);
    expect(weak.score).toBeCloseTo(0.3, 5);
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it('drops candidates below SWAP_SCORE_THRESHOLD, returning an empty array when nothing qualifies', () => {
    const target = ex({ id: 'target', name: 'Bench Press', movementPattern: 'horizontal_push', equipmentRequired: 'barbell' });
    const unrelated = ex({ id: 'unrelated', name: 'Calf Raise', movementPattern: 'isolation', equipmentRequired: 'machine' });
    const mappings = [mapping('target', 'chest', 'primary', '1.00'), mapping('unrelated', 'calves', 'primary', '1.00')];

    const results = scoreAlternatives(target, [unrelated], mappings, [], null);

    expect(results).toEqual([]);
  });

  it('caps results at SWAP_RESULT_CAP, in a stable score-desc/name-asc/id-asc order independent of input order', () => {
    const target = ex({ id: 'target', name: 'Bench Press' });
    const candidates: SwapExercise[] = Array.from({ length: SWAP_RESULT_CAP + 3 }, (_, i) => ex({ id: `cand-${i}`, name: `Candidate ${i}` }));
    const mappings = [mapping('target', 'chest', 'primary', '1.00'), ...candidates.map((c) => mapping(c.id, 'chest', 'primary', '1.00'))];

    const forward = scoreAlternatives(target, candidates, mappings, [], null);
    const shuffled = [...candidates].reverse();
    const reversedInput = scoreAlternatives(target, shuffled, mappings, [], null);

    expect(forward).toHaveLength(SWAP_RESULT_CAP);
    expect(forward.map((r) => r.id)).toEqual(reversedInput.map((r) => r.id));
  });

  it('does not mutate its target or candidates arguments', () => {
    const target = ex({ id: 'target', name: 'Bench Press' });
    const candidates = [ex({ id: 'cand-a', name: 'Incline Bench Press' }), ex({ id: 'cand-b', name: 'Decline Bench Press' })];
    const mappings = [
      mapping('target', 'chest', 'primary', '1.00'),
      mapping('cand-a', 'chest', 'primary', '1.00'),
      mapping('cand-b', 'chest', 'primary', '1.00'),
    ];
    const targetBefore = JSON.parse(JSON.stringify(target));
    const candidatesBefore = JSON.parse(JSON.stringify(candidates));

    scoreAlternatives(target, candidates, mappings, [], null);

    expect(target).toEqual(targetBefore);
    expect(candidates).toEqual(candidatesBefore);
  });

  it('returns the same results whether two calls run sequentially or interleaved via Promise.all', async () => {
    const targetA = ex({ id: 'target-a', name: 'Bench Press' });
    const targetB = ex({ id: 'target-b', name: 'Barbell Squat' });
    const candidateA = ex({ id: 'cand-a', name: 'Incline Bench Press' });
    const candidateB = ex({ id: 'cand-b', name: 'Front Squat' });
    const mappings = [
      mapping('target-a', 'chest', 'primary', '1.00'),
      mapping('cand-a', 'chest', 'primary', '1.00'),
      mapping('target-b', 'quads', 'primary', '1.00'),
      mapping('cand-b', 'quads', 'primary', '1.00'),
    ];

    const sequentialA = scoreAlternatives(targetA, [candidateA], mappings, [], null);
    const sequentialB = scoreAlternatives(targetB, [candidateB], mappings, [], null);

    const [interleavedA, interleavedB] = await Promise.all([
      Promise.resolve().then(() => scoreAlternatives(targetA, [candidateA], mappings, [], null)),
      Promise.resolve().then(() => scoreAlternatives(targetB, [candidateB], mappings, [], null)),
    ]);

    expect(interleavedA).toEqual(sequentialA);
    expect(interleavedB).toEqual(sequentialB);
  });

  it('every returned candidate carries a non-empty why string naming the winning signal', () => {
    const target = ex({ id: 'target', name: 'Bench Press', movementPattern: 'horizontal_push' });
    const muscleWinner = ex({ id: 'muscle-winner', name: 'Incline Bench Press' });
    const patternOnlyWinner = ex({ id: 'pattern-winner', name: 'Push-Up', movementPattern: 'horizontal_push' });
    const mappings = [
      mapping('target', 'chest', 'primary', '1.00'),
      mapping('muscle-winner', 'chest', 'primary', '1.00'),
      mapping('pattern-winner', 'triceps', 'primary', '1.00'),
    ];

    const results = scoreAlternatives(target, [muscleWinner, patternOnlyWinner], mappings, [], null);

    for (const result of results) {
      expect(result.why.trim().length).toBeGreaterThan(0);
    }
    const muscleResult = results.find((r) => r.id === 'muscle-winner')!;
    const patternResult = results.find((r) => r.id === 'pattern-winner')!;
    expect(muscleResult.why.toLowerCase()).toContain('muscle');
    expect(patternResult.why.toLowerCase()).toContain('movement pattern');
  });
});

describe('explainMatch', () => {
  it('never returns an empty string and never surfaces a numeric score', () => {
    const target = ex({ id: 'target', name: 'Bench Press' });
    const candidate = ex({ id: 'candidate', name: 'Incline Bench Press' });
    const signal: SwapSignal = {
      muscleScore: 0,
      dominantMuscleGroupId: null,
      dominantIsPrimaryPrimary: false,
      movementPatternMatch: false,
      variationSibling: false,
    };

    const why = explainMatch(target, candidate, signal);

    expect(why.length).toBeGreaterThan(0);
    expect(why).not.toMatch(/\d/);
  });

  it('names the variation-sibling signal when it is the only winning contributor', () => {
    const target = ex({ id: 'target', name: 'Barbell Squat', variationOfId: 'parent' });
    const candidate = ex({ id: 'sibling', name: 'Front Squat', variationOfId: 'parent' });
    const signal: SwapSignal = {
      muscleScore: 0,
      dominantMuscleGroupId: null,
      dominantIsPrimaryPrimary: false,
      movementPatternMatch: false,
      variationSibling: true,
    };

    const why = explainMatch(target, candidate, signal);

    expect(why.toLowerCase()).toContain('variation');
  });

  it('names the same-primary-muscle signal when the dominant overlap is primary-primary', () => {
    const target = ex({ id: 'target', name: 'Bench Press' });
    const candidate = ex({ id: 'candidate', name: 'Incline Bench Press' });
    const signal: SwapSignal = {
      muscleScore: 1,
      dominantMuscleGroupId: 'chest',
      dominantIsPrimaryPrimary: true,
      movementPatternMatch: false,
      variationSibling: false,
    };

    const why = explainMatch(target, candidate, signal);

    expect(why).toBe('Same primary muscle: chest');
  });
});
