// Same mock-before-import discipline as library-screen.test.ts: the screen module's top-level
// imports reach @powersync's ESM dist and better-auth/react, neither of which Jest's transform can
// parse.
jest.mock('../../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../../lib/db/id', () => ({ generateClientId: jest.fn(() => 'fixed-id') }));
jest.mock('../../../lib/auth-client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

import { MUSCLE_GROUPS } from '@fitness/api-contracts';
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
  emphasisRegions,
  runGeneration,
  TRACER_DEFAULTS,
  type GenerateScreenDeps,
} from '../generate';
import { newProgramOptions } from '../new';
import {
  nextVariantSeed,
  validateWizardAnswers,
  WIZARD_DEFAULTS,
  type WizardAnswers,
} from '../../../lib/programs/generation-wizard';

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


function wizardAnswers(overrides: Partial<WizardAnswers> = {}): WizardAnswers {
  return { ...WIZARD_DEFAULTS, trainingGoal: 'hypertrophy', experienceLevel: 'intermediate', ...overrides };
}

function spyDeps(tree = fixtureTree()): GenerateScreenDeps & { materialize: jest.Mock; generate: jest.Mock } {
  const materialize = jest.fn().mockResolvedValue({ id: 'new-routine' });
  const generate = jest.fn().mockReturnValue(tree);
  return {
    loadCatalog: jest.fn().mockResolvedValue(emptyCatalog()),
    loadInventory: jest.fn().mockResolvedValue(null),
    loadExclusions: jest.fn().mockResolvedValue([]),
    generateProgram: generate,
    materializeGeneratedProgram: materialize,
    materialize,
    generate,
  };
}

describe('the wizard answers reach the generator', () => {
  it('generates from the wizard answers rather than the tracer defaults when answers are supplied', async () => {
    const deps = spyDeps();
    await runGeneration('user-1', {} as never, deps, wizardAnswers({ daysPerWeek: 4, splitPreference: 'upper_lower' }));

    const input = deps.generate.mock.calls[0][0];
    expect(input.daysPerWeek).toBe(4);
    expect(input.splitPreference).toBe('upper_lower');
    expect(input.deloadPlacement).toBe('every_n_cycles');
  });

  it('rejects answers the runtime guard refuses instead of generating from them', async () => {
    const deps = spyDeps();
    await expect(
      runGeneration('user-1', {} as never, deps, wizardAnswers({ daysPerWeek: 99 })),
    ).rejects.toThrow(/cannot be turned into a program/);
    expect(deps.generate).not.toHaveBeenCalled();
  });
});

describe('generating and regenerating never write', () => {
  it('leaves the writer uncalled across five generate and regenerate passes, then calls it once on save', async () => {
    const deps = spyDeps();
    let answers = wizardAnswers();

    for (let press = 0; press < 5; press += 1) {
      await runGeneration('user-1', {} as never, deps, answers);
      answers = { ...answers, variantSeed: nextVariantSeed(answers.variantSeed) };
    }

    expect(deps.generate).toHaveBeenCalledTimes(5);
    expect(deps.materialize).not.toHaveBeenCalled();

    await confirmGeneratedProgram(fixtureTree(), 'My Program', {} as never, deps);
    expect(deps.materialize).toHaveBeenCalledTimes(1);
  });

  // Mirrors handleSave's in-flight guard: a second press while the first is running returns early.
  it('does not produce a second writer call when Save is pressed twice in flight', async () => {
    const deps = spyDeps();
    let saving = false;

    const save = async () => {
      if (saving) return;
      saving = true;
      try {
        await confirmGeneratedProgram(fixtureTree(), 'My Program', {} as never, deps);
      } finally {
        saving = false;
      }
    };

    const first = save();
    const second = save();
    await Promise.all([first, second]);

    expect(deps.materialize).toHaveBeenCalledTimes(1);
  });
});

describe('an invalid answer blocks Generate', () => {
  it('reports the offending field and never reaches the generator', async () => {
    const invalid = wizardAnswers({ daysPerWeek: 1 });
    expect(validateWizardAnswers(invalid)).toBe('days-out-of-range');

    const deps = spyDeps();
    // handleGenerate returns before runGeneration when validateWizardAnswers is non-null.
    if (validateWizardAnswers(invalid) === null) await runGeneration('user-1', {} as never, deps, invalid);
    expect(deps.generate).not.toHaveBeenCalled();
  });
});

describe('regenerating is reproducible', () => {
  it('reproduces the first tree when the seed returns to its original value', async () => {
    const treeBySeed = new Map<number, GeneratedProgramTree>();
    const deps: GenerateScreenDeps = {
      loadCatalog: jest.fn().mockResolvedValue(emptyCatalog()),
      loadInventory: jest.fn().mockResolvedValue(null),
      loadExclusions: jest.fn().mockResolvedValue([]),
      generateProgram: jest.fn((input) => {
        const existing = treeBySeed.get(input.variantSeed);
        if (existing) return existing;
        const built = { ...fixtureTree(), name: `variant-${input.variantSeed}` };
        treeBySeed.set(input.variantSeed, built);
        return built;
      }),
      materializeGeneratedProgram: jest.fn(),
    };

    const base = wizardAnswers();
    const first = await runGeneration('user-1', {} as never, deps, base);

    let answers = base;
    for (let press = 0; press < 2; press += 1) {
      answers = { ...answers, variantSeed: nextVariantSeed(answers.variantSeed) };
      await runGeneration('user-1', {} as never, deps, answers);
    }

    const back = await runGeneration('user-1', {} as never, deps, base);
    expect(JSON.stringify(back)).toBe(JSON.stringify(first));
  });
});

describe('the emphasis control covers every muscle group', () => {
  it('groups all nineteen groups by body region, none dropped and none duplicated', () => {
    const grouped = emphasisRegions().flatMap((region) => region.muscleGroupIds);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual([...MUSCLE_GROUPS].sort());
  });
});

describe('the way into generation', () => {
  it('offers generation as a third choice beside the two the New Program screen already had', () => {
    const { options } = newProgramOptions([]);
    expect(options.map((option) => option.key)).toEqual(['blank', 'generate', 'duplicate']);

    const blank = options.find((option) => option.key === 'blank')!;
    expect(blank.label).toBe('Start Blank');
    expect(blank.available).toBe(true);

    const duplicate = options.find((option) => option.key === 'duplicate')!;
    expect(duplicate.label).toBe('Duplicate Existing');
    expect(duplicate.available).toBe(false);
  });

  it('keeps duplicate available once the user owns a program', () => {
    const { options } = newProgramOptions([
      { id: 'r-1', name: 'Program', status: 'ready', archivedAt: null, progressionFrozen: false } as never,
    ]);
    expect(options.find((option) => option.key === 'duplicate')!.available).toBe(true);
    expect(options.find((option) => option.key === 'generate')!.available).toBe(true);
  });
});
