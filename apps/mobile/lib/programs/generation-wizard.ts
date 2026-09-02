import {
  MUSCLE_GROUPS,
  type DeloadPlacement,
  type EmphasisLevel,
  type ExperienceLevel,
  type MuscleGroupId,
  type SplitPreference,
  type TrainingGoal,
} from '@fitness/api-contracts';
import {
  GENERATION_INPUT_LIMITS,
  resolveSplitTemplate,
  type DegradationEntry,
  type GenerationCatalog,
  type GenerationInput,
} from '@fitness/program-generator';
import type { ResolvedInventory } from '@fitness/plate-math';

export type WizardPhase = 'answering' | 'previewing';

export interface WizardAnswers {
  trainingGoal: TrainingGoal | null;
  experienceLevel: ExperienceLevel | null;
  daysPerWeek: number;
  sessionLengthMinutes: number;
  splitPreference: SplitPreference;
  emphasis: Partial<Record<MuscleGroupId, EmphasisLevel>>;
  deloadPlacement: DeloadPlacement;
  deloadEveryNCycles: number | null;
  trainingCycleCount: number;
  variantSeed: number;
  routineName: string;
}

// D-13 makes `auto` the split default and D-19 makes `every_n_cycles` the deload default, so a
// user who answers only goal, level, days and session length still receives a periodized program
// rather than an unanswered form.
export const WIZARD_DEFAULTS: WizardAnswers = {
  trainingGoal: null,
  experienceLevel: null,
  daysPerWeek: 3,
  sessionLengthMinutes: 60,
  splitPreference: 'auto',
  emphasis: {},
  deloadPlacement: 'every_n_cycles',
  deloadEveryNCycles: 4,
  trainingCycleCount: 4,
  variantSeed: 0,
  routineName: '',
};

export interface WizardStep {
  key: string;
  title: string;
  fields: readonly (keyof WizardAnswers)[];
}

// The form's section order is data, not JSX arrangement, so the order a user is asked in can be
// changed and asserted without touching the screen.
export const WIZARD_STEPS = [
  { key: 'goal', title: 'What are you training for?', fields: ['trainingGoal'] },
  { key: 'experience', title: 'How long have you been lifting?', fields: ['experienceLevel'] },
  { key: 'schedule', title: 'Your week', fields: ['daysPerWeek', 'sessionLengthMinutes'] },
  { key: 'split', title: 'How to divide the week', fields: ['splitPreference'] },
  { key: 'emphasis', title: 'Anything you want more or less of', fields: ['emphasis'] },
  { key: 'deload', title: 'Deloads', fields: ['deloadPlacement', 'deloadEveryNCycles', 'trainingCycleCount'] },
] as const satisfies readonly WizardStep[];

export type WizardValidationError =
  | 'goal-required'
  | 'level-required'
  | 'days-out-of-range'
  | 'session-too-short'
  | 'session-too-long'
  | 'cycles-out-of-range'
  | 'split-unsupported'
  | 'emphasis-unknown-group'
  | 'deload-interval-invalid';

const MUSCLE_GROUP_SET = new Set<string>(MUSCLE_GROUPS);

function isWholeNumberInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

// Every numeric bound comes from GENERATION_INPUT_LIMITS rather than a retyped literal: this
// function and isGenerationInput are two independent gates on the same input (T-11-05), and two
// gates that disagree about a bound are worse than one, because the wizard would let through what
// the generator then throws on.
export function validateWizardAnswers(answers: WizardAnswers): WizardValidationError | null {
  if (answers.trainingGoal === null) return 'goal-required';
  if (answers.experienceLevel === null) return 'level-required';

  if (!isWholeNumberInRange(answers.daysPerWeek, GENERATION_INPUT_LIMITS.minDaysPerWeek, GENERATION_INPUT_LIMITS.maxDaysPerWeek)) {
    return 'days-out-of-range';
  }
  if (!Number.isInteger(answers.sessionLengthMinutes)) return 'session-too-short';
  if (answers.sessionLengthMinutes < GENERATION_INPUT_LIMITS.minSessionLengthMinutes) return 'session-too-short';
  if (answers.sessionLengthMinutes > GENERATION_INPUT_LIMITS.maxSessionLengthMinutes) return 'session-too-long';

  if (
    !isWholeNumberInRange(
      answers.trainingCycleCount,
      GENERATION_INPUT_LIMITS.minTrainingCycleCount,
      GENERATION_INPUT_LIMITS.maxTrainingCycleCount,
    )
  ) {
    return 'cycles-out-of-range';
  }

  if (answers.deloadPlacement === 'every_n_cycles') {
    const interval = answers.deloadEveryNCycles;
    if (interval === null || !Number.isInteger(interval) || interval < 1) return 'deload-interval-invalid';
  }

  for (const [muscleGroupId] of Object.entries(answers.emphasis)) {
    if (!MUSCLE_GROUP_SET.has(muscleGroupId)) return 'emphasis-unknown-group';
  }

  // Asks the table its own question rather than consulting a copied matrix — a second opinion here
  // would rot the moment a template row is added.
  if (resolveSplitTemplate(answers.splitPreference, answers.daysPerWeek).kind === 'unsupported') {
    return 'split-unsupported';
  }

  return null;
}

// The codes above are internal; these are the strings a user reads. Kept beside the union so a new
// code cannot be added without the switch failing to typecheck. Each names the field it is about,
// and describes what the app needs rather than what the user got wrong.
export function fieldErrorMessage(error: WizardValidationError): string {
  switch (error) {
    case 'goal-required':
      return 'Choose what you are training for.';
    case 'level-required':
      return 'Choose how long you have been lifting.';
    case 'days-out-of-range':
      return `Training days per week has to be a whole number between ${GENERATION_INPUT_LIMITS.minDaysPerWeek} and ${GENERATION_INPUT_LIMITS.maxDaysPerWeek}.`;
    case 'session-too-short':
      return `Session length has to be a whole number of at least ${GENERATION_INPUT_LIMITS.minSessionLengthMinutes} minutes.`;
    case 'session-too-long':
      return `Session length has to be ${GENERATION_INPUT_LIMITS.maxSessionLengthMinutes} minutes or less.`;
    case 'cycles-out-of-range':
      return `Number of cycles has to be a whole number between ${GENERATION_INPUT_LIMITS.minTrainingCycleCount} and ${GENERATION_INPUT_LIMITS.maxTrainingCycleCount}.`;
    case 'split-unsupported':
      return 'That split does not fit this many training days. Pick another split, or change the number of days.';
    case 'emphasis-unknown-group':
      return 'One of the muscle groups is not one this app knows. Reset the emphasis choices.';
    case 'deload-interval-invalid':
      return 'A deload every N cycles needs a whole number of cycles of at least 1.';
  }
}

// Which field a message belongs beside, so the screen renders it against the control the user has
// to change rather than as a banner at the top of a seven-section form.
export function errorField(error: WizardValidationError): keyof WizardAnswers {
  switch (error) {
    case 'goal-required':
      return 'trainingGoal';
    case 'level-required':
      return 'experienceLevel';
    case 'days-out-of-range':
    case 'split-unsupported':
      return 'daysPerWeek';
    case 'session-too-short':
    case 'session-too-long':
      return 'sessionLengthMinutes';
    case 'cycles-out-of-range':
      return 'trainingCycleCount';
    case 'emphasis-unknown-group':
      return 'emphasis';
    case 'deload-interval-invalid':
      return 'deloadEveryNCycles';
  }
}

export interface GenerationContext {
  catalog: GenerationCatalog;
  inventory: ResolvedInventory | null;
  excludedExerciseIds: string[];
}

// Assembly only: no I/O, and no validation of its own, because validateWizardAnswers runs before it
// and isGenerationInput runs after it. The emphasis map is passed through unchanged — a group the
// user never touched stays absent, and absent means normal in applyEmphasis. Materialising nineteen
// explicit `normal` entries would freeze today's default into every generation and make a later
// change to it invisible.
export function buildGenerationInput(answers: WizardAnswers, context: GenerationContext): GenerationInput {
  return {
    routineName:
      answers.routineName.trim().length > 0
        ? answers.routineName
        : defaultGeneratedRoutineName(answers.trainingGoal ?? 'hypertrophy', answers.splitPreference),
    trainingGoal: answers.trainingGoal ?? 'hypertrophy',
    experienceLevel: answers.experienceLevel ?? 'intermediate',
    daysPerWeek: answers.daysPerWeek,
    sessionLengthMinutes: answers.sessionLengthMinutes,
    splitPreference: answers.splitPreference,
    emphasis: answers.emphasis,
    deloadPlacement: answers.deloadPlacement,
    deloadEveryNCycles: answers.deloadPlacement === 'every_n_cycles' ? answers.deloadEveryNCycles : null,
    trainingCycleCount: answers.trainingCycleCount,
    variantSeed: answers.variantSeed,
    catalog: context.catalog,
    inventory: context.inventory,
    excludedExerciseIds: context.excludedExerciseIds,
  };
}

// Arithmetic on its argument, never a random draw: a user who regenerates three times and prefers
// the first result can get it back by returning to that seed, and D-03's determinism claim is only
// meaningful if the seed sequence itself is reproducible.
export function nextVariantSeed(seed: number): number {
  return seed + 1;
}

const SPLIT_PREFERENCE_LABEL: Record<SplitPreference, string> = {
  auto: 'Auto',
  full_body: 'Full Body',
  upper_lower: 'Upper/Lower',
  push_pull_legs: 'Push/Pull/Legs',
};

const TRAINING_GOAL_LABEL: Record<TrainingGoal, string> = {
  strength: 'Strength',
  hypertrophy: 'Hypertrophy',
  endurance: 'Endurance',
};

export const EXPERIENCE_LEVEL_LABEL: Record<ExperienceLevel, string> = {
  beginner: 'Under a year',
  intermediate: 'One to three years',
  advanced: 'More than three years',
};

export const EMPHASIS_LEVEL_LABEL: Record<EmphasisLevel, string> = {
  deprioritize: 'Less',
  normal: 'Normal',
  emphasize: 'More',
};

export const DELOAD_PLACEMENT_LABEL: Record<DeloadPlacement, string> = {
  none: 'No deload',
  every_n_cycles: 'Every few cycles',
  final_cycle_only: 'Last cycle only',
};

export const MUSCLE_GROUP_LABEL: Record<MuscleGroupId, string> = {
  chest: 'Chest',
  front_delts: 'Front delts',
  side_delts: 'Side delts',
  rear_delts: 'Rear delts',
  lats: 'Lats',
  upper_back_traps: 'Upper back & traps',
  lower_back: 'Lower back',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs',
  obliques: 'Obliques',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  adductors: 'Adductors',
  abductors: 'Abductors',
  neck: 'Neck',
};

// A sensible, editable default — never the sole source of truth for the tree's own `goal` display
// label, which generateProgram sets independently.
export function defaultGeneratedRoutineName(goal: TrainingGoal, splitPreference: SplitPreference): string {
  return `${TRAINING_GOAL_LABEL[goal]} — ${SPLIT_PREFERENCE_LABEL[splitPreference]}`;
}

function nameOf(muscleGroupId: MuscleGroupId | null): string {
  if (muscleGroupId === null) return 'a muscle group';
  return MUSCLE_GROUP_LABEL[muscleGroupId].toLowerCase();
}

function whereOf(dayKey: string | null): string {
  return dayKey === null ? 'this program' : 'one of your days';
}

// D-21's copy. Each sentence says what the app did and why. None of them says what the user lacks:
// a trimmed day reports the time the session had, not that the user does not train long enough.
export function describeDegradation(entry: DegradationEntry): string {
  switch (entry.kind) {
    case 'slot_unfillable':
      return `No exercise for ${nameOf(entry.muscleGroupId)} fits your gym and your exclusions, so ${whereOf(entry.dayKey)} has one fewer exercise.`;
    case 'day_trimmed':
      return `The session length you chose meant ${whereOf(entry.dayKey)} does fewer sets, fewer exercises, or both.`;
    case 'split_unsupported':
      return 'That split and that number of training days do not go together, so no program was built. Pick another split, or change the number of days.';
    case 'group_below_minimum':
      return `There was not enough room to reach the weekly set target for ${nameOf(entry.muscleGroupId)}, so it gets fewer sets than planned.`;
  }
}
