import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { and, eq, isNull } from 'drizzle-orm';
import type { EquipmentType, UnavailableEquipmentRef } from '@fitness/api-contracts';
import type { ResolvedInventory } from '@fitness/plate-math';
import {
  scoreAlternatives,
  type ScoredCandidate,
  type SwapExercise,
  type SwapMuscleMapping,
  type SwapPreference,
} from '@/lib/catalog/smart-swap';
import { loadEquipmentProfile } from '@/lib/db/equipment-profiles';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { exercise, exerciseMuscleMapping, seededExercise, userExercisePreference } from '@/lib/db/schema';
import {
  equipmentSwapConstraints,
  loadSessionInventory,
  markEquipmentUnavailable,
  removeEquipmentFromProfile,
} from '@/lib/db/session-equipment';
import { swapSessionExercise } from '@/lib/db/session-mutations';
import { ErrorBanner } from './ErrorBanner';
import { PrimaryButton } from './PrimaryButton';
import { SwapSuggestionList } from './SwapSuggestionList';

// The fixed short names the sheet's heading interpolates for the two equipment types that have no
// individually-named entry to resolve — a named machine (below) always supplies its own name.
const EQUIPMENT_DISPLAY_NAMES: Partial<Record<EquipmentType, string>> = {
  barbell: 'Barbell',
  ez_bar: 'EZ Bar',
  dumbbell: 'Dumbbells',
};

interface EquipmentAvailabilityTarget {
  ref: UnavailableEquipmentRef;
  displayName: string;
}

// Resolves which piece of equipment this sheet is about, per the UI-SPEC's own rule: a named
// machine for machine/cable, "Barbell"/"EZ Bar" for barbell/ez_bar, "Dumbbells" for dumbbell. The
// machine case mirrors band.ts's own name-then-id selection (GYM-03 ordering) so the sheet can
// never name a different machine than the band currently shows for this exercise.
export function resolveEquipmentAvailabilityTarget(
  equipmentType: EquipmentType,
  inventory: ResolvedInventory,
): EquipmentAvailabilityTarget {
  if (equipmentType === 'machine' || equipmentType === 'cable') {
    const machine = inventory.machines
      .filter((candidate) => candidate.equipmentType === equipmentType)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))[0];
    if (machine) return { ref: { kind: 'machine', machineId: machine.id }, displayName: machine.name };
    return {
      ref: { kind: 'equipment_type', equipmentType },
      displayName: equipmentType === 'machine' ? 'Machine' : 'Cable',
    };
  }

  return {
    ref: { kind: 'equipment_type', equipmentType },
    displayName: EQUIPMENT_DISPLAY_NAMES[equipmentType] ?? 'This equipment',
  };
}

async function loadSwapTarget(exerciseId: string, db: WriteDb): Promise<SwapExercise | null> {
  const [seededRow] = await db
    .select({
      id: seededExercise.id,
      name: seededExercise.name,
      movementPattern: seededExercise.movementPattern,
      equipmentRequired: seededExercise.equipmentRequired,
      variationOfId: seededExercise.variationOfId,
    })
    .from(seededExercise)
    .where(eq(seededExercise.id, exerciseId));
  if (seededRow) return seededRow;

  const [customRow] = await db
    .select({
      id: exercise.id,
      name: exercise.name,
      movementPattern: exercise.movementPattern,
      equipmentRequired: exercise.equipmentRequired,
      variationOfId: exercise.variationOfId,
    })
    .from(exercise)
    .where(eq(exercise.id, exerciseId));
  return customRow ?? null;
}

// Mirrors apps/mobile/app/exercises/[id].tsx's own loadSwapCandidates verbatim: three whole-table
// reads, never a per-candidate lookup (PITFALLS.md §13) — this is the exact candidate pool every
// swap surface in this app scores against, only the constraints passed to scoreAlternatives differ.
async function loadSwapCandidatesData(
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

export type EquipmentAvailabilitySheetScreen = 'confirm' | 'write-confirm' | 'alternatives';

export interface EquipmentAvailabilitySheetViewProps {
  screen: EquipmentAvailabilitySheetScreen;
  displayName: string;
  gymName: string;
  busy: boolean;
  error: string | null;
  candidates: ScoredCandidate[];
  onMarkUnavailable: () => void;
  onOpenWriteConfirm: () => void;
  onCancelWriteConfirm: () => void;
  onConfirmWriteThrough: () => void;
  onPickCandidate: (candidate: ScoredCandidate) => void;
  onCancel: () => void;
}

// Hook-free — mirrors WarmupSheetView/TargetsSheetView's split (this codebase has no
// @testing-library/react-native, so only the hook-free view is directly test-invocable; the
// stateful wrapper below is exercised through this view's callback props). Same overlay/
// ScrollView/max-w-[400px]/rounded-md bg-surface p-lg shape as every sibling sheet — never a
// second modal shell.
export function EquipmentAvailabilitySheetView({
  screen,
  displayName,
  gymName,
  busy,
  error,
  candidates,
  onMarkUnavailable,
  onOpenWriteConfirm,
  onCancelWriteConfirm,
  onConfirmWriteThrough,
  onPickCandidate,
  onCancel,
}: EquipmentAvailabilitySheetViewProps) {
  if (screen === 'alternatives') {
    return (
      <View className="flex-1 items-center justify-center bg-background/80 px-lg">
        <ScrollView
          className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg"
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <Text className="text-heading font-semibold text-foreground">{`${displayName} Unavailable?`}</Text>
          <Text className="mt-sm text-body font-semibold text-foreground">This exercise is unavailable right now</Text>
          <SwapSuggestionList candidates={candidates} onSelect={onPickCandidate} />
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={{ minHeight: 48 }}
            className="mt-lg items-center justify-center py-sm"
          >
            <Text className="text-body text-foreground-muted">Cancel</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  if (screen === 'write-confirm') {
    return (
      <View className="flex-1 items-center justify-center bg-background/80 px-lg">
        <ScrollView
          className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg"
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <Text className="text-heading font-semibold text-foreground">{`Remove from ${gymName}?`}</Text>
          <Text className="mt-sm text-body text-foreground-muted">
            {`This updates your gym profile — ${displayName} won't be suggested at this gym again. You can add it back anytime.`}
          </Text>
          <View className="mt-lg flex-row justify-end gap-sm">
            <Pressable
              onPress={onCancelWriteConfirm}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={{ minWidth: 48, minHeight: 48 }}
              className="items-center justify-center rounded-md px-md py-sm"
            >
              <Text className="text-body text-foreground-muted">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onConfirmWriteThrough}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Remove"
              style={{ minWidth: 48, minHeight: 48, opacity: busy ? 0.6 : 1 }}
              className="items-center justify-center rounded-md px-md py-sm"
            >
              <Text className="text-body font-semibold text-foreground">Remove</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center bg-background/80 px-lg">
      <ScrollView
        className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg"
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <Text className="text-heading font-semibold text-foreground">{`${displayName} Unavailable?`}</Text>
        <Text className="mt-sm text-body text-foreground-muted">
          Mark it unavailable just for this workout, or update your gym profile if it&apos;s gone for good.
        </Text>

        {error ? (
          <View className="mt-md">
            <ErrorBanner message={error} />
          </View>
        ) : null}

        <View className="mt-lg gap-sm">
          <PrimaryButton label="Mark Unavailable" onPress={onMarkUnavailable} submitting={busy} />
          <Pressable
            onPress={onOpenWriteConfirm}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="My gym doesn't have this"
            style={{ minHeight: 48 }}
            className="items-center justify-center py-sm"
          >
            <Text className="text-body font-normal text-accent">My gym doesn&apos;t have this</Text>
          </Pressable>
          <Pressable
            onPress={onCancel}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={{ minHeight: 48 }}
            className="items-center justify-center py-sm"
          >
            <Text className="text-body text-foreground-muted">Cancel</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

export interface EquipmentAvailabilitySheetProps {
  sessionId: string;
  sessionExerciseId: string;
  exerciseId: string;
  userId: string | null;
  equipmentProfileId: string;
  equipmentType: EquipmentType;
  inventory: ResolvedInventory;
  db?: WriteDb;
  onDone: () => void;
  onCancel: () => void;
}

// The stateful wrapper. D-20's two-tier availability: "Mark Unavailable" is session-scoped and
// immediate; "My gym doesn't have this" opens a neutral confirm before writing through to the
// profile. After either action the sheet transitions in place to alternatives, re-resolving the
// session's inventory first so the just-marked equipment is already subtracted from the candidate
// filter (D-21/D-22) — the stale `inventory` prop from before the mark is never used for scoring.
// No second candidate-scoring mechanism, no program write-back (D-23).
export function EquipmentAvailabilitySheet({
  sessionId,
  sessionExerciseId,
  exerciseId,
  userId,
  equipmentProfileId,
  equipmentType,
  inventory,
  db,
  onDone,
  onCancel,
}: EquipmentAvailabilitySheetProps) {
  const writeDb = db ?? getPowerSync();
  const target = useMemo(
    () => resolveEquipmentAvailabilityTarget(equipmentType, inventory),
    [equipmentType, inventory],
  );

  const [screen, setScreen] = useState<EquipmentAvailabilitySheetScreen>('confirm');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gymName, setGymName] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ScoredCandidate[]>([]);

  useEffect(() => {
    let mounted = true;
    void loadEquipmentProfile(equipmentProfileId, writeDb).then((profile) => {
      if (mounted && profile) setGymName(profile.name);
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipmentProfileId]);

  async function loadAlternatives(latestInventory: ResolvedInventory | null): Promise<void> {
    const [targetRow, swapData] = await Promise.all([
      loadSwapTarget(exerciseId, writeDb),
      loadSwapCandidatesData(writeDb),
    ]);
    if (!targetRow) {
      setCandidates([]);
      return;
    }
    const constraints = latestInventory ? equipmentSwapConstraints(latestInventory) : {};
    setCandidates(
      scoreAlternatives(targetRow, swapData.candidates, swapData.mappings, swapData.preferences, userId, constraints),
    );
  }

  async function handleMarkUnavailable(): Promise<void> {
    setBusy(true);
    try {
      await markEquipmentUnavailable(sessionId, target.ref, writeDb);
      const fresh = await loadSessionInventory(sessionId, writeDb);
      await loadAlternatives(fresh);
      setScreen('alternatives');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmWriteThrough(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await removeEquipmentFromProfile(equipmentProfileId, target.ref, writeDb);
      const fresh = await loadSessionInventory(sessionId, writeDb);
      await loadAlternatives(fresh);
      setScreen('alternatives');
    } catch {
      setError("Couldn't save");
      setScreen('confirm');
    } finally {
      setBusy(false);
    }
  }

  async function handlePickCandidate(candidate: ScoredCandidate): Promise<void> {
    await swapSessionExercise({ sessionExerciseId, newExerciseId: candidate.id }, writeDb);
    onDone();
  }

  return (
    <EquipmentAvailabilitySheetView
      screen={screen}
      displayName={target.displayName}
      gymName={gymName ?? 'your gym'}
      busy={busy}
      error={error}
      candidates={candidates}
      onMarkUnavailable={() => void handleMarkUnavailable()}
      onOpenWriteConfirm={() => setScreen('write-confirm')}
      onCancelWriteConfirm={() => setScreen('confirm')}
      onConfirmWriteThrough={() => void handleConfirmWriteThrough()}
      onPickCandidate={(candidate) => void handlePickCandidate(candidate)}
      onCancel={onCancel}
    />
  );
}
