// Same mock-before-import discipline as library-screen.test.ts: the screen module's top-level
// imports reach @powersync's ESM dist and better-auth/react, neither of which Jest's transform can
// parse.
jest.mock('../../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../../lib/db/id', () => ({ generateClientId: jest.fn(() => 'fixed-id') }));
jest.mock('../../../lib/auth-client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

import type { GeneratedProgramTree, GenerationCatalog } from '@fitness/program-generator';
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
