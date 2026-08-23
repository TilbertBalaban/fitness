// getPowerSync's real module chain reaches @powersync/react-native -> @powersync/shared-internals,
// whose ESM dist Jest cannot parse (WINDOWS #22/#33) — mocked before importing the screen module
// so its top-level `import { getPowerSync } from '@/lib/db/powersync'` never reaches that chain.
jest.mock('../../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../../lib/db/id', () => ({ generateClientId: jest.fn(() => 'fixed-id') }));
jest.mock('../../../lib/db/programs/create-routine', () => ({
  createRoutine: jest.fn(),
  loadRoutines: jest.fn(),
}));
jest.mock('../../../lib/db/programs/days', () => ({
  addDay: jest.fn(),
  addExercisesToDay: jest.fn(),
  renameDay: jest.fn(),
  removeDay: jest.fn(),
  removeExercise: jest.fn(),
}));
jest.mock('../../../lib/db/programs/lifecycle', () => ({
  loadActiveRoutineId: jest.fn(),
  loadLibraryRoutines: jest.fn(),
  setProgressionFrozen: jest.fn(),
}));
jest.mock('../../../lib/db/programs/load-program', () => ({
  loadExerciseNameMap: jest.fn(),
  loadProgramTree: jest.fn(),
}));
jest.mock('../../../lib/db/programs/cycles', () => ({
  addCycle: jest.fn(),
  updateCycle: jest.fn(),
  moveCycle: jest.fn(),
  removeCycle: jest.fn(),
  setCycleTarget: jest.fn(),
  clearCycleTarget: jest.fn(),
  validateCycle: jest.fn(() => null),
  cycleErrorMessage: jest.fn((code: string) => code),
}));
// programs.tsx now imports ExercisePickerModal, whose top-level imports reach the exercises
// screen (drizzle-orm/expo-router) and authClient (better-auth/react's ESM dist, which Jest's
// transform cannot parse) — mocked before importing the screen module, same rationale as the
// powersync mock above.
jest.mock('../../exercises', () => ({ loadCatalogRows: jest.fn() }));
jest.mock('../../../lib/auth-client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

import {
  FREEZE_SWITCH_TITLE,
  cycleDurationFieldValue,
  deriveProgramsScreenState,
  freezeSwitchLabel,
  nextExpandedSlotId,
  overrideDelta,
  overriddenFields,
  parseCycleDuration,
  resolveDisplayedRoutineId,
  resolveSlotTargets,
  selectedCycleOf,
} from '../programs';
import type { RoutineSummary } from '../../../lib/db/programs/create-routine';
import type { ProgramCycle, ProgramSlot } from '../../../lib/db/programs/load-program';

const oneRoutine: RoutineSummary = { id: 'r-1', name: 'Push Pull Legs', status: 'draft', goal: null };

describe('deriveProgramsScreenState', () => {
  it('is error when the load failed, regardless of routines', () => {
    expect(deriveProgramsScreenState({ failed: true, routines: null })).toBe('error');
    expect(deriveProgramsScreenState({ failed: true, routines: [oneRoutine] })).toBe('error');
  });

  it('is loading when routines have not been read yet', () => {
    expect(deriveProgramsScreenState({ failed: false, routines: null })).toBe('loading');
  });

  it('is empty when the load succeeded with zero routines', () => {
    expect(deriveProgramsScreenState({ failed: false, routines: [], activeRoutineId: null })).toBe('empty');
  });

  it('is populated when the pointer names a loaded routine', () => {
    expect(deriveProgramsScreenState({ failed: false, routines: [oneRoutine], activeRoutineId: 'r-1' })).toBe(
      'populated',
    );
  });

  // A user with programs but none active gets its own state rather than falling into `empty` —
  // "you have nothing" and "you have not chosen" are different problems with different fixes.
  it('is no-active when routines exist but no pointer is set', () => {
    expect(deriveProgramsScreenState({ failed: false, routines: [oneRoutine], activeRoutineId: null })).toBe(
      'no-active',
    );
  });

  it('is no-active when the pointer names a routine that is not in the list', () => {
    expect(deriveProgramsScreenState({ failed: false, routines: [oneRoutine], activeRoutineId: 'archived-r' })).toBe(
      'no-active',
    );
  });

  it('is empty, not no-active, when the user has no programs at all', () => {
    expect(deriveProgramsScreenState({ failed: false, routines: [], activeRoutineId: 'stale' })).toBe('empty');
  });
});

describe('freezeSwitchLabel', () => {
  it('says two different things depending on the state', () => {
    expect(freezeSwitchLabel(false)).not.toBe(freezeSwitchLabel(true));
  });

  // Freezing is a deliberate choice, and this phase implements no progression at all — any framing
  // implying the user has fallen behind would be both unkind and untrue.
  it('never describes a frozen program as failed, stalled or stuck', () => {
    for (const frozen of [false, true]) {
      expect(freezeSwitchLabel(frozen)).not.toMatch(/failed|stalled|stuck|behind/i);
    }
  });

  it('states what progression will and will not do in each state', () => {
    expect(freezeSwitchLabel(false)).toMatch(/progression/i);
    expect(freezeSwitchLabel(true)).toMatch(/progression/i);
  });

  it('is labelled Update Program, the MacroFactor precedent this control is modeled on', () => {
    expect(FREEZE_SWITCH_TITLE).toBe('Update Program');
  });
});

describe('nextExpandedSlotId', () => {
  it('closes the open row when tapping the same id', () => {
    expect(nextExpandedSlotId('a', 'a')).toBeNull();
  });

  it('switches to the tapped row — only one row expanded at a time', () => {
    expect(nextExpandedSlotId('a', 'b')).toBe('b');
  });

  it('opens the tapped row when nothing was expanded', () => {
    expect(nextExpandedSlotId(null, 'b')).toBe('b');
  });
});

const CYCLES: ProgramCycle[] = [
  { id: 'c1', name: 'Week 1', kind: 'training', orderIndex: 1024, durationDays: null },
  { id: 'c2', name: 'Deload', kind: 'deload', orderIndex: 2048, durationDays: null },
];

const BASE_TARGETS = {
  targetSets: 3,
  targetRepMin: 8,
  targetRepMax: 10,
  targetRir: 2,
  targetRestSeconds: 90,
};

function slotWith(overridesByCycleId: ProgramSlot['overridesByCycleId']): ProgramSlot {
  return {
    id: 'rex-1',
    orderIndex: 1024,
    exerciseId: 'ex-1',
    exerciseName: 'Bench Press',
    ...BASE_TARGETS,
    overridesByCycleId,
  };
}

const SETS_OVERRIDE_ON_C1 = slotWith({
  c1: { targetSets: 5, targetRepMin: null, targetRepMax: null, targetRir: null, targetRestSeconds: null },
});

describe('selectedCycleOf', () => {
  it('is null with nothing selected — no cycle selected means the base prescription', () => {
    expect(selectedCycleOf(CYCLES, null)).toBeNull();
  });

  it('degrades a stale id to the base rather than throwing after its cycle is deleted', () => {
    expect(selectedCycleOf(CYCLES, 'missing')).toBeNull();
  });

  it('is null for a program with no cycles at all', () => {
    expect(selectedCycleOf([], 'c1')).toBeNull();
  });

  it('resolves a live id to that cycle', () => {
    expect(selectedCycleOf(CYCLES, 'c2')).toEqual(CYCLES[1]);
  });
});

describe('resolveSlotTargets', () => {
  it('is the slot\'s own base values with no cycle selected — nothing is overridden', () => {
    expect(resolveSlotTargets(SETS_OVERRIDE_ON_C1, null)).toEqual(BASE_TARGETS);
  });

  it('takes the overridden field from the cycle and inherits the other four from the base', () => {
    expect(resolveSlotTargets(SETS_OVERRIDE_ON_C1, 'c1')).toEqual({ ...BASE_TARGETS, targetSets: 5 });
  });

  it('returns the base unchanged for a cycle this slot does not override', () => {
    expect(resolveSlotTargets(SETS_OVERRIDE_ON_C1, 'c2')).toEqual(BASE_TARGETS);
  });

  it('returns the base unchanged for a slot with no overrides at all', () => {
    expect(resolveSlotTargets(slotWith({}), 'c1')).toEqual(BASE_TARGETS);
  });
});

describe('overriddenFields', () => {
  it('names exactly the fields the selected cycle\'s override actually sets', () => {
    expect(overriddenFields(SETS_OVERRIDE_ON_C1, 'c1')).toEqual(['targetSets']);
  });

  it('is empty with no cycle selected', () => {
    expect(overriddenFields(SETS_OVERRIDE_ON_C1, null)).toEqual([]);
  });

  it('is empty for a cycle this slot does not override', () => {
    expect(overriddenFields(SETS_OVERRIDE_ON_C1, 'c2')).toEqual([]);
  });

  it('counts a zero as overridden — zero is a value, not an absence', () => {
    const slot = slotWith({
      c1: { targetSets: null, targetRepMin: null, targetRepMax: null, targetRir: 0, targetRestSeconds: null },
    });

    expect(overriddenFields(slot, 'c1')).toEqual(['targetRir']);
  });
});

describe('overrideDelta', () => {
  it('names only the fields that actually differ from the base', () => {
    expect(overrideDelta(BASE_TARGETS, { ...BASE_TARGETS, targetSets: 5 })).toEqual({
      targetSets: 5,
      targetRepMin: null,
      targetRepMax: null,
      targetRir: null,
      targetRestSeconds: null,
    });
  });

  it('is empty when the edited values equal the base — an override that overrides nothing', () => {
    expect(overrideDelta(BASE_TARGETS, { ...BASE_TARGETS })).toEqual({
      targetSets: null,
      targetRepMin: null,
      targetRepMax: null,
      targetRir: null,
      targetRestSeconds: null,
    });
  });

  it('keeps a zero that differs from the base rather than reading it as an absence', () => {
    expect(overrideDelta(BASE_TARGETS, { ...BASE_TARGETS, targetRir: 0 }).targetRir).toBe(0);
  });

  it('drops a field the user cleared back to null — clearing a prescription is a base-row edit', () => {
    expect(overrideDelta(BASE_TARGETS, { ...BASE_TARGETS, targetRir: null }).targetRir).toBeNull();
  });
});

// The Edit Cycle form's Days off field, which the shipped form did not have — its absence is why
// "Make Time off" could only ever produce a cycle with no length (04-VERIFICATION gap 2).
describe('parseCycleDuration', () => {
  it('reads an empty or whitespace-only field as no duration', () => {
    expect(parseCycleDuration('')).toBeNull();
    expect(parseCycleDuration('   ')).toBeNull();
  });

  it('reads a whole number, ignoring surrounding whitespace', () => {
    expect(parseCycleDuration('7')).toBe(7);
    expect(parseCycleDuration('  14  ')).toBe(14);
  });

  it('never coerces a non-numeric field to a number validateCycle would accept', () => {
    expect(Number.isNaN(parseCycleDuration('abc') as number)).toBe(true);
    expect(parseCycleDuration('0')).toBe(0);
  });
});

describe('cycleDurationFieldValue', () => {
  it('shows an existing duration so an edit starts from what is stored', () => {
    expect(cycleDurationFieldValue(7)).toBe('7');
  });

  it('shows an empty field for a cycle with no duration, including one arriving null from sync', () => {
    expect(cycleDurationFieldValue(null)).toBe('');
    expect(cycleDurationFieldValue(undefined)).toBe('');
  });

  it('round-trips through parseCycleDuration', () => {
    expect(parseCycleDuration(cycleDurationFieldValue(14))).toBe(14);
    expect(parseCycleDuration(cycleDurationFieldValue(null))).toBeNull();
  });
});

// WR-08: displayedRoutineId was `routineIdParam ?? activeRoutineId` and the builder branch tests it
// before screenState is consulted, so deriveProgramsScreenState's "a pointer naming a routine that
// is not in the list reads as no-active" rule was bypassed whenever the param was present.
describe('resolveDisplayedRoutineId (WR-08)', () => {
  const LIVE = { id: 'r-live', archivedAt: null };
  const ARCHIVED = { id: 'r-archived', archivedAt: '2026-01-01T00:00:00.000Z' };

  it('honours a param naming a loaded, non-archived program', () => {
    expect(
      resolveDisplayedRoutineId({ routineIdParam: 'r-live', routines: [LIVE], activeRoutineId: null }),
    ).toBe('r-live');
  });

  it('falls back to the active pointer for a param naming an archived program', () => {
    expect(
      resolveDisplayedRoutineId({
        routineIdParam: 'r-archived',
        routines: [LIVE, ARCHIVED],
        activeRoutineId: 'r-live',
      }),
    ).toBe('r-live');
  });

  it('reads as no-active for an archived param when nothing else is active', () => {
    expect(
      resolveDisplayedRoutineId({ routineIdParam: 'r-archived', routines: [ARCHIVED], activeRoutineId: null }),
    ).toBeNull();
  });

  it('falls back for a param naming a program this device does not have', () => {
    expect(
      resolveDisplayedRoutineId({ routineIdParam: 'r-gone', routines: [LIVE], activeRoutineId: 'r-live' }),
    ).toBe('r-live');
  });

  it('does not honour a param before the list has loaded — it is not checkable yet', () => {
    expect(
      resolveDisplayedRoutineId({ routineIdParam: 'r-live', routines: null, activeRoutineId: null }),
    ).toBeNull();
  });

  it('uses the active pointer when no param is present at all', () => {
    expect(resolveDisplayedRoutineId({ routines: [LIVE], activeRoutineId: 'r-live' })).toBe('r-live');
  });

  // The screen holds `routines` already filtered to non-archived, so the two functions see the same
  // list — and must reach the same verdict about a pointer naming something not in it.
  it('agrees with deriveProgramsScreenState rather than bypassing it', () => {
    const routines = [LIVE];

    expect(resolveDisplayedRoutineId({ routineIdParam: 'r-archived', routines, activeRoutineId: null })).toBeNull();
    expect(deriveProgramsScreenState({ failed: false, routines, activeRoutineId: 'r-archived' })).toBe('no-active');
  });
});
