import { FlashList } from '@shopify/flash-list';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { getPowerSync } from '@/lib/db/powersync';
import { createRoutine, loadRoutines, type RoutineSummary } from '@/lib/db/programs/create-routine';
import { addDay, removeDay, removeExercise, renameDay } from '@/lib/db/programs/days';
import { loadExerciseNameMap, loadProgramTree, type ProgramTree } from '@/lib/db/programs/load-program';

const SKELETON_ROW_COUNT = 3;

export type ProgramsScreenState = 'error' | 'loading' | 'empty' | 'populated';

export interface ProgramsScreenStateInput {
  failed: boolean;
  routines: RoutineSummary[] | null;
}

// Which of the four screen states to render — a load failure always wins, then "still loading"
// (routines not read yet), then whether any non-archived routine exists.
export function deriveProgramsScreenState({ failed, routines }: ProgramsScreenStateInput): ProgramsScreenState {
  if (failed) return 'error';
  if (routines === null) return 'loading';
  if (routines.length === 0) return 'empty';
  return 'populated';
}

export interface SlotTargets {
  targetSets: number | null;
  targetRepMin: number | null;
  targetRepMax: number | null;
  targetRir: number | null;
  targetRestSeconds: number | null;
}

function formatRepComponent(repMin: number | null, repMax: number | null): string | null {
  if (repMin === null && repMax === null) return null;
  if (repMin !== null && repMax !== null) {
    return repMin === repMax ? `${repMin}` : `${repMin}-${repMax}`;
  }
  return `${repMin ?? repMax}`;
}

function formatRestComponent(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')} rest`;
}

// Pure — the "what does a blank target mean" contract made visible: an unset target renders as an
// em dash, never a silently-omitted line and never a zero. Equal rep min/max collapses to one
// number ("3 x 8", not "3 x 8-8") — this is the interim list-row summary this task ships; the full
// Exercise Slot Row (04-03/04-UI-SPEC.md) keeps the range visible even when min equals max, a
// different, later component with a different contract.
export function formatSlotTargets(slot: SlotTargets): string {
  const { targetSets, targetRepMin, targetRepMax, targetRir, targetRestSeconds } = slot;

  if (targetSets === null && targetRepMin === null && targetRepMax === null && targetRir === null && targetRestSeconds === null) {
    return '—';
  }

  const repComponent = formatRepComponent(targetRepMin, targetRepMax);
  const parts: string[] = [];

  if (targetSets !== null && repComponent !== null) {
    parts.push(`${targetSets} x ${repComponent}`);
  } else if (targetSets !== null) {
    parts.push(`${targetSets} sets`);
  } else if (repComponent !== null) {
    parts.push(`${repComponent} reps`);
  }

  if (targetRir !== null) {
    parts.push(`RIR ${targetRir}`);
  }

  if (targetRestSeconds !== null) {
    parts.push(formatRestComponent(targetRestSeconds));
  }

  return parts.join(' · ');
}

export default function ProgramsScreen() {
  const [routines, setRoutines] = useState<RoutineSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [activeRoutineId, setActiveRoutineId] = useState<string | null>(null);
  const [tree, setTree] = useState<ProgramTree | null>(null);
  const [treeFailed, setTreeFailed] = useState(false);
  const [exerciseNames, setExerciseNames] = useState<Map<string, string> | null>(null);
  const [newDayName, setNewDayName] = useState('');
  const [renamingDayId, setRenamingDayId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Re-runs the same loader after a successful create — never mutates the loaded array in place,
  // so the list always reflects what local SQLite actually holds.
  const reload = useCallback(async () => {
    try {
      const loaded = await loadRoutines(getPowerSync());
      setRoutines(loaded);
      setFailed(false);
    } catch (error) {
      console.error('routine load failed', error);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const loaded = await loadRoutines(getPowerSync());
        if (mounted) {
          setRoutines(loaded);
          setFailed(false);
        }
      } catch (error) {
        console.error('routine load failed', error);
        if (mounted) setFailed(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Loaded once, here, and passed into every loadProgramTree call rather than re-read per call —
  // the exercise catalog rarely changes mid-session and this screen re-renders the tree on every
  // day/exercise mutation.
  const reloadTree = useCallback(
    async (routineId: string) => {
      try {
        const db = getPowerSync();
        const names = exerciseNames ?? (await loadExerciseNameMap(db));
        if (!exerciseNames) setExerciseNames(names);
        const loaded = await loadProgramTree(routineId, db, names);
        setTree(loaded);
        setTreeFailed(false);
      } catch (error) {
        console.error('program tree load failed', error);
        setTreeFailed(true);
      }
    },
    [exerciseNames],
  );

  useEffect(() => {
    if (activeRoutineId) {
      void reloadTree(activeRoutineId);
    } else {
      setTree(null);
    }
    // reloadTree intentionally excluded: it only changes identity when exerciseNames first loads,
    // which must not re-trigger a redundant tree reload for the same activeRoutineId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoutineId]);

  useEffect(() => {
    if (!activeRoutineId && routines && routines.length === 1) {
      setActiveRoutineId(routines[0].id);
    }
  }, [routines, activeRoutineId]);

  const screenState = deriveProgramsScreenState({ failed, routines });

  const handleCreate = useCallback(async () => {
    setNameError(null);
    setSubmitting(true);
    try {
      await createRoutine({ name });
      setName('');
      await reload();
    } catch (error) {
      setNameError(error instanceof Error ? error.message : 'Program name is required');
    } finally {
      setSubmitting(false);
    }
  }, [name, reload]);

  const handleAddDay = useCallback(async () => {
    if (!activeRoutineId) return;
    try {
      await addDay({ routineId: activeRoutineId, name: newDayName });
      setNewDayName('');
      await reloadTree(activeRoutineId);
    } catch (error) {
      console.error('add day failed', error);
    }
  }, [activeRoutineId, newDayName, reloadTree]);

  const handleRemoveDay = useCallback(
    async (dayId: string) => {
      if (!activeRoutineId) return;
      await removeDay(dayId);
      await reloadTree(activeRoutineId);
    },
    [activeRoutineId, reloadTree],
  );

  const handleRemoveExercise = useCallback(
    async (routineExerciseId: string) => {
      if (!activeRoutineId) return;
      await removeExercise(routineExerciseId);
      await reloadTree(activeRoutineId);
    },
    [activeRoutineId, reloadTree],
  );

  const handleStartRename = useCallback((dayId: string, currentName: string) => {
    setRenamingDayId(dayId);
    setRenameValue(currentName);
  }, []);

  const handleSaveRename = useCallback(async () => {
    if (!activeRoutineId || !renamingDayId) return;
    try {
      await renameDay(renamingDayId, renameValue);
      setRenamingDayId(null);
      await reloadTree(activeRoutineId);
    } catch (error) {
      console.error('rename day failed', error);
    }
  }, [activeRoutineId, renamingDayId, renameValue, reloadTree]);

  if (screenState === 'error') {
    return (
      <View className="flex-1 items-center justify-center bg-background px-lg">
        <Text className="text-center text-heading font-semibold text-foreground">
          {"Programs couldn't load"}
        </Text>
        <Text className="mt-sm text-center text-body font-normal text-foreground-muted">
          Restart the app to try again. Your programs and history are safe.
        </Text>
      </View>
    );
  }

  if (activeRoutineId) {
    return (
      <View className="flex-1 bg-background">
        <View className="mt-xl gap-md px-lg pb-2xl">
          <Pressable
            onPress={() => setActiveRoutineId(null)}
            accessibilityRole="button"
            accessibilityLabel="All Programs"
            style={{ minHeight: 48, justifyContent: 'center' }}
          >
            <Text className="text-body font-normal text-accent">{'< All Programs'}</Text>
          </Pressable>

          {treeFailed ? (
            <View className="items-center gap-sm">
              <Text className="text-center text-heading font-semibold text-foreground">
                {"Program couldn't load"}
              </Text>
              <Text className="text-center text-body font-normal text-foreground-muted">
                Restart the app to try again. Your programs and history are safe.
              </Text>
            </View>
          ) : tree ? (
            <>
              <Text className="text-heading font-semibold text-foreground">{tree.name}</Text>

              {tree.days.map((day) => (
                <View key={day.id} className="gap-sm rounded-md bg-surface p-md">
                  {renamingDayId === day.id ? (
                    <View className="gap-sm">
                      <TextField label="Day name" value={renameValue} onChangeText={setRenameValue} />
                      <PrimaryButton label="Save" onPress={handleSaveRename} />
                    </View>
                  ) : (
                    <View className="flex-row items-center justify-between gap-sm">
                      <Pressable
                        onPress={() => handleStartRename(day.id, day.name)}
                        accessibilityRole="button"
                        accessibilityLabel={`Rename ${day.name}`}
                        style={{ minHeight: 48, justifyContent: 'center', flexShrink: 1 }}
                      >
                        <Text className="text-body font-semibold text-foreground">{day.name}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleRemoveDay(day.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${day.name}`}
                        style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text className="text-label font-normal text-destructive">Remove</Text>
                      </Pressable>
                    </View>
                  )}

                  {day.slots.map((slot) => (
                    <View key={slot.id} className="flex-row items-center justify-between gap-sm">
                      <View className="flex-shrink gap-xs">
                        <Text className="text-body font-normal text-foreground">{slot.exerciseName}</Text>
                        <Text className="text-label font-normal text-foreground-muted">{formatSlotTargets(slot)}</Text>
                      </View>
                      <Pressable
                        onPress={() => handleRemoveExercise(slot.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${slot.exerciseName}`}
                        style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text className="text-label font-normal text-destructive">Remove</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ))}

              <View className="gap-sm">
                <TextField label="New day name" value={newDayName} onChangeText={setNewDayName} />
                <PrimaryButton label="Add Day" onPress={handleAddDay} />
              </View>
            </>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <FlashList
        data={routines ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setActiveRoutineId(item.id)}
            accessibilityRole="button"
            accessibilityLabel={item.name}
            className="mb-sm gap-xs rounded-md bg-surface p-md"
            style={{ minHeight: 48 }}
          >
            <Text className="text-body font-semibold text-foreground">{item.name}</Text>
            <Text className="text-label font-normal text-foreground-muted">{item.status}</Text>
          </Pressable>
        )}
        ListHeaderComponent={
          <View className="mt-xl gap-md">
            <TextField
              label="Program name"
              value={name}
              onChangeText={(value) => {
                setName(value);
                setNameError(null);
              }}
              error={nameError}
            />
            <PrimaryButton label="Create Program" onPress={handleCreate} submitting={submitting} />
          </View>
        }
        ListEmptyComponent={
          screenState === 'empty' ? (
            <View className="mt-xl items-center gap-sm">
              <Text className="text-center text-heading font-semibold text-foreground">No programs yet</Text>
              <Text className="text-center text-body font-normal text-foreground-muted">
                Create your first program to get started.
              </Text>
            </View>
          ) : screenState === 'loading' ? (
            <View className="mt-xl gap-sm">
              {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
                <View key={index} className="rounded-md bg-surface" style={{ height: 64 }} />
              ))}
            </View>
          ) : null
        }
      />
    </View>
  );
}
