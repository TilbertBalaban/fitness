import { MUSCLE_GROUPS, TRAINING_GOALS, SPLIT_PREFERENCES } from '@fitness/api-contracts';
import {
  DEGRADATION_KINDS,
  GENERATION_INPUT_LIMITS,
  isGenerationInput,
  type DegradationEntry,
  type GenerationCatalog,
} from '@fitness/program-generator';
import {
  buildGenerationInput,
  defaultGeneratedRoutineName,
  describeDegradation,
  errorField,
  fieldErrorMessage,
  nextVariantSeed,
  validateWizardAnswers,
  WIZARD_DEFAULTS,
  WIZARD_STEPS,
  type GenerationContext,
  type WizardAnswers,
} from '../generation-wizard';

function answered(overrides: Partial<WizardAnswers> = {}): WizardAnswers {
  return { ...WIZARD_DEFAULTS, trainingGoal: 'hypertrophy', experienceLevel: 'intermediate', ...overrides };
}

function context(): GenerationContext {
  const catalog: GenerationCatalog = { exercises: [], mappings: [] };
  return { catalog, inventory: null, excludedExerciseIds: [] };
}

describe('WIZARD_DEFAULTS', () => {
  it('defaults split to auto and deload to every N cycles, so three answers are enough', () => {
    expect(WIZARD_DEFAULTS.splitPreference).toBe('auto');
    expect(WIZARD_DEFAULTS.deloadPlacement).toBe('every_n_cycles');
    expect(WIZARD_DEFAULTS.deloadEveryNCycles).toBe(4);
    expect(WIZARD_DEFAULTS.trainingCycleCount).toBe(4);
    expect(WIZARD_DEFAULTS.emphasis).toEqual({});
    expect(WIZARD_DEFAULTS.variantSeed).toBe(0);
  });

  it('declares the section order as data, covering every answer field a user edits', () => {
    const covered = new Set(WIZARD_STEPS.flatMap((step) => [...step.fields]));
    for (const field of [
      'trainingGoal',
      'experienceLevel',
      'daysPerWeek',
      'sessionLengthMinutes',
      'splitPreference',
      'emphasis',
      'deloadPlacement',
    ] as const) {
      expect(covered.has(field)).toBe(true);
    }
  });
});

describe('validateWizardAnswers', () => {
  it('accepts the defaults plus a goal, level, day count and session length', () => {
    expect(validateWizardAnswers(answered())).toBeNull();
  });

  it('requires a goal and a level before anything else', () => {
    expect(validateWizardAnswers({ ...WIZARD_DEFAULTS })).toBe('goal-required');
    expect(validateWizardAnswers({ ...WIZARD_DEFAULTS, trainingGoal: 'strength' })).toBe('level-required');
  });

  it('rejects a day count below or above the generator limits, naming the field', () => {
    expect(validateWizardAnswers(answered({ daysPerWeek: 1 }))).toBe('days-out-of-range');
    expect(validateWizardAnswers(answered({ daysPerWeek: 7 }))).toBe('days-out-of-range');
    expect(errorField('days-out-of-range')).toBe('daysPerWeek');
  });

  it('rejects a session shorter or longer than the generator accepts', () => {
    expect(validateWizardAnswers(answered({ sessionLengthMinutes: GENERATION_INPUT_LIMITS.minSessionLengthMinutes - 1 }))).toBe(
      'session-too-short',
    );
    expect(validateWizardAnswers(answered({ sessionLengthMinutes: GENERATION_INPUT_LIMITS.maxSessionLengthMinutes + 1 }))).toBe(
      'session-too-long',
    );
    expect(errorField('session-too-short')).toBe('sessionLengthMinutes');
  });

  it('rejects a declared unsupported split pair and accepts the same preference at a supported day count', () => {
    expect(validateWizardAnswers(answered({ splitPreference: 'push_pull_legs', daysPerWeek: 2 }))).toBe('split-unsupported');
    expect(validateWizardAnswers(answered({ splitPreference: 'push_pull_legs', daysPerWeek: 3 }))).toBeNull();
    expect(validateWizardAnswers(answered({ splitPreference: 'full_body', daysPerWeek: 5 }))).toBe('split-unsupported');
  });

  it('accepts an emphasis map over any subset of MUSCLE_GROUPS and rejects a key outside it', () => {
    expect(validateWizardAnswers(answered({ emphasis: { chest: 'emphasize', calves: 'deprioritize' } }))).toBeNull();
    expect(
      validateWizardAnswers(answered({ emphasis: { chest: 'emphasize', shins: 'normal' } as never })),
    ).toBe('emphasis-unknown-group');
  });

  it('rejects an invalid deload interval only while every-N-cycles is selected', () => {
    expect(validateWizardAnswers(answered({ deloadPlacement: 'every_n_cycles', deloadEveryNCycles: 0 }))).toBe(
      'deload-interval-invalid',
    );
    expect(validateWizardAnswers(answered({ deloadPlacement: 'none', deloadEveryNCycles: null }))).toBeNull();
  });

  it('rejects a cycle count outside the generator limits', () => {
    expect(validateWizardAnswers(answered({ trainingCycleCount: 0 }))).toBe('cycles-out-of-range');
    expect(
      validateWizardAnswers(answered({ trainingCycleCount: GENERATION_INPUT_LIMITS.maxTrainingCycleCount + 1 })),
    ).toBe('cycles-out-of-range');
  });

  it('gives every error code a non-empty message naming what to change', () => {
    const codes = [
      'goal-required',
      'level-required',
      'days-out-of-range',
      'session-too-short',
      'session-too-long',
      'cycles-out-of-range',
      'split-unsupported',
      'emphasis-unknown-group',
      'deload-interval-invalid',
    ] as const;
    const messages = codes.map((code) => fieldErrorMessage(code));
    expect(messages.every((message) => message.trim().length > 0)).toBe(true);
    expect(new Set(messages).size).toBe(codes.length);
  });
});

describe('buildGenerationInput', () => {
  it('produces an input the runtime guard accepts, from the defaults plus minimal answers', () => {
    expect(isGenerationInput(buildGenerationInput(answered(), context()))).toBe(true);
  });

  it('carries only the emphasis entries the user set, never a filled-in map of nineteen normals', () => {
    const input = buildGenerationInput(answered({ emphasis: { chest: 'emphasize', calves: 'deprioritize' } }), context());
    expect(Object.keys(input.emphasis)).toEqual(['chest', 'calves']);
    expect(Object.keys(input.emphasis).length).not.toBe(MUSCLE_GROUPS.length);
  });

  it('injects the caller-loaded catalog, inventory and exclusion ids unchanged', () => {
    const ctx = { ...context(), excludedExerciseIds: ['ex-a', 'ex-b'] };
    const input = buildGenerationInput(answered(), ctx);
    expect(input.catalog).toBe(ctx.catalog);
    expect(input.inventory).toBeNull();
    expect(input.excludedExerciseIds).toEqual(['ex-a', 'ex-b']);
  });

  it('drops the deload interval when the placement does not use one', () => {
    const input = buildGenerationInput(answered({ deloadPlacement: 'final_cycle_only', deloadEveryNCycles: 4 }), context());
    expect(input.deloadEveryNCycles).toBeNull();
  });

  it('falls back to the derived default name when the user cleared the field', () => {
    const input = buildGenerationInput(answered({ routineName: '   ' }), context());
    expect(input.routineName).toBe(defaultGeneratedRoutineName('hypertrophy', 'auto'));
  });
});

describe('nextVariantSeed', () => {
  it('produces a different value each call in sequence', () => {
    const seeds = [0, 1, 2].reduce<number[]>((acc) => [...acc, nextVariantSeed(acc[acc.length - 1] ?? 0)], [0]);
    expect(new Set(seeds).size).toBe(seeds.length);
  });

  it('replays the same three seeds from 0 on a second run', () => {
    const replay = () => {
      const out: number[] = [];
      let seed = 0;
      for (let i = 0; i < 3; i += 1) {
        seed = nextVariantSeed(seed);
        out.push(seed);
      }
      return out;
    };
    expect(replay()).toEqual(replay());
  });
});

describe('defaultGeneratedRoutineName', () => {
  it('names the goal and the split together', () => {
    expect(defaultGeneratedRoutineName('hypertrophy', 'push_pull_legs')).toBe('Hypertrophy — Push/Pull/Legs');
  });

  it('is never whitespace-only for any goal and split pair', () => {
    for (const goal of TRAINING_GOALS) {
      for (const preference of SPLIT_PREFERENCES) {
        expect(defaultGeneratedRoutineName(goal, preference).trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe('describeDegradation', () => {
  function entry(kind: (typeof DEGRADATION_KINDS)[number]): DegradationEntry {
    return { kind, dayKey: 'day-0', muscleGroupId: 'chest', detail: 'raw' };
  }

  // Enumerated from the imported tuple, so a kind added later without copy turns this red.
  it('returns a distinct non-empty sentence for every declared kind', () => {
    const sentences = DEGRADATION_KINDS.map((kind) => describeDegradation(entry(kind)));
    expect(sentences.every((sentence) => sentence.trim().length > 0)).toBe(true);
    expect(new Set(sentences).size).toBe(DEGRADATION_KINDS.length);
  });

  it('names the muscle group when the entry carries one', () => {
    expect(describeDegradation(entry('slot_unfillable'))).toContain('chest');
    expect(describeDegradation({ ...entry('slot_unfillable'), muscleGroupId: null })).toContain('a muscle group');
  });

  it('states the day_trimmed sentence mentions both sets and exercises, true for either concession', () => {
    const sentence = describeDegradation(entry('day_trimmed')).toLowerCase();
    expect(sentence).toMatch(/set/);
    expect(sentence).toMatch(/exercise/);
  });

  it('never frames a reduction as a shortcoming in the user', () => {
    for (const kind of DEGRADATION_KINDS) {
      expect(describeDegradation(entry(kind)).toLowerCase()).not.toMatch(/you (don't|do not|can't|cannot)|too weak|not enough time to train/);
    }
  });
});
