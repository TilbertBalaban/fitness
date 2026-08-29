import { and, eq, isNull } from 'drizzle-orm';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { ArchiveDialog } from '@/components/ArchiveDialog';
import { DetailSection } from '@/components/DetailSection';
import { ExerciseImageTile, resolveHeroImageWidth } from '@/components/ExerciseImageTile';
import { MuscleTargetList } from '@/components/MuscleTargetList';
import { SwapSuggestionList } from '@/components/SwapSuggestionList';
import { authClient } from '@/lib/auth-client';
import { getLocalCatalogImage } from '@/lib/catalog/catalog-image-map.generated';
// 03-08 owns this module (same wave 6, running concurrently) — it does not exist in this worktree
// yet. The import, the call shape (db, userId, sourceId) => Promise<newId>, and the Duplicate
// control below are written against 03-08-PLAN.md's own declared signature and are expected to
// resolve once both plans merge. See SUMMARY.md's Deviations section and WINDOWS #45.
// Relative (not `@/`) deliberately: Jest's virtual-mock support for this not-yet-existing module
// only works when the specifier bypasses the `@/` moduleNameMapper entry, which this project's
// react-native jest resolver tries to eagerly resolve even for a `{ virtual: true }` mock.
import { duplicateExercise } from '../../lib/catalog/custom-exercise';
import { loadExerciseDetail, type ExerciseDetail } from '@/lib/catalog/exercise-detail';
import {
  readPreference,
  resolveDetailActions,
  setArchived,
  setNeverSuggest,
  type ExercisePreference,
} from '@/lib/catalog/preferences';
import { scoreAlternatives, type ScoredCandidate, type SwapExercise, type SwapMuscleMapping, type SwapPreference } from '@/lib/catalog/smart-swap';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { exercise, exerciseMuscleMapping, seededExercise, userExercisePreference } from '@/lib/db/schema';

export type DetailScreenState =
  | { status: 'found'; detail: ExerciseDetail }
  | { status: 'not-found' }
  | { status: 'error' };

// Extracted so "an unknown exercise id renders a not-found state rather than throwing or
// rendering a blank screen" is directly testable without invoking the hook-bearing screen
// component itself — this is the exact classification the useEffect below drives its three
// render branches from, not a parallel copy of that logic.
export async function resolveDetailScreenState(
  loader: () => Promise<ExerciseDetail | null>,
): Promise<DetailScreenState> {
  try {
    const result = await loader();
    return result ? { status: 'found', detail: result } : { status: 'not-found' };
  } catch {
    return { status: 'error' };
  }
}

const DEFAULT_PREFERENCE: ExercisePreference = { archivedAt: null, neverSuggest: false };

// Whether this id belongs to the current user's own `exercise` row (owned) or was found only in
// the localOnly `seededExercise` table (owner null, every seeded row) — plus its variation_of_id,
// which loadExerciseDetail's own return shape does not carry (03-10 needs it for the smart-swap
// sibling bonus). Kept separate from loadExerciseDetail rather than extending that function's
// return shape, since exercise-detail.ts is outside this plan's declared file scope.
async function loadOwnerAndVariation(db: WriteDb, id: string): Promise<{ ownerId: string | null; variationOfId: string | null }> {
  const [seededRow] = await db
    .select({ variationOfId: seededExercise.variationOfId })
    .from(seededExercise)
    .where(eq(seededExercise.id, id));
  if (seededRow) return { ownerId: null, variationOfId: seededRow.variationOfId };

  const [customRow] = await db
    .select({ userId: exercise.userId, variationOfId: exercise.variationOfId })
    .from(exercise)
    .where(eq(exercise.id, id));
  return { ownerId: customRow?.userId ?? null, variationOfId: customRow?.variationOfId ?? null };
}

// The candidate set for smart-swap: every seeded and custom exercise plus every muscle mapping and
// every user_exercise_preference row, read as three whole-table queries — never a per-candidate
// lookup (PITFALLS.md §13's canonical N+1 shape, the exact risk a suggestion list would first hit).
// Mirrors apps/mobile/app/exercises/index.tsx's loadCatalogRows union-and-filter shape.
async function loadSwapCandidates(
  db: WriteDb,
): Promise<{ candidates: SwapExercise[]; mappings: SwapMuscleMapping[]; preferences: SwapPreference[] }> {
  const seededRows = await db
    .select({
      id: seededExercise.id,
      name: seededExercise.name,
      movementPattern: seededExercise.movementPattern,
      equipmentRequired: seededExercise.equipmentRequired,
      variationOfId: seededExercise.variationOfId,
    })
    .from(seededExercise)
    .where(isNull(seededExercise.archivedAt));

  const customRows = await db
    .select({
      id: exercise.id,
      name: exercise.name,
      movementPattern: exercise.movementPattern,
      equipmentRequired: exercise.equipmentRequired,
      variationOfId: exercise.variationOfId,
    })
    .from(exercise)
    .where(and(eq(exercise.isCustom, true), isNull(exercise.archivedAt)));

  const candidates: SwapExercise[] = [...seededRows, ...customRows];

  const mappings: SwapMuscleMapping[] = (
    await db
      .select({
        exerciseId: exerciseMuscleMapping.exerciseId,
        muscleGroupId: exerciseMuscleMapping.muscleGroupId,
        role: exerciseMuscleMapping.role,
        weightFactor: exerciseMuscleMapping.weightFactor,
      })
      .from(exerciseMuscleMapping)
  ).map((row) => ({ ...row, role: row.role as SwapMuscleMapping['role'] }));

  const preferences: SwapPreference[] = await db
    .select({
      userId: userExercisePreference.userId,
      exerciseId: userExercisePreference.exerciseId,
      archivedAt: userExercisePreference.archivedAt,
      neverSuggest: userExercisePreference.neverSuggest,
    })
    .from(userExercisePreference);

  return { candidates, mappings, preferences };
}

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;
  const { width: windowWidth } = useWindowDimensions();

  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [failed, setFailed] = useState(false);
  const [preference, setPreference] = useState<ExercisePreference>(DEFAULT_PREFERENCE);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [swapCandidates, setSwapCandidates] = useState<ScoredCandidate[]>([]);

  useEffect(() => {
    if (!id) return;
    let mounted = true;

    (async () => {
      const db = getPowerSync();
      const state = await resolveDetailScreenState(() => loadExerciseDetail(db, id));
      if (!mounted) return;

      if (state.status === 'found') {
        setDetail(state.detail);
        const [ownerAndVariation, pref, swapData] = await Promise.all([
          loadOwnerAndVariation(db, id),
          userId ? readPreference(db, userId, id) : Promise.resolve(DEFAULT_PREFERENCE),
          loadSwapCandidates(db),
        ]);
        if (!mounted) return;
        setPreference(pref);

        const target: SwapExercise = {
          id: state.detail.id,
          name: state.detail.name,
          movementPattern: state.detail.movementPattern,
          equipmentRequired: state.detail.equipmentRequired,
          variationOfId: ownerAndVariation.variationOfId,
        };
        // No equipment constraint yet — Phase 7 owns gym profiles and
        // equipment_profile.machine_availability. Passing a fabricated constraint here would be
        // inventing data this screen has no source for; the omission is this seam left open on
        // purpose, not an oversight.
        setSwapCandidates(scoreAlternatives(target, swapData.candidates, swapData.mappings, swapData.preferences, userId));
      } else if (state.status === 'not-found') {
        setNotFound(true);
      } else {
        setFailed(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id, userId]);

  const actions = resolveDetailActions(preference.archivedAt);

  // Optimistic local-first writes (UI-SPEC E7) — local state updates immediately, no
  // network-dependent spinner and no failure path to render, since the write cannot fail against
  // a server it never waits for.
  const handleConfirmArchiveToggle = async () => {
    if (!userId || !detail) return;
    const nextArchived = preference.archivedAt === null;
    setArchiveDialogOpen(false);
    setPreference((current) => ({ ...current, archivedAt: nextArchived ? new Date().toISOString() : null }));
    await setArchived(getPowerSync(), userId, detail.id, nextArchived);
  };

  const handleToggleNeverSuggest = async () => {
    if (!userId || !detail) return;
    const next = !preference.neverSuggest;
    setPreference((current) => ({ ...current, neverSuggest: next }));
    await setNeverSuggest(getPowerSync(), userId, detail.id, next);
  };

  const handleDuplicate = async () => {
    if (!userId || !detail) return;
    const newId = await duplicateExercise(getPowerSync(), userId, detail.id);
    router.replace({ pathname: '/exercises/[id]', params: { id: newId } });
  };

  if (failed) {
    return (
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 }}
      >
        <View className="mt-xl items-center">
          <Text className="text-center text-heading font-semibold text-foreground">
            Exercise catalog couldn&apos;t load
          </Text>
          <Text className="mt-sm text-center text-body font-normal text-foreground-muted">
            Restart the app to try again. Your saved exercises and history are safe.
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (notFound) {
    return (
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 }}
      >
        <View className="mt-xl items-center">
          <Text className="text-center text-heading font-semibold text-foreground">Exercise not found</Text>
          <Text className="mt-sm text-center text-body font-normal text-foreground-muted">
            This exercise may have been removed. Go back and try another.
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (!detail) {
    return null;
  }

  // The offline guarantee this screen exists to keep: never resolve an image over the network.
  // image_urls still points at live raw.githubusercontent.com URLs (WINDOWS #35, unresolved) —
  // this deliberately never reads that field. Only the vendored local bundle (WINDOWS #36) is
  // ever rendered; an exercise absent from the manifest falls back to the placeholder tile, the
  // same tile a load failure or a missing image already falls back to.
  const localImage = getLocalCatalogImage(detail.id);

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
      <Text className="mt-xl text-heading font-semibold text-foreground">{detail.name}</Text>

      <View className="mt-md flex-row flex-wrap gap-sm">
        <Pressable
          onPress={() => setArchiveDialogOpen(true)}
          accessibilityRole="button"
          style={{ minWidth: 48, minHeight: 48 }}
          className="items-center justify-center rounded-md border border-foreground-muted px-md py-sm"
        >
          <Text className="text-body font-normal text-foreground">{actions.archiveLabel}</Text>
        </Pressable>

        <Pressable
          onPress={handleToggleNeverSuggest}
          accessibilityRole="button"
          accessibilityState={{ selected: preference.neverSuggest }}
          style={{ minWidth: 48, minHeight: 48 }}
          className={`items-center justify-center rounded-md border px-md py-sm ${
            preference.neverSuggest ? 'border-accent' : 'border-foreground-muted'
          }`}
        >
          <Text className={`text-body font-normal ${preference.neverSuggest ? 'text-accent' : 'text-foreground'}`}>
            Never suggest
          </Text>
        </Pressable>

        {actions.showDuplicate ? (
          <Pressable
            onPress={handleDuplicate}
            accessibilityRole="button"
            style={{ minWidth: 48, minHeight: 48 }}
            className="items-center justify-center rounded-md border border-foreground-muted px-md py-sm"
          >
            <Text className="text-body font-normal text-foreground">Duplicate</Text>
          </Pressable>
        ) : null}

        <Link href={{ pathname: '/exercises/edit/[id]', params: { id: detail.id } }} asChild>
          <Pressable
            accessibilityRole="button"
            style={{ minWidth: 48, minHeight: 48 }}
            className="items-center justify-center rounded-md border border-foreground-muted px-md py-sm"
          >
            <Text className="text-body font-normal text-foreground">Edit</Text>
          </Pressable>
        </Link>
      </View>

      <View className="mt-md">
        <ExerciseImageTile localSource={localImage} width={resolveHeroImageWidth(windowWidth)} />
      </View>

      {detail.primaryMuscles.length > 0 ? (
        <View className="mt-lg gap-xs">
          <Text className="text-body font-semibold text-foreground">Target Muscles</Text>
          <MuscleTargetList primaryMuscles={detail.primaryMuscles} secondaryMuscles={detail.secondaryMuscles} />
        </View>
      ) : null}

      <DetailSection heading="Setup">{detail.instructionsText}</DetailSection>

      <DetailSection heading="Cues">{detail.cueText}</DetailSection>

      <SwapSuggestionList candidates={swapCandidates} />

      {archiveDialogOpen ? (
        <ArchiveDialog
          unarchiving={preference.archivedAt !== null}
          onConfirm={handleConfirmArchiveToggle}
          onCancel={() => setArchiveDialogOpen(false)}
        />
      ) : null}
    </ScrollView>
  );
}
