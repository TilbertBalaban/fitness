import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SelectField } from '@/components/SelectField';
import { TextField } from '@/components/TextField';
import { createRoutine } from '@/lib/db/programs/create-routine';
import { duplicateRoutine } from '@/lib/db/programs/duplicate-routine';
import { loadLibraryRoutines, type LibraryRoutineRow } from '@/lib/db/programs/lifecycle';

export type NewProgramChoice = 'blank' | 'duplicate' | 'generate';

export const NO_DUPLICATE_SOURCE_COPY = "You don't have another program to duplicate yet.";

export interface NewProgramOption {
  key: NewProgramChoice;
  label: string;
  available: boolean;
  unavailableReason: string | null;
}

export interface NewProgramOptionSet {
  options: NewProgramOption[];
  sources: LibraryRoutineRow[];
}

// Both choices are always returned. On an empty account the duplicate option is returned marked
// unavailable rather than omitted, so the feature is discoverable before it is usable — an option
// that silently appears once you happen to own a program is one the user never learns exists.
export function newProgramOptions(routines: LibraryRoutineRow[]): NewProgramOptionSet {
  const sources = routines.filter((routine) => routine.archivedAt === null);
  const canDuplicate = sources.length > 0;

  return {
    options: [
      { key: 'blank', label: 'Start Blank', available: true, unavailableReason: null },
      { key: 'generate', label: 'Generate for me', available: true, unavailableReason: null },
      {
        key: 'duplicate',
        label: 'Duplicate Existing',
        available: canDuplicate,
        unavailableReason: canDuplicate ? null : NO_DUPLICATE_SOURCE_COPY,
      },
    ],
    sources,
  };
}

export default function NewProgramScreen() {
  const router = useRouter();

  const [routines, setRoutines] = useState<LibraryRoutineRow[]>([]);
  const [name, setName] = useState('');
  const [choice, setChoice] = useState<NewProgramChoice>('blank');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const loaded = await loadLibraryRoutines();
        if (mounted) setRoutines(loaded);
      } catch (error) {
        console.error('program list load failed', error);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const { options, sources } = newProgramOptions(routines);
  const duplicateOption = options.find((option) => option.key === 'duplicate')!;

  const handleCreate = useCallback(async () => {
    setNameError(null);
    setSourceError(null);

    if (choice === 'generate') {
      router.push('/programs/generate');
      return;
    }

    if (choice === 'duplicate' && !sourceId) {
      setSourceError('Choose a program to duplicate.');
      return;
    }

    setSubmitting(true);
    try {
      const id =
        choice === 'duplicate' && sourceId
          ? (await duplicateRoutine({ sourceRoutineId: sourceId, name })).id
          : await createRoutine({ name });

      router.replace({ pathname: '/(tabs)/programs', params: { routineId: id } });
    } catch (error) {
      setNameError(error instanceof Error ? error.message : 'Program name is required');
    } finally {
      setSubmitting(false);
    }
  }, [choice, name, router, sourceId]);

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
      <View className="mt-xl gap-md">
        <Text className="text-heading font-semibold text-foreground">New Program</Text>

        <TextField
          label="Program name"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setNameError(null);
          }}
          error={nameError}
        />

        <SelectField
          label="How do you want to start?"
          value={choice}
          options={options
            .filter((option) => option.available)
            .map((option) => ({ value: option.key, label: option.label }))}
          placeholder="Choose how to start"
          onChange={(value) => {
            setChoice(value as NewProgramChoice);
            setSourceError(null);
          }}
        />

        {/* Rendered as visibly unavailable rather than absent — see newProgramOptions. */}
        {duplicateOption.available ? null : (
          <View className="gap-xs" style={{ opacity: 0.6 }}>
            <Text className="text-body font-normal text-foreground">{duplicateOption.label}</Text>
            <Text className="text-label font-normal text-foreground-muted">
              {duplicateOption.unavailableReason}
            </Text>
          </View>
        )}

        {choice === 'duplicate' && duplicateOption.available ? (
          <SelectField
            label="Program to duplicate"
            value={sourceId}
            options={sources.map((routine) => ({ value: routine.id, label: routine.name }))}
            placeholder="Choose a program"
            onChange={(value) => {
              setSourceId(value);
              setSourceError(null);
            }}
            error={sourceError}
          />
        ) : null}

        <PrimaryButton label="Create Program" onPress={() => void handleCreate()} submitting={submitting} />
      </View>
    </ScrollView>
  );
}
