import { EQUIPMENT_TYPES, LOAD_TYPES, MOVEMENT_PATTERNS, MUSCLE_GROUPS } from '@fitness/api-contracts';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SelectField } from '@/components/SelectField';
import { TextField } from '@/components/TextField';
import { formatFacetLabel } from '@/lib/catalog/catalog-filter';
import {
  isSaveEnabled,
  submitNewExercise,
  type CustomExerciseDraft,
  type CustomExerciseErrors,
  type MuscleMappingDraft,
} from '@/lib/catalog/custom-exercise';
import { authClient } from '@/lib/auth-client';
import { getPowerSync } from '@/lib/db/powersync';

const LOAD_TYPE_OPTIONS = LOAD_TYPES.map((value) => ({ value, label: formatFacetLabel(value) }));
const EQUIPMENT_OPTIONS = EQUIPMENT_TYPES.map((value) => ({ value, label: formatFacetLabel(value) }));
const MOVEMENT_PATTERN_OPTIONS = MOVEMENT_PATTERNS.map((value) => ({ value, label: formatFacetLabel(value) }));

interface MuscleMappingPickerProps {
  mappings: MuscleMappingDraft[];
  onChange: (next: MuscleMappingDraft[]) => void;
}

// Tapping a muscle group cycles unselected -> primary -> secondary -> unselected. Optional
// field: an exercise with zero mappings is a valid, save-able draft.
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

// TextField.tsx has no multiline mode (out of this plan's declared file scope to extend) — this
// matches its visual contract (label above, bg-surface, rounded-md border) directly rather than
// wrapping it. Auto-grows up to a maximum height, then scrolls internally, so a long cue or
// instruction body can never push the Save control off-screen.
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

export default function NewExerciseScreen() {
  const router = useRouter();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const [name, setName] = useState('');
  const [loadType, setLoadType] = useState<CustomExerciseDraft['loadType']>(null);
  const [equipmentRequired, setEquipmentRequired] = useState<CustomExerciseDraft['equipmentRequired']>(null);
  const [movementPattern, setMovementPattern] = useState<CustomExerciseDraft['movementPattern']>(null);
  const [cueText, setCueText] = useState('');
  const [instructionsText, setInstructionsText] = useState('');
  const [muscleMappings, setMuscleMappings] = useState<MuscleMappingDraft[]>([]);
  const [errors, setErrors] = useState<CustomExerciseErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const draft: CustomExerciseDraft = {
    name,
    loadType,
    equipmentRequired,
    movementPattern,
    cueText: cueText || null,
    instructionsText: instructionsText || null,
    muscleMappings,
  };

  async function onSubmit() {
    if (!userId) return;

    setSubmitting(true);
    const result = await submitNewExercise(getPowerSync(), userId, draft);
    setSubmitting(false);

    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    setErrors({});
    router.replace({ pathname: '/exercises/[id]', params: { id: result.id } });
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
      <View className="mt-xl gap-md">
        <Text className="text-heading font-semibold text-foreground">Add Custom Exercise</Text>

        <TextField
          label="Name"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setErrors((current) => ({ ...current, name: undefined }));
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
            setErrors((current) => ({ ...current, load_type: undefined }));
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

        <PrimaryButton label="Save Exercise" onPress={onSubmit} submitting={submitting || !isSaveEnabled(draft)} />
      </View>
    </ScrollView>
  );
}
