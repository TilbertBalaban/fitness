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
jest.mock('../../../lib/db/programs/load-program', () => ({
  loadExerciseNameMap: jest.fn(),
  loadProgramTree: jest.fn(),
}));
jest.mock('../../../lib/db/programs/cycles', () => ({
  addCycle: jest.fn(),
  renameCycle: jest.fn(),
  setCycleKind: jest.fn(),
  setCycleDuration: jest.fn(),
  moveCycle: jest.fn(),
  removeCycle: jest.fn(),
  setCycleTarget: jest.fn(),
  clearCycleTarget: jest.fn(),
  validateCycle: jest.fn(() => null),
}));
// programs.tsx now imports ExercisePickerModal, whose top-level imports reach the exercises
// screen (drizzle-orm/expo-router) and authClient (better-auth/react's ESM dist, which Jest's
// transform cannot parse) — mocked before importing the screen module, same rationale as the
// powersync mock above.
jest.mock('../../exercises', () => ({ loadCatalogRows: jest.fn() }));
jest.mock('../../../lib/auth-client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

import {
  deriveProgramsScreenState,
  nextExpandedSlotId,
  overrideDelta,
  overriddenFields,
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
    expect(deriveProgramsScreenState({ failed: false, routines: [] })).toBe('empty');
  });

  it('is populated when at least one routine loaded', () => {
    expect(deriveProgramsScreenState({ failed: false, routines: [oneRoutine] })).toBe('populated');
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
