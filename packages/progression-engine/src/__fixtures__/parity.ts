import { type ProgressionPreference } from '@fitness/api-contracts';
import { resolveInventory, type EquipmentProfileLike } from '@fitness/plate-math';
import type { ExerciseSessionSets, LoggedSetInput, ProgressionResult, RecommendInput } from '../result';

// D-08: the single input/expected-output table three separate jest processes import and run —
// packages/progression-engine/src/__tests__/parity.test.ts, apps/api/src/progression/__tests__
// /parity.spec.ts and apps/mobile/lib/db/__tests__/progression-parity.test.ts. Data only: no
// describe/it/expect, no import from any test framework, so all three (plain ts-jest here,
// jest-expo on mobile, ts-jest again but a different tsconfig on api) can consume the identical
// object rather than each maintaining their own copy of it.
export interface ParityCase {
  name: string;
  // The ROADMAP/REQUIREMENTS clause this case pins — a failing case reports what broke, not just
  // an array index.
  requirement: string;
  input: RecommendInput;
  expected: ProgressionResult;
}

function inventoryFrom(overrides: Partial<EquipmentProfileLike> = {}) {
  return resolveInventory({
    nativeUnit: 'kg',
    barbellWeightKg: '20.000',
    plates: [],
    dumbbells: [],
    machines: [],
    ...overrides,
  });
}

function loggedSet(overrides: Partial<LoggedSetInput> = {}): LoggedSetInput {
  return {
    id: 's1',
    parentSetId: null,
    setType: 'normal',
    weightKg: '100.000',
    reps: 8,
    rir: 2,
    side: null,
    completed: true,
    ...overrides,
  };
}

function sessionsWith(sets: LoggedSetInput[], sessionId = 'sess-1'): ExerciseSessionSets[] {
  return [{ sessionId, sets }];
}

function baseInput(overrides: Partial<RecommendInput> = {}): RecommendInput {
  return {
    sessions: sessionsWith([loggedSet()]),
    prescription: { targetRepMin: 7, targetRepMax: 9, targetRir: 2 },
    equipmentType: 'barbell',
    inventory: inventoryFrom({ plates: [{ weightKg: '10.000', pairCount: 1 }] }),
    preference: 'widen_rep_range_first' as ProgressionPreference,
    ...overrides,
  };
}

const roomyInventory = inventoryFrom({ plates: [{ weightKg: '20.000', pairCount: 4 }] });
const coarseInventory = inventoryFrom({ plates: [{ weightKg: '50.000', pairCount: 1 }] });
const offerInventory = inventoryFrom({ plates: [{ weightKg: '10.000', pairCount: 5 }] });

// The two identical-content shortfall histories below (PRGR-08) — see their own comment for why
// they are, and must be, the same object shape rather than differing by any date/timestamp field.
const shortfallSessions: ExerciseSessionSets[] = [
  { sessionId: 's2', sets: [loggedSet({ id: 'a', weightKg: '100.000', reps: 6, rir: 1 })] },
  { sessionId: 's1', sets: [loggedSet({ id: 'b', weightKg: '100.000', reps: 6, rir: 1 })] },
];
const shortfallHoldNoOffer: ProgressionResult = {
  kind: 'recommendation',
  weightKg: '100.000',
  reps: 7,
  rir: 2,
  basis: 'shortfall_hold',
  offeredReduction: null,
};

export const PROGRESSION_PARITY_FIXTURES: ParityCase[] = [
  {
    name: 'no logged sessions returns no_history rather than inventing a starting weight',
    requirement: 'PRGR-07',
    input: baseInput({ sessions: [] }),
    expected: { kind: 'no_history' },
  },
  {
    name: 'a missing rep bound on the prescription returns unavailable/incomplete_prescription',
    requirement: 'PRGR-06',
    input: baseInput({ prescription: { targetRepMin: null, targetRepMax: 9, targetRir: 2 } }),
    expected: { kind: 'unavailable', reason: 'incomplete_prescription' },
  },
  {
    name: 'equipment listed unavailable on the resolved inventory returns unavailable/equipment_unavailable',
    requirement: 'PRGR-06',
    input: baseInput({ inventory: { ...inventoryFrom(), unavailableEquipmentTypes: ['barbell'] } }),
    expected: { kind: 'unavailable', reason: 'equipment_unavailable' },
  },
  {
    name: 'a malformed logged row (negative reps) returns unavailable/no_achievable_weight rather than throwing',
    requirement: 'PRGR-06',
    input: baseInput({ sessions: sessionsWith([loggedSet({ reps: -1 })]) }),
    expected: { kind: 'unavailable', reason: 'no_achievable_weight' },
  },
  {
    name: 'a surplus well past the rep-range ceiling with a roomy inventory raises the load and resets reps to targetRepMin',
    requirement: 'PRGR-02',
    input: baseInput({
      inventory: roomyInventory,
      sessions: sessionsWith([loggedSet({ weightKg: '100.000', reps: 20, rir: 5 })]),
    }),
    expected: {
      kind: 'recommendation',
      weightKg: '140.000',
      reps: 7,
      rir: 2,
      basis: 'load_increase',
      offeredReduction: null,
    },
  },
  {
    name: 'a performance within the RIR tolerance band holds the exact logged weight and reps',
    requirement: 'PRGR-10',
    input: baseInput({ sessions: sessionsWith([loggedSet({ weightKg: '100.000', reps: 7, rir: 2 })]) }),
    expected: { kind: 'recommendation', weightKg: '100.000', reps: 7, rir: 2, basis: 'hold', offeredReduction: null },
  },
  {
    name: 'widen_rep_range_first holds the load and advances reps when a coarse inventory blocks the raise its own ceiling earned',
    requirement: 'PRGR-04',
    input: baseInput({
      inventory: coarseInventory,
      preference: 'widen_rep_range_first',
      sessions: sessionsWith([loggedSet({ weightKg: '100.000', reps: 12, rir: 3 })]),
    }),
    expected: {
      kind: 'recommendation',
      weightKg: '100.000',
      reps: 9,
      rir: 2,
      basis: 'range_widened',
      offeredReduction: null,
    },
  },
  {
    name: 'match_previous_weight falls back to the identical rep advance under the same coarse inventory, reported as rep_increase rather than range_widened',
    requirement: 'PRGR-04',
    input: baseInput({
      inventory: coarseInventory,
      preference: 'match_previous_weight',
      sessions: sessionsWith([loggedSet({ weightKg: '100.000', reps: 12, rir: 3 })]),
    }),
    expected: {
      kind: 'recommendation',
      weightKg: '100.000',
      reps: 9,
      rir: 2,
      basis: 'rep_increase',
      offeredReduction: null,
    },
  },
  {
    name: 'a failure set beating the prior failure set at the same load progresses one rep, capped at targetRepMax',
    requirement: 'PRGR-03',
    input: baseInput({
      prescription: { targetRepMin: 7, targetRepMax: 15, targetRir: 2 },
      sessions: [
        { sessionId: 'sess-recent', sets: [loggedSet({ id: 'a', rir: 0, reps: 11, weightKg: '100.000' })] },
        { sessionId: 'sess-older', sets: [loggedSet({ id: 'b', rir: 0, reps: 10, weightKg: '100.000' })] },
      ],
    }),
    expected: {
      kind: 'recommendation',
      weightKg: '100.000',
      reps: 12,
      rir: 2,
      basis: 'failure_rep_increase',
      offeredReduction: null,
    },
  },
  {
    name: 'a shortfall streak below the offer threshold holds with no offer attached',
    requirement: 'PRGR-09',
    input: baseInput({ sessions: shortfallSessions }),
    expected: shortfallHoldNoOffer,
  },
  {
    name: 'a shortfall streak at the offer threshold holds the same weight and reps but attaches an offered reduction',
    requirement: 'PRGR-09',
    input: baseInput({
      inventory: offerInventory,
      sessions: [
        { sessionId: 's3', sets: [loggedSet({ id: 'a', weightKg: '100.000', reps: 6, rir: 1 })] },
        { sessionId: 's2', sets: [loggedSet({ id: 'b', weightKg: '100.000', reps: 6, rir: 1 })] },
        { sessionId: 's1', sets: [loggedSet({ id: 'c', weightKg: '100.000', reps: 6, rir: 1 })] },
      ],
    }),
    expected: {
      kind: 'recommendation',
      weightKg: '100.000',
      reps: 7,
      rir: 2,
      basis: 'shortfall_hold',
      offeredReduction: { weightKg: '80.000', reps: 7 },
    },
  },
  {
    name: 'a per-side pair produces exactly one recommendation, derived from the weaker side (D-12)',
    requirement: 'PRGR-01',
    input: baseInput({
      sessions: sessionsWith([
        loggedSet({ id: 'left', side: 'left', weightKg: '100.000', reps: 12, rir: 3 }),
        loggedSet({ id: 'right', parentSetId: 'left', side: 'right', weightKg: '80.000', reps: 8, rir: 1 }),
      ]),
    }),
    expected: { kind: 'recommendation', weightKg: '80.000', reps: 7, rir: 2, basis: 'hold', offeredReduction: null },
  },
  {
    name: 'a drop-set group folds to the parent (top-set) row alone, ignoring its drop children (D-11)',
    requirement: 'D-11',
    input: baseInput({
      sessions: sessionsWith([
        loggedSet({ id: 'parent', parentSetId: null, weightKg: '100.000', reps: 8, rir: 2 }),
        loggedSet({ id: 'child-1', parentSetId: 'parent', setType: 'drop', weightKg: '80.000', reps: 6, rir: 1 }),
        loggedSet({ id: 'child-2', parentSetId: 'parent', setType: 'drop', weightKg: '60.000', reps: 6, rir: 0 }),
      ]),
    }),
    expected: { kind: 'recommendation', weightKg: '100.000', reps: 7, rir: 2, basis: 'hold', offeredReduction: null },
  },
  // PRGR-08: two histories, identical in logged content, that a lifter could have produced three
  // days apart or three months apart — asserted to produce the exact same recommendation.
  // RecommendInput (result.ts) carries no date/timestamp field anywhere, so "how long ago" cannot
  // even be expressed as an input, let alone influence the output — these two cases are
  // deliberately built from the same shortfallSessions array to make that absence loud rather than
  // implicit: a time-decay term reintroduced later would have nowhere to plug in without first
  // changing this very type, which is exactly the guard PRGR-08/D-10 exist to keep in place.
  {
    name: 'a shortfall streak logged three days apart holds with no offer (PRGR-08: recency is sessions, never elapsed time)',
    requirement: 'PRGR-08',
    input: baseInput({ sessions: shortfallSessions }),
    expected: shortfallHoldNoOffer,
  },
  {
    name: 'the identical shortfall streak, logged three months apart instead, holds with the exact same no-offer result — RecommendInput has no field this scenario could even attach a gap to (PRGR-08)',
    requirement: 'PRGR-08',
    input: baseInput({ sessions: shortfallSessions }),
    expected: shortfallHoldNoOffer,
  },
];
