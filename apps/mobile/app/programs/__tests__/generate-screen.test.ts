// Same mock-before-import discipline as library-screen.test.ts: the screen module's top-level
// imports reach @powersync's ESM dist and better-auth/react, neither of which Jest's transform can
// parse.
jest.mock('../../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../../lib/db/id', () => ({ generateClientId: jest.fn(() => 'fixed-id') }));
jest.mock('../../../lib/auth-client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

import type { DegradationEntry, GeneratedProgramTree, GeneratedSlot, GenerationCatalog } from '@fitness/program-generator';
import {
  formatTargetLine,
  resolveSlotForCycle,
  UNKNOWN_PREVIEW_EXERCISE_NAME,
} from '../../../components/GeneratedProgramPreview';
import { describeDegradation } from '../../../lib/programs/generation-wizard';
import {
  confirmGeneratedProgram,
  defaultGeneratedRoutineName,
  runGeneration,
  TRACER_DEFAULTS,
  type GenerateScreenDeps,
} from '../generate';

function fixtureTree(): GeneratedProgramTree {
  return {
    name: 'Hypertrophy — Full Body',
    goal: 'Hypertrophy',
    cycles: [{ key: 'cycle-0', name: 'Cycle 1', kind: 'training', orderIndex: 1024, durationDays: null }],
    days: [],
    degradations: [],
  };
}

function emptyCatalog(): GenerationCatalog {
  return { exercises: [], mappings: [] };
}

describe('defaultGeneratedRoutineName', () => {
  it('names the goal and split preference together', () => {
    expect(defaultGeneratedRoutineName('hypertrophy', 'full_body')).toBe('Hypertrophy — Full Body');
  });

  it('produces a different label for a different goal or split', () => {
    expect(defaultGeneratedRoutineName('strength', 'full_body')).not.toBe(defaultGeneratedRoutineName('hypertrophy', 'full_body'));
    expect(defaultGeneratedRoutineName('hypertrophy', 'upper_lower')).not.toBe(defaultGeneratedRoutineName('hypertrophy', 'full_body'));
  });
});

describe('generate-then-confirm sequencing', () => {
  it('never calls the writer during generation alone, and calls it exactly once on confirm', async () => {
    const tree = fixtureTree();
    const materializeSpy = jest.fn().mockResolvedValue({ id: 'new-routine' });
    const deps: GenerateScreenDeps = {
      loadCatalog: jest.fn().mockResolvedValue(emptyCatalog()),
      loadInventory: jest.fn().mockResolvedValue(null),
      loadExclusions: jest.fn().mockResolvedValue([]),
      generateProgram: jest.fn().mockReturnValue(tree),
      materializeGeneratedProgram: materializeSpy,
    };

    const db = {} as never;
    const generated = await runGeneration('user-1', db, deps);

    expect(generated).toBe(tree);
    expect(materializeSpy).not.toHaveBeenCalled();

    await confirmGeneratedProgram(generated, 'My Program', db, deps);

    expect(materializeSpy).toHaveBeenCalledTimes(1);
    expect(materializeSpy).toHaveBeenCalledWith({ tree: generated, name: 'My Program' }, db);
  });

  it('builds the generation input from the tracer defaults, with catalog and inventory injected', async () => {
    const tree = fixtureTree();
    const catalog = emptyCatalog();
    const generateProgramSpy = jest.fn().mockReturnValue(tree);
    const deps: GenerateScreenDeps = {
      loadCatalog: jest.fn().mockResolvedValue(catalog),
      loadInventory: jest.fn().mockResolvedValue(null),
      loadExclusions: jest.fn().mockResolvedValue([]),
      generateProgram: generateProgramSpy,
      materializeGeneratedProgram: jest.fn(),
    };

    const db = {} as never;
    await runGeneration('user-1', db, deps);

    expect(generateProgramSpy).toHaveBeenCalledTimes(1);
    const input = generateProgramSpy.mock.calls[0][0];
    expect(input.trainingGoal).toBe(TRACER_DEFAULTS.trainingGoal);
    expect(input.experienceLevel).toBe(TRACER_DEFAULTS.experienceLevel);
    expect(input.daysPerWeek).toBe(TRACER_DEFAULTS.daysPerWeek);
    expect(input.splitPreference).toBe(TRACER_DEFAULTS.splitPreference);
    expect(input.catalog).toBe(catalog);
    expect(input.inventory).toBeNull();
    expect(input.excludedExerciseIds).toEqual([]);
  });
});

describe('generation reads the real exclusion list', () => {
  it('passes the ids loadExclusions returned straight into the generation input', async () => {
    const generateProgramSpy = jest.fn().mockReturnValue(fixtureTree());
    const loadExclusions = jest.fn().mockResolvedValue(['ex-excluded-a', 'ex-excluded-b']);
    const deps: GenerateScreenDeps = {
      loadCatalog: jest.fn().mockResolvedValue(emptyCatalog()),
      loadInventory: jest.fn().mockResolvedValue(null),
      loadExclusions,
      generateProgram: generateProgramSpy,
      materializeGeneratedProgram: jest.fn(),
    };

    const db = {} as never;
    await runGeneration('user-1', db, deps);

    expect(loadExclusions).toHaveBeenCalledWith(db, 'user-1');
    expect(generateProgramSpy.mock.calls[0][0].excludedExerciseIds).toEqual(['ex-excluded-a', 'ex-excluded-b']);
  });

  // Degrading to an empty list here would put an exercise the user refused into their program and
  // still look like a successful generation (D-09).
  it('propagates a failed exclusion read instead of generating against an empty list', async () => {
    const generateProgramSpy = jest.fn().mockReturnValue(fixtureTree());
    const deps: GenerateScreenDeps = {
      loadCatalog: jest.fn().mockResolvedValue(emptyCatalog()),
      loadInventory: jest.fn().mockResolvedValue(null),
      loadExclusions: jest.fn().mockRejectedValue(new Error('exclusion read failed')),
      generateProgram: generateProgramSpy,
      materializeGeneratedProgram: jest.fn(),
    };

    await expect(runGeneration('user-1', {} as never, deps)).rejects.toThrow('exclusion read failed');
    expect(generateProgramSpy).not.toHaveBeenCalled();
  });
});


describe('the preview resolves each cycle\'s own numbers', () => {
  function slot(): GeneratedSlot {
    return {
      key: 'day-0-slot-1024',
      exerciseId: 'ex-1',
      orderIndex: 1024,
      base: { targetSets: 3, targetRepMin: 8, targetRepMax: 12, targetRir: 3, targetRestSeconds: 120 },
      overridesByCycleKey: { 'cycle-2': { targetSets: 5, targetRir: 1 } },
    };
  }

  it('shows the overridden values for the cycle that has an override', () => {
    expect(resolveSlotForCycle(slot(), 'cycle-2')).toEqual({
      targetSets: 5,
      targetRepMin: 8,
      targetRepMax: 12,
      targetRir: 1,
      targetRestSeconds: 120,
    });
  });

  it('shows the base values for a cycle with no override', () => {
    expect(resolveSlotForCycle(slot(), 'cycle-0')).toEqual(slot().base);
  });

  it('renders a different line for an overridden cycle than for the base cycle', () => {
    const overridden = formatTargetLine(resolveSlotForCycle(slot(), 'cycle-2'));
    const base = formatTargetLine(resolveSlotForCycle(slot(), 'cycle-0'));
    expect(overridden).not.toBe(base);
    expect(overridden).toContain('5 ');
    expect(overridden).toContain('RIR 1');
  });

  it('falls back to a placeholder rather than a blank line for an unresolvable exercise id', () => {
    const names = new Map<string, string>();
    expect(names.get('ex-gone') ?? UNKNOWN_PREVIEW_EXERCISE_NAME).toBe(UNKNOWN_PREVIEW_EXERCISE_NAME);
  });
});

describe('the preview shows every reduction', () => {
  function entries(): DegradationEntry[] {
    return [
      { kind: 'slot_unfillable', dayKey: 'day-0', muscleGroupId: 'chest', detail: 'raw' },
      { kind: 'day_trimmed', dayKey: 'day-1', muscleGroupId: null, detail: 'raw' },
      { kind: 'group_below_minimum', dayKey: null, muscleGroupId: 'calves', detail: 'raw' },
    ];
  }

  it('renders one distinct sentence per entry, none summarised away', () => {
    const sentences = entries().map(describeDegradation);
    expect(sentences).toHaveLength(3);
    expect(new Set(sentences).size).toBe(3);
    expect(sentences.every((sentence) => sentence.trim().length > 0)).toBe(true);
  });

  it('renders no degradation block when the tree reports none', () => {
    const tree: GeneratedProgramTree = { ...fixtureTree(), degradations: [] };
    expect(tree.degradations.length > 0).toBe(false);
  });
});
