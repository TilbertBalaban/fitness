import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { fromCanonicalKg, toCanonicalKg, type EquipmentType, type WeightUnit } from '@fitness/api-contracts';
import { DEFAULT_ROUNDING_INCREMENT_KG, warmupSets } from '@fitness/pr-rules';
import { TextField } from './TextField';
import { generateWarmupSets } from '@/lib/db/session-mutations';
import { defaultWarmupWorkingWeightKg } from '@/lib/db/session-query';

export interface WarmupSheetViewProps {
  weightText: string;
  weightUnit: WeightUnit;
  count: number;
  saving: boolean;
  onChangeWeight: (text: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

// Hook-free — direct-invocable by a test, matching NoteSheetView/TargetsSheetView. Also serves as
// the regenerate-context sheet (05-UI-SPEC): tapping Warm-up when a ladder already exists opens
// this same component, letting the working weight be adjusted before regenerating — there is no
// second, different sheet.
export function WarmupSheetView({ weightText, weightUnit, count, saving, onChangeWeight, onConfirm, onCancel }: WarmupSheetViewProps) {
  const trimmed = weightText.trim();
  const weightKnown = trimmed.length > 0;
  const confirmDisabled = saving || !weightKnown;
  const basis = weightKnown ? `${trimmed} ${weightUnit}` : 'a working weight';

  return (
    <View className="flex-1 items-center justify-center bg-background/80 px-lg">
      <ScrollView className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg" contentContainerStyle={{ flexGrow: 1 }}>
        <Text className="text-heading font-semibold text-foreground">Add Warm-up Sets</Text>
        <Text className="mt-sm text-body font-normal text-foreground-muted">
          {`Based on ${basis}, we'll add ${count} warm-up sets.`}
        </Text>

        <View className="mt-md">
          <TextField
            label={`Working weight (${weightUnit})`}
            value={weightText}
            onChangeText={onChangeWeight}
            keyboardType="decimal-pad"
          />
        </View>

        <View className="mt-lg gap-sm">
          <Pressable
            onPress={onConfirm}
            disabled={confirmDisabled}
            accessibilityRole="button"
            accessibilityLabel="Add Warm-up Sets"
            className="items-center justify-center rounded-md bg-accent py-sm"
            style={{ minHeight: 48, opacity: confirmDisabled ? 0.6 : 1 }}
          >
            <Text className="text-body font-semibold text-white">Add Warm-up Sets</Text>
          </Pressable>

          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            className="items-center justify-center py-sm"
            style={{ minHeight: 48 }}
          >
            <Text className="text-body text-foreground-muted">Cancel</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

export interface WarmupSheetProps {
  sessionExerciseId: string;
  exerciseId: string;
  liveSessionId: string;
  userId: string | null;
  weightUnit: WeightUnit;
  equipmentType: EquipmentType | null;
  onDone: () => void;
  onCancel: () => void;
}

// Thin stateful wrapper: resolves the default working weight on mount (D-16's history prefill,
// falling back to blank/required — session-query.ts's defaultWarmupWorkingWeightKg owns that
// resolution order), lets the user adjust it, and on confirm calls generateWarmupSets with the
// canonical-kg number — never percentage/rounding arithmetic here, @fitness/pr-rules's warmupSets
// is the only source of the ladder and its live preview count.
export function WarmupSheet({
  sessionExerciseId,
  exerciseId,
  liveSessionId,
  userId,
  weightUnit,
  equipmentType,
  onDone,
  onCancel,
}: WarmupSheetProps) {
  const [weightText, setWeightText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void defaultWarmupWorkingWeightKg({ sessionExerciseId, exerciseId, beforeSessionId: liveSessionId, userId }).then(
      (weightKg) => {
        if (!active) return;
        const display = fromCanonicalKg(weightKg, weightUnit);
        if (display !== null) setWeightText(display);
      },
    );
    return () => {
      active = false;
    };
  }, [sessionExerciseId, exerciseId, liveSessionId, userId, weightUnit]);

  const workingWeightKg = toCanonicalKg(weightText.trim().length > 0 ? weightText : null, weightUnit);
  const count = warmupSets(workingWeightKg === null ? null : Number(workingWeightKg), DEFAULT_ROUNDING_INCREMENT_KG).length;

  const handleConfirm = async () => {
    if (workingWeightKg === null) return;
    setSaving(true);
    try {
      await generateWarmupSets({
        sessionExerciseId,
        workingWeightKg: Number(workingWeightKg),
        roundingIncrementKg: DEFAULT_ROUNDING_INCREMENT_KG,
        equipmentType,
      });
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <WarmupSheetView
      weightText={weightText}
      weightUnit={weightUnit}
      count={count}
      saving={saving}
      onChangeWeight={setWeightText}
      onConfirm={() => void handleConfirm()}
      onCancel={onCancel}
    />
  );
}
