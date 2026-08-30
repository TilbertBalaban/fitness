import { and, eq, isNull } from 'drizzle-orm';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  generateProgram,
  isGenerationInput,
  type GeneratedProgramTree,
  type GenerationCatalog,
  type GenerationInput,
} from '@fitness/program-generator';
import { resolveInventory, type ResolvedInventory } from '@fitness/plate-math';
import {
  DELOAD_PLACEMENTS,
  EMPHASIS_LEVELS,
  EXPERIENCE_LEVELS,
  MUSCLE_GROUP_BODY_REGION,
  MUSCLE_GROUPS,
  SPLIT_PREFERENCES,
  TRAINING_GOALS,
  type BodyRegion,
  type DeloadPlacement,
  type EmphasisLevel,
  type EquipmentType,
  type ExperienceLevel,
  type MovementPattern,
  type MuscleGroupId,
  type MuscleRole,
  type SplitPreference,
  type TrainingGoal,
} from '@fitness/api-contracts';
import { ErrorBanner } from '@/components/ErrorBanner';
import { GeneratedProgramPreview } from '@/components/GeneratedProgramPreview';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SelectField } from '@/components/SelectField';
import { TextField } from '@/components/TextField';
import { authClient } from '@/lib/auth-client';
import { loadActiveEquipmentProfileId, loadEquipmentProfile } from '@/lib/db/equipment-profiles';
import { loadExcludedExerciseIds } from '@/lib/db/exclusions';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { loadExerciseNameMap } from '@/lib/db/programs/load-program';
import { materializeGeneratedProgram } from '@/lib/db/programs/materialize-generated-program';
import { exercise, exerciseMuscleMapping, seededExercise } from '@/lib/db/schema';
import {
  buildGenerationInput,
  defaultGeneratedRoutineName,
  DELOAD_PLACEMENT_LABEL,
  EMPHASIS_LEVEL_LABEL,
  errorField,
  EXPERIENCE_LEVEL_LABEL,
  fieldErrorMessage,
  MUSCLE_GROUP_LABEL,
  nextVariantSeed,
  validateWizardAnswers,
  WIZARD_DEFAULTS,
  WIZARD_STEPS,
  type WizardAnswers,
  type WizardPhase,
} from '@/lib/programs/generation-wizard';

export { defaultGeneratedRoutineName };

const TRAINING_GOAL_LABEL: Record<TrainingGoal, string> = {
  strength: 'Strength',
  hypertrophy: 'Muscle size',
  endurance: 'Endurance',
};

const SPLIT_PREFERENCE_LABEL: Record<SplitPreference, string> = {
  auto: 'Let the app choose',
  full_body: 'Full Body',
  upper_lower: 'Upper/Lower',
  push_pull_legs: 'Push/Pull/Legs',
};

const BODY_REGION_ORDER: readonly BodyRegion[] = ['chest', 'back', 'shoulders', 'arms', 'core', 'legs'];

const BODY_REGION_LABEL: Record<BodyRegion, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  arms: 'Arms',
  core: 'Core',
  legs: 'Legs',
};

// The tracer's fixed answers, kept as the shape 11-01's tests read. The wizard itself starts from
// WIZARD_DEFAULTS; this remains the objective scenario 11-06's parity run replays.
export const TRACER_DEFAULTS: Pick<
  GenerationInput,
  | 'trainingGoal'
  | 'experienceLevel'
  | 'daysPerWeek'
  | 'sessionLengthMinutes'
  | 'splitPreference'
  | 'emphasis'
  | 'deloadPlacement'
  | 'deloadEveryNCycles'
  | 'trainingCycleCount'
  | 'variantSeed'
> = {
  trainingGoal: 'hypertrophy',
  experienceLevel: 'intermediate',
  daysPerWeek: 3,
  sessionLengthMinutes: 60,
  splitPreference: 'full_body',
  emphasis: {},
  deloadPlacement: 'none',
  deloadEveryNCycles: null,
  trainingCycleCount: 4,
  variantSeed: 1,
};

// Union of seeded rows and the user's own custom rows, mirroring apps/mobile/app/exercises/
// index.tsx's loadCatalogRows — a narrower projection (only the fields generateProgram reads).
export async function loadGenerationCatalog(db: WriteDb): Promise<GenerationCatalog> {
  const seededRows = await db
    .select({
      id: seededExercise.id,
      name: seededExercise.name,
      movementPattern: seededExercise.movementPattern,
      equipmentRequired: seededExercise.equipmentRequired,
    })
    .from(seededExercise)
    .where(isNull(seededExercise.archivedAt));

  const customRows = await db
    .select({
      id: exercise.id,
      name: exercise.name,
      movementPattern: exercise.movementPattern,
      equipmentRequired: exercise.equipmentRequired,
    })
    .from(exercise)
    .where(and(eq(exercise.isCustom, true), isNull(exercise.archivedAt)));

  const exercises = [...seededRows, ...customRows].map((row) => ({
    id: row.id,
    name: row.name,
    equipmentRequired: row.equipmentRequired as EquipmentType | null,
    movementPattern: row.movementPattern as MovementPattern | null,
  }));

  const mappingRows = await db
    .select({
      exerciseId: exerciseMuscleMapping.exerciseId,
      muscleGroupId: exerciseMuscleMapping.muscleGroupId,
      role: exerciseMuscleMapping.role,
      weightFactor: exerciseMuscleMapping.weightFactor,
    })
    .from(exerciseMuscleMapping);

  const mappings = mappingRows.map((row) => ({
    exerciseId: row.exerciseId,
    muscleGroupId: row.muscleGroupId as GenerationCatalog['mappings'][number]['muscleGroupId'],
    role: row.role as MuscleRole,
    weightFactor: row.weightFactor,
  }));

  return { exercises, mappings };
}

// Returns null when no gym profile is chosen yet — a real distinct case from an empty inventory,
// so generateProgram's candidate-pool filter is skipped entirely rather than rejecting everything.
export async function loadActiveInventory(userId: string, db: WriteDb): Promise<ResolvedInventory | null> {
  const profileId = await loadActiveEquipmentProfileId(userId, db);
  if (!profileId) return null;

  const profile = await loadEquipmentProfile(profileId, db);
  if (!profile) return null;

  return resolveInventory(profile);
}

export interface GenerateScreenDeps {
  loadCatalog: (db: WriteDb) => Promise<GenerationCatalog>;
  loadInventory: (userId: string, db: WriteDb) => Promise<ResolvedInventory | null>;
  loadExclusions: (db: WriteDb, userId: string) => Promise<string[]>;
  generateProgram: (input: GenerationInput) => GeneratedProgramTree;
  materializeGeneratedProgram: typeof materializeGeneratedProgram;
}

export const DEFAULT_GENERATE_SCREEN_DEPS: GenerateScreenDeps = {
  loadCatalog: loadGenerationCatalog,
  loadInventory: loadActiveInventory,
  loadExclusions: loadExcludedExerciseIds,
  generateProgram,
  materializeGeneratedProgram,
};

// Pure orchestration of the "Generate" action, exported so generate-screen.test.ts can assert the
// generate-then-confirm sequencing (a writer spy has zero calls after this alone) without
// rendering the screen.
//
// A failed exclusion read propagates rather than degrading to an empty list: generating against no
// exclusions because the read failed would put an exercise the user refused into their program and
// look like a successful generation, which is exactly the silent failure D-09 forbids. The throw
// reaches handleGenerate's catch, so the screen shows its error state and deps.generateProgram is
// never called.
export async function runGeneration(
  userId: string,
  db: WriteDb,
  deps: GenerateScreenDeps = DEFAULT_GENERATE_SCREEN_DEPS,
  answers?: WizardAnswers,
): Promise<GeneratedProgramTree> {
  const [catalog, inventory, excludedExerciseIds] = await Promise.all([
    deps.loadCatalog(db),
    deps.loadInventory(userId, db),
    deps.loadExclusions(db, userId),
  ]);

  const input: GenerationInput = answers
    ? buildGenerationInput(answers, { catalog, inventory, excludedExerciseIds })
    : {
        routineName: defaultGeneratedRoutineName(TRACER_DEFAULTS.trainingGoal, TRACER_DEFAULTS.splitPreference),
        ...TRACER_DEFAULTS,
        catalog,
        inventory,
        excludedExerciseIds,
      };

  // T-11-05's second gate. buildGenerationInput assembles but never validates; this rejects the
  // whole input before the generator does any candidate-pool work, so a wizard that assembles
  // something the guard refuses surfaces it instead of bypassing it.
  if (!isGenerationInput(input)) {
    throw new Error('Those answers cannot be turned into a program. Change one and try again.');
  }

  return deps.generateProgram(input);
}

// Pure orchestration of the "Save"/confirm action — the only path that calls the writer. Never
// invoked as a side effect of generation itself (D-22).
export async function confirmGeneratedProgram(
  tree: GeneratedProgramTree,
  name: string,
  db: WriteDb,
  deps: GenerateScreenDeps = DEFAULT_GENERATE_SCREEN_DEPS,
): Promise<{ id: string }> {
  return deps.materializeGeneratedProgram({ tree, name }, db);
}

function parseWholeNumber(raw: string): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export interface EmphasisRegion {
  region: BodyRegion;
  label: string;
  muscleGroupIds: MuscleGroupId[];
}

// Grouped for display so nineteen controls read as six short lists rather than one long one.
export function emphasisRegions(): EmphasisRegion[] {
  return BODY_REGION_ORDER.map((region) => ({
    region,
    label: BODY_REGION_LABEL[region],
    muscleGroupIds: MUSCLE_GROUPS.filter((groupId) => MUSCLE_GROUP_BODY_REGION[groupId] === region),
  })).filter((entry) => entry.muscleGroupIds.length > 0);
}

export default function GenerateProgramScreen() {
  const router = useRouter();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const [answers, setAnswers] = useState<WizardAnswers>(WIZARD_DEFAULTS);
  const [phase, setPhase] = useState<WizardPhase>('answering');
  const [tree, setTree] = useState<GeneratedProgramTree | null>(null);
  const [exerciseNames, setExerciseNames] = useState<Map<string, string>>(new Map());
  const [name, setName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const names = await loadExerciseNameMap(getPowerSync());
        if (mounted) setExerciseNames(names);
      } catch (caught) {
        console.error('exercise name map load failed', caught);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const validationError = validateWizardAnswers(answers);

  const messageFor = useCallback(
    (field: keyof WizardAnswers): string | null => {
      if (validationError === null) return null;
      if (errorField(validationError) !== field) return null;
      return fieldErrorMessage(validationError);
    },
    [validationError],
  );

  const update = useCallback((patch: Partial<WizardAnswers>) => {
    setAnswers((current) => ({ ...current, ...patch }));
  }, []);

  const runWith = useCallback(
    async (nextAnswers: WizardAnswers) => {
      if (!userId) return;
      if (validateWizardAnswers(nextAnswers) !== null) return;

      setError(null);
      setGenerating(true);
      try {
        const generated = await runGeneration(userId, getPowerSync(), DEFAULT_GENERATE_SCREEN_DEPS, nextAnswers);
        setTree(generated);
        setName((current) =>
          current.trim().length > 0
            ? current
            : defaultGeneratedRoutineName(nextAnswers.trainingGoal ?? 'hypertrophy', nextAnswers.splitPreference),
        );
        setPhase('previewing');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not generate a program');
      } finally {
        setGenerating(false);
      }
    },
    [userId],
  );

  const handleGenerate = useCallback(async () => {
    await runWith(answers);
  }, [answers, runWith]);

  const handleRegenerate = useCallback(async () => {
    const rerolled = { ...answers, variantSeed: nextVariantSeed(answers.variantSeed) };
    setAnswers(rerolled);
    await runWith(rerolled);
  }, [answers, runWith]);

  const handleSave = useCallback(async () => {
    if (!tree || saving) return;
    setError(null);
    setSaving(true);
    try {
      const result = await confirmGeneratedProgram(tree, name, getPowerSync());
      router.replace({ pathname: '/(tabs)/programs', params: { routineId: result.id } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the generated program');
    } finally {
      setSaving(false);
    }
  }, [name, router, saving, tree]);

  const stepTitle = (key: string): string => WIZARD_STEPS.find((step) => step.key === key)?.title ?? '';

  if (phase === 'previewing' && tree) {
    return (
      <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
        <View className="mt-xl gap-md">
          <Text className="text-heading font-semibold text-foreground">Your program</Text>

          {error ? <ErrorBanner message={error} /> : null}

          <TextField label="Program name" value={name} onChangeText={setName} />

          <GeneratedProgramPreview tree={tree} exerciseNames={exerciseNames} />

          <View className="gap-sm">
            <PrimaryButton label="Save Program" onPress={() => void handleSave()} submitting={saving} />

            <Pressable
              onPress={() => void handleRegenerate()}
              accessibilityRole="button"
              accessibilityLabel="Regenerate"
              style={{ minHeight: 48, justifyContent: 'center' }}
            >
              <Text className="text-body font-normal text-accent">Regenerate</Text>
            </Pressable>

            <Pressable
              onPress={() => setPhase('answering')}
              accessibilityRole="button"
              accessibilityLabel="Change your answers"
              style={{ minHeight: 48, justifyContent: 'center' }}
            >
              <Text className="text-body font-normal text-foreground-muted">Change your answers</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
      <View className="mt-xl gap-lg">
        <Text className="text-heading font-semibold text-foreground">Generate Program</Text>

        {error ? <ErrorBanner message={error} /> : null}

        <SelectField
          label={stepTitle('goal')}
          value={answers.trainingGoal}
          options={TRAINING_GOALS.map((goal) => ({ value: goal, label: TRAINING_GOAL_LABEL[goal] }))}
          placeholder="Choose a goal"
          onChange={(value) => update({ trainingGoal: value as TrainingGoal })}
          error={messageFor('trainingGoal')}
        />

        <SelectField
          label={stepTitle('experience')}
          value={answers.experienceLevel}
          options={EXPERIENCE_LEVELS.map((level) => ({ value: level, label: EXPERIENCE_LEVEL_LABEL[level] }))}
          placeholder="Choose how long you have been lifting"
          onChange={(value) => update({ experienceLevel: value as ExperienceLevel })}
          error={messageFor('experienceLevel')}
        />

        <TextField
          label="Training days per week"
          value={String(answers.daysPerWeek)}
          keyboardType="number-pad"
          onChangeText={(value) => update({ daysPerWeek: parseWholeNumber(value) })}
          error={messageFor('daysPerWeek')}
        />

        <TextField
          label="Minutes per session"
          value={String(answers.sessionLengthMinutes)}
          keyboardType="number-pad"
          onChangeText={(value) => update({ sessionLengthMinutes: parseWholeNumber(value) })}
          error={messageFor('sessionLengthMinutes')}
        />

        <SelectField
          label={stepTitle('split')}
          value={answers.splitPreference}
          options={SPLIT_PREFERENCES.map((preference) => ({
            value: preference,
            label: SPLIT_PREFERENCE_LABEL[preference],
          }))}
          placeholder="Choose how to divide the week"
          onChange={(value) => update({ splitPreference: value as SplitPreference })}
        />

        <View className="gap-sm">
          <Text className="text-body font-semibold text-foreground">{stepTitle('emphasis')}</Text>
          <Text className="text-label font-normal text-foreground-muted">
            Everything starts at Normal. Choosing More gives a muscle group extra sets each week; choosing Less gives it
            fewer, and frees that time for the rest.
          </Text>

          {emphasisRegions().map((region) => (
            <View key={region.region} className="gap-xs">
              <Text className="text-label font-normal text-foreground-muted">{region.label}</Text>
              {region.muscleGroupIds.map((groupId) => (
                <SelectField
                  key={groupId}
                  label={MUSCLE_GROUP_LABEL[groupId]}
                  // Absent means normal — see buildGenerationInput. The control shows Normal
                  // selected without writing it into the answers.
                  value={answers.emphasis[groupId] ?? 'normal'}
                  options={EMPHASIS_LEVELS.map((level) => ({ value: level, label: EMPHASIS_LEVEL_LABEL[level] }))}
                  placeholder="Normal"
                  onChange={(value) => {
                    const level = value as EmphasisLevel;
                    const nextEmphasis = { ...answers.emphasis };
                    if (level === 'normal') delete nextEmphasis[groupId];
                    else nextEmphasis[groupId] = level;
                    update({ emphasis: nextEmphasis });
                  }}
                />
              ))}
            </View>
          ))}
        </View>

        <SelectField
          label={stepTitle('deload')}
          value={answers.deloadPlacement}
          options={DELOAD_PLACEMENTS.map((placement) => ({ value: placement, label: DELOAD_PLACEMENT_LABEL[placement] }))}
          placeholder="Choose when to deload"
          onChange={(value) => update({ deloadPlacement: value as DeloadPlacement })}
        />

        {answers.deloadPlacement === 'every_n_cycles' ? (
          <TextField
            label="Deload every how many cycles"
            value={answers.deloadEveryNCycles === null ? '' : String(answers.deloadEveryNCycles)}
            keyboardType="number-pad"
            onChangeText={(value) => update({ deloadEveryNCycles: parseWholeNumber(value) })}
            error={messageFor('deloadEveryNCycles')}
          />
        ) : null}

        <TextField
          label="How many cycles"
          value={String(answers.trainingCycleCount)}
          keyboardType="number-pad"
          onChangeText={(value) => update({ trainingCycleCount: parseWholeNumber(value) })}
          error={messageFor('trainingCycleCount')}
        />

        <PrimaryButton label="Generate" onPress={() => void handleGenerate()} submitting={generating} />
      </View>
    </ScrollView>
  );
}
