import { EQUIPMENT_TYPES, LOAD_TYPES, MOVEMENT_PATTERNS, MUSCLE_GROUPS } from '@fitness/api-contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SelectField } from '@/components/SelectField';
import { TextField } from '@/components/TextField';
import { authClient } from '@/lib/auth-client';
import { formatFacetLabel } from '@/lib/catalog/catalog-filter';
import {
  draftFromExerciseDetail,
  duplicateExercise,
  getExerciseOwnerUserId,
  isSaveEnabled,
  resolveEditAccess,
  submitEditExercise,
  type CustomExerciseDraft,
  type CustomExerciseErrors,
  type EditAccess,
  type MuscleMappingDraft,
} from '@/lib/catalog/custom-exercise';
import { ensureCatalogLoaded } from '@/lib/catalog/ensure-catalog';
import { loadExerciseDetail } from '@/lib/catalog/exercise-detail';
import { getPowerSync } from '@/lib/db/powersync';

const LOAD_TYPE_OPTIONS = LOAD_TYPES.map((value) => ({ value, label: formatFacetLabel(value) }));
const EQUIPMENT_OPTIONS = EQUIPMENT_TYPES.map((value) => ({ value, label: formatFacetLabel(value) }));
const MOVEMENT_PATTERN_OPTIONS = MOVEMENT_PATTERNS.map((value) => ({ value, label: formatFacetLabel(value) }));

interface MuscleMappingPickerProps {
  mappings: MuscleMappingDraft[];
  onChange: (next: MuscleMappingDraft[]) => void;
}

// Matches new.tsx's MuscleMappingPicker exactly — duplicated rather than imported cross-route
// (app/exercises/new.tsx and app/exercises/edit/[id].tsx are both Expo Router route files; each
// stays a self-contained module rather than one route importing UI pieces from another).
function MuscleMappingPicker({ mappings, onChange }: MuscleMappingPickerProps) {
  const roleByGroup = new Map(mappings.map((mapping) => [mapping.muscleGroupId, mapping.role]));

  function cycle(muscleGroupId: string) {
    const current = roleByGroup.get(muscleGroupId);
    if (current === undefined) {
      onChange([...mappings, { muscleGroupId, role: 'primary' }]);
    } else if (current === 'primary') {
      onChange(mappings.map((mapping) => (mapping.muscleGroupId === muscleGroupId ? { ...mapping, role: 'secondary' } : mapping)));
    } else {
      onChange(mappings.filter((mapping) => mapping.muscleGroupId !== muscleGroupId));
    }
  }

  return (
    <View className="gap-xs">
      <Text className="text-label font-normal text-foreground-muted">Target Muscles</Text>
      <View className="flex-row flex-wrap gap-sm">
        {MUSCLE_GROUPS.map((muscleGroupId) => {
          const role = roleByGroup.get(muscleGroupId);
          const label = formatFacetLabel(muscleGroupId);
          return (
            <Pressable
              key={muscleGroupId}
              onPress={() => cycle(muscleGroupId)}
              accessibilityRole="button"
              accessibilityState={{ selected: role !== undefined }}
              accessibilityLabel={role ? `${label}, ${role}` : label}
              className={`rounded-md border bg-surface px-md py-sm ${role ? 'border-accent' : 'border-foreground-muted'}`}
              style={{ minWidth: 48, minHeight: 48 }}
            >
              <Text className={`text-label font-normal ${role ? 'text-accent' : 'text-foreground'}`}>
                {label}
                {role ? ` · ${role === 'primary' ? 'Primary' : 'Secondary'}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

interface MultilineFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}

// Matches new.tsx's MultilineField exactly — TextField.tsx has no multiline mode and is out of
// this plan's declared file scope to extend.
function MultilineField({ label, value, onChangeText }: MultilineFieldProps) {
  return (
    <View className="gap-xs">
      <Text className="text-label font-normal text-foreground-muted">{label}</Text>
      <View className="rounded-md border border-foreground-muted bg-surface" style={{ maxHeight: 160 }}>
        <TextInput
          multiline
          value={value}
          onChangeText={onChangeText}
          accessibilityLabel={label}
          className="px-md py-sm text-body font-normal text-foreground"
          style={{ minHeight: 48, maxHeight: 160 }}
        />
      </View>
    </View>
  );
}

type LoadState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error' }
  | { status: 'ready'; access: EditAccess; draft: CustomExerciseDraft };

export default function EditExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [errors, setErrors] = useState<CustomExerciseErrors>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    let mounted = true;

    (async () => {
      const db = getPowerSync();
      try {
        const ensureResult = await ensureCatalogLoaded(db);
        if (ensureResult.status === 'invalid') {
          if (mounted) setState({ status: 'error' });
          return;
        }

        const [detail, ownerUserId] = await Promise.all([loadExerciseDetail(db, id), getExerciseOwnerUserId(db, id)]);
        if (!mounted) return;

        if (!detail) {
          setState({ status: 'not-found' });
          return;
        }

        setState({
          status: 'ready',
          access: resolveEditAccess(ownerUserId, userId),
          draft: draftFromExerciseDetail(detail),
        });
      } catch {
        if (mounted) setState({ status: 'error' });
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id, userId]);

  async function onDuplicate() {
    if (!id || !userId) return;
    setSubmitting(true);
    const newId = await duplicateExercise(getPowerSync(), userId, id);
    setSubmitting(false);
    router.replace({ pathname: '/exercises/[id]', params: { id: newId } });
  }

  async function onSubmit(draft: CustomExerciseDraft) {
    if (!id || !userId) return;

    setSubmitting(true);
    const result = await submitEditExercise(getPowerSync(), userId, id, draft);
    setSubmitting(false);

    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    setErrors({});
    router.replace({ pathname: '/exercises/[id]', params: { id: result.id } });
  }

  if (state.status === 'loading') {
    return null;
  }

  if (state.status === 'not-found') {
    return (
      <ScrollView className="flex-1 bg-background" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 }}>
        <View className="mt-xl items-center">
          <Text className="text-center text-heading font-semibold text-foreground">Exercise not found</Text>
          <Text className="mt-sm text-center text-body font-normal text-foreground-muted">
            This exercise may have been removed. Go back and try another.
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (state.status === 'error') {
    return (
      <ScrollView className="flex-1 bg-background" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 }}>
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

  if (state.access === 'not-permitted') {
    return (
      <ScrollView className="flex-1 bg-background" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 }}>
        <View className="mt-xl gap-md items-center">
          <Text className="text-center text-heading font-semibold text-foreground">Can&apos;t edit this exercise</Text>
          <Text className="text-center text-body font-normal text-foreground-muted">
            Seeded exercises can&apos;t be edited directly. Duplicate it to make your own editable copy.
          </Text>
          <PrimaryButton label="Duplicate Exercise" onPress={onDuplicate} submitting={submitting} />
        </View>
      </ScrollView>
    );
  }

  return <EditForm initialDraft={state.draft} errors={errors} setErrors={setErrors} submitting={submitting} onSubmit={onSubmit} />;
}

interface EditFormProps {
  initialDraft: CustomExerciseDraft;
  errors: CustomExerciseErrors;
  setErrors: (errors: CustomExerciseErrors) => void;
  submitting: boolean;
  onSubmit: (draft: CustomExerciseDraft) => void;
}

function EditForm({ initialDraft, errors, setErrors, submitting, onSubmit }: EditFormProps) {
  const [name, setName] = useState(initialDraft.name);
  const [loadType, setLoadType] = useState<CustomExerciseDraft['loadType']>(initialDraft.loadType);
  const [equipmentRequired, setEquipmentRequired] = useState<CustomExerciseDraft['equipmentRequired']>(
    initialDraft.equipmentRequired ?? null,
  );
  const [movementPattern, setMovementPattern] = useState<CustomExerciseDraft['movementPattern']>(
    initialDraft.movementPattern ?? null,
  );
  const [cueText, setCueText] = useState(initialDraft.cueText ?? '');
  const [instructionsText, setInstructionsText] = useState(initialDraft.instructionsText ?? '');
  const [muscleMappings, setMuscleMappings] = useState<MuscleMappingDraft[]>(initialDraft.muscleMappings ?? []);

  const draft: CustomExerciseDraft = {
    name,
    loadType,
    equipmentRequired,
    movementPattern,
    cueText: cueText || null,
    instructionsText: instructionsText || null,
    muscleMappings,
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
      <View className="mt-xl gap-md">
        <Text className="text-heading font-semibold text-foreground">Edit Exercise</Text>

        <TextField
          label="Name"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setErrors({ ...errors, name: undefined });
          }}
          error={errors.name}
        />

        <SelectField
          label="Tracking Type"
          value={loadType}
          options={LOAD_TYPE_OPTIONS}
          placeholder="Select tracking type"
          onChange={(value) => {
            setLoadType(value as CustomExerciseDraft['loadType']);
            setErrors({ ...errors, load_type: undefined });
          }}
          error={errors.load_type}
        />

        <SelectField
          label="Equipment"
          value={equipmentRequired ?? null}
          options={EQUIPMENT_OPTIONS}
          placeholder="No equipment selected"
          onChange={(value) => setEquipmentRequired(value as CustomExerciseDraft['equipmentRequired'])}
          error={errors.equipment_required}
        />

        <SelectField
          label="Movement Pattern"
          value={movementPattern ?? null}
          options={MOVEMENT_PATTERN_OPTIONS}
          placeholder="No movement pattern selected"
          onChange={(value) => setMovementPattern(value as CustomExerciseDraft['movementPattern'])}
          error={errors.movement_pattern}
        />

        <MuscleMappingPicker mappings={muscleMappings} onChange={setMuscleMappings} />

        <MultilineField label="Cues" value={cueText} onChangeText={setCueText} />
        <MultilineField label="Setup Instructions" value={instructionsText} onChangeText={setInstructionsText} />

        <PrimaryButton
          label="Save Exercise"
          onPress={() => onSubmit(draft)}
          submitting={submitting || !isSaveEnabled(draft)}
        />
      </View>
    </ScrollView>
  );
}
