import { FlashList } from '@shopify/flash-list';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { getPowerSync } from '@/lib/db/powersync';
import { createRoutine, loadRoutines, type RoutineSummary } from '@/lib/db/programs/create-routine';

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

export default function ProgramsScreen() {
  const [routines, setRoutines] = useState<RoutineSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <View className="flex-1 bg-background">
      <FlashList
        data={routines ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}
        renderItem={({ item }) => (
          <View
            accessibilityRole="button"
            accessibilityLabel={item.name}
            className="mb-sm gap-xs rounded-md bg-surface p-md"
            style={{ minHeight: 48 }}
          >
            <Text className="text-body font-semibold text-foreground">{item.name}</Text>
            <Text className="text-label font-normal text-foreground-muted">{item.status}</Text>
          </View>
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
