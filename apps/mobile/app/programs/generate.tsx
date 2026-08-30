import { and, eq, isNull } from 'drizzle-orm';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { generateProgram, type GeneratedProgramTree, type GenerationCatalog, type GenerationInput } from '@fitness/program-generator';
import { resolveInventory, type ResolvedInventory } from '@fitness/plate-math';
import type { EquipmentType, MovementPattern, MuscleRole, SplitPreference, TrainingGoal } from '@fitness/api-contracts';
import { PrimaryButton } from '@/components/PrimaryButton';
import { authClient } from '@/lib/auth-client';
import { loadActiveEquipmentProfileId, loadEquipmentProfile } from '@/lib/db/equipment-profiles';
import { loadExcludedExerciseIds } from '@/lib/db/exclusions';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { materializeGeneratedProgram } from '@/lib/db/programs/materialize-generated-program';
import { exercise, exerciseMuscleMapping, seededExercise } from '@/lib/db/schema';

// The tracer's fixed answers (11-CONTEXT.md's objective scenario): hypertrophy / intermediate /
// 3 days / 60 minutes / full body / no emphasis / no deload. 11-05 replaces this with a real
// multi-step wizard; this plan's screen renders exactly this one path end to end.
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

// A sensible, editable default — never the sole source of truth for the tree's own `goal` display
// label, which generateProgram sets independently.
export function defaultGeneratedRoutineName(goal: TrainingGoal, splitPreference: SplitPreference): string {
  return `${TRAINING_GOAL_LABEL[goal]} — ${SPLIT_PREFERENCE_LABEL[splitPreference]}`;
}

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
): Promise<GeneratedProgramTree> {
  const [catalog, inventory, excludedExerciseIds] = await Promise.all([
    deps.loadCatalog(db),
    deps.loadInventory(userId, db),
    deps.loadExclusions(db, userId),
  ]);

  const input: GenerationInput = {
    routineName: defaultGeneratedRoutineName(TRACER_DEFAULTS.trainingGoal, TRACER_DEFAULTS.splitPreference),
    ...TRACER_DEFAULTS,
    catalog,
    inventory,
    excludedExerciseIds,
  };

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

export default function GenerateProgramScreen() {
  const router = useRouter();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const [tree, setTree] = useState<GeneratedProgramTree | null>(null);
  const [name, setName] = useState(defaultGeneratedRoutineName(TRACER_DEFAULTS.trainingGoal, TRACER_DEFAULTS.splitPreference));
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!userId) return;
    setError(null);
    setGenerating(true);
    try {
      const generated = await runGeneration(userId, getPowerSync());
      setTree(generated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not generate a program');
    } finally {
      setGenerating(false);
    }
  }, [userId]);

  const handleSave = useCallback(async () => {
    if (!tree) return;
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
  }, [name, router, tree]);

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
      <View className="mt-xl gap-md">
        <Text className="text-heading font-semibold text-foreground">Generate Program</Text>

        {error ? <Text className="text-body font-normal text-destructive">{error}</Text> : null}

        {!tree ? (
          <PrimaryButton label="Generate" onPress={() => void handleGenerate()} submitting={generating} />
        ) : (
          <View className="gap-md">
            <Text className="text-body font-normal text-foreground-muted">{name}</Text>

            {tree.degradations.length > 0 ? (
              <View className="gap-xs">
                {tree.degradations.map((entry, index) => (
                  <Text key={index} className="text-label font-normal text-foreground-muted">
                    {entry.detail}
                  </Text>
                ))}
              </View>
            ) : null}

            {tree.cycles.map((cycle) => (
              <Text key={cycle.key} className="text-label font-normal text-foreground-muted">
                {cycle.name}
              </Text>
            ))}

            {tree.days.map((day) => (
              <View key={day.key} className="gap-xs">
                <Text className="text-body font-semibold text-foreground">{day.name}</Text>
                {day.slots.map((slot) => (
                  <Text key={slot.key} className="text-label font-normal text-foreground-muted">
                    {slot.exerciseId} — {slot.base.targetSets} x {slot.base.targetRepMin}-{slot.base.targetRepMax} @ RIR{' '}
                    {slot.base.targetRir}
                  </Text>
                ))}
              </View>
            ))}

            <PrimaryButton label="Save Program" onPress={() => void handleSave()} submitting={saving} />
          </View>
        )}
      </View>
    </ScrollView>
  );
}
