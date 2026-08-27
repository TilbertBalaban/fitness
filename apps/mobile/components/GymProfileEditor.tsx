import Ionicons from '@expo/vector-icons/Ionicons';
import {
  isExactDecimalString,
  toCanonicalKg,
  fromCanonicalKg,
  WEIGHT_UNITS,
  type WeightUnit,
} from '@fitness/api-contracts';
import { useColorScheme } from 'nativewind';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ToggleRow } from '@/app/(tabs)/profile';
import { DetailSection } from '@/components/DetailSection';
import { ErrorBanner } from '@/components/ErrorBanner';
import { renderTargetStepper } from '@/components/ExerciseSlotRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SelectField } from '@/components/SelectField';
import { TextField } from '@/components/TextField';
import {
  BAR_PRESETS,
  isGymProfileSaveable,
  removeDumbbellWeight,
  removeMachine,
  removePlateDenomination,
  setDraftUnit,
  setPlatePairCount,
  toEquipmentProfileDraft,
  updateMachine,
  upsertDumbbellWeight,
  upsertMachine,
  upsertPlateDenomination,
  type BarPreset,
  type EquipmentProfileDraftOutput,
  type GymProfileDraft,
  type GymProfileMachineDraft,
} from '@/lib/gym/profile-draft';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

// ThemeColors (lib/theme-colors.ts) carries only accent/foregroundMuted/surface — no destructive
// glyph color exists there yet, and this file is the only consumer that needs one, so it is
// resolved locally (mirroring SessionActionSheet.tsx's own GLYPH_COLORS pattern and
// global.css's --color-destructive values exactly) rather than widening the shared interface for
// every other consumer of it.
const DESTRUCTIVE_COLORS: Record<'light' | 'dark', string> = {
  light: 'rgb(220, 38, 38)',
  dark: 'rgb(239, 68, 68)',
};

export type EditorColors = ThemeColors & { destructive: string };

const UNIT_OPTIONS = WEIGHT_UNITS.map((unit) => ({ value: unit, label: unit }));

// The chip's "selected" state is derived from the draft's own barWeight value, never a second,
// independently-set field — one source of truth for what the bar weight is, matching D-03's own
// one-conversion-boundary rule. Tapping Custom clears the field (see onSelectBarPreset below),
// which is what makes this function return 'custom' afterward: nothing here is stored twice.
function selectedBarPresetId(draft: GymProfileDraft): BarPreset['id'] {
  const canonical = isExactDecimalString(draft.barWeight) ? toCanonicalKg(draft.barWeight, draft.nativeUnit) : null;
  const match = canonical === null ? undefined : BAR_PRESETS.find((preset) => preset.weightKg === canonical);
  return match ? match.id : 'custom';
}

export type MachinePatch = Partial<Omit<GymProfileMachineDraft, 'id'>>;

export interface GymProfileEditorViewProps {
  heading: string;
  draft: GymProfileDraft;
  colors: EditorColors;
  submitting: boolean;
  saveError: boolean;
  nameError: string | null;
  saveable: boolean;
  plateAddValue: string;
  dumbbellAddValue: string;
  onChangeName: (name: string) => void;
  onChangeUnit: (unit: WeightUnit) => void;
  onSelectBarPreset: (preset: BarPreset) => void;
  onChangeBarWeight: (value: string) => void;
  onChangePlateAddValue: (value: string) => void;
  onCommitPlateAdd: () => void;
  onChangePlatePairCount: (weight: string, next: number) => void;
  onRemovePlate: (weight: string) => void;
  onChangeDumbbellAddValue: (value: string) => void;
  onCommitDumbbellAdd: () => void;
  onRemoveDumbbell: (weight: string) => void;
  onAddMachine: () => void;
  onChangeMachine: (id: string, patch: MachinePatch) => void;
  onRemoveMachine: (id: string) => void;
  onSubmit: () => void;
}

// Hook-free — direct-invocable by a test, matching ExerciseStripView/ExerciseSlotRowView. Every
// rule (conversion, merging, clamping, the save gate) lives in lib/gym/profile-draft.ts; this view
// only ever reads draft fields and calls the handler its caller supplied — it owns no state of
// its own, including the two add-value inputs, which the stateful wrapper below owns instead.
export function GymProfileEditorView({
  heading,
  draft,
  colors,
  submitting,
  saveError,
  nameError,
  saveable,
  plateAddValue,
  dumbbellAddValue,
  onChangeName,
  onChangeUnit,
  onSelectBarPreset,
  onChangeBarWeight,
  onChangePlateAddValue,
  onCommitPlateAdd,
  onChangePlatePairCount,
  onRemovePlate,
  onChangeDumbbellAddValue,
  onCommitDumbbellAdd,
  onRemoveDumbbell,
  onAddMachine,
  onChangeMachine,
  onRemoveMachine,
  onSubmit,
}: GymProfileEditorViewProps) {
  const activePresetId = selectedBarPresetId(draft);

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
      <View className="mt-xl gap-md">
        <Text className="text-heading font-semibold text-foreground">{heading}</Text>

        {saveError ? (
          <ErrorBanner>
            <Text className="text-body font-semibold text-destructive">{"Couldn't save"}</Text>
            <Text className="mt-xs text-body font-normal text-foreground-muted">
              Restart the app to try again. Your programs and history are safe.
            </Text>
          </ErrorBanner>
        ) : null}

        <TextField label="Name" value={draft.name} onChangeText={onChangeName} error={nameError} />

        <SelectField
          label="Unit system"
          value={draft.nativeUnit}
          options={UNIT_OPTIONS}
          placeholder="Select a unit"
          onChange={(value) => onChangeUnit(value as WeightUnit)}
        />

        <DetailSection heading="Bar">
          <View className="gap-sm">
            <View className="flex-row flex-wrap gap-sm">
              {BAR_PRESETS.map((preset) => {
                const selected = preset.id === activePresetId;
                return (
                  <Pressable
                    key={preset.id}
                    onPress={() => onSelectBarPreset(preset)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={preset.label}
                    className={`items-center justify-center rounded-md border bg-surface px-md py-sm ${
                      selected ? 'border-accent' : 'border-foreground-muted'
                    }`}
                    style={{ minWidth: 48, minHeight: 48 }}
                  >
                    <Text className={`text-body font-normal ${selected ? 'text-accent' : 'text-foreground'}`}>
                      {preset.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <TextField
              label={`Bar weight (${draft.nativeUnit})`}
              value={draft.barWeight}
              onChangeText={onChangeBarWeight}
              keyboardType="decimal-pad"
            />
          </View>
        </DetailSection>

        <DetailSection heading="Plates">
          <View className="gap-sm">
            {draft.plates.length === 0 ? (
              <Text className="text-label font-normal text-foreground-muted">No plates added</Text>
            ) : (
              <View className="gap-sm">
                {draft.plates.map((plate) => (
                  <View key={plate.weight} className="flex-row items-center gap-sm">
                    <View
                      className="flex-1 justify-center rounded-md border border-foreground-muted bg-surface px-md py-sm"
                      style={{ minHeight: 48 }}
                    >
                      <Text className="text-body font-normal text-foreground">
                        {plate.weight} {draft.nativeUnit}
                      </Text>
                    </View>

                    {renderTargetStepper({
                      label: 'Pairs',
                      displayValue: String(plate.pairCount),
                      colors,
                      decreaseDisabled: plate.pairCount <= 0,
                      increaseDisabled: false,
                      onDecrease: () => onChangePlatePairCount(plate.weight, plate.pairCount - 1),
                      onIncrease: () => onChangePlatePairCount(plate.weight, plate.pairCount + 1),
                    })}

                    <Pressable
                      onPress={() => onRemovePlate(plate.weight)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${plate.weight} ${draft.nativeUnit} plate`}
                      style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Ionicons name="trash-outline" size={20} color={colors.destructive} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            <View className="flex-row items-end gap-sm">
              <View className="flex-1">
                <TextField
                  label={`Plate weight (${draft.nativeUnit})`}
                  value={plateAddValue}
                  onChangeText={onChangePlateAddValue}
                  keyboardType="decimal-pad"
                />
              </View>
              <Pressable
                onPress={onCommitPlateAdd}
                accessibilityRole="button"
                accessibilityLabel="Add Plate"
                className="items-center justify-center rounded-md border border-foreground-muted px-md py-sm"
                style={{ minWidth: 48, minHeight: 48, borderStyle: 'dashed' }}
              >
                <Text className="text-label font-normal text-accent">+ Add Plate</Text>
              </Pressable>
            </View>
          </View>
        </DetailSection>

        <DetailSection heading="Dumbbells">
          <View className="gap-sm">
            {draft.dumbbells.length === 0 ? (
              <Text className="text-label font-normal text-foreground-muted">No dumbbell weights added</Text>
            ) : (
              <View className="flex-row flex-wrap gap-sm">
                {draft.dumbbells.map((dumbbell) => (
                  <View
                    key={dumbbell.weight}
                    className="flex-row items-center gap-xs rounded-md border border-foreground-muted bg-surface px-md py-sm"
                    style={{ minHeight: 48 }}
                  >
                    <Text className="text-body font-normal text-foreground">
                      {dumbbell.weight} {draft.nativeUnit}
                    </Text>
                    <Pressable
                      onPress={() => onRemoveDumbbell(dumbbell.weight)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${dumbbell.weight} ${draft.nativeUnit} dumbbell`}
                      style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text className="text-label font-normal text-destructive">{'×'}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            <View className="flex-row items-end gap-sm">
              <View className="flex-1">
                <TextField
                  label={`Dumbbell weight (${draft.nativeUnit})`}
                  value={dumbbellAddValue}
                  onChangeText={onChangeDumbbellAddValue}
                  keyboardType="decimal-pad"
                />
              </View>
              <Pressable
                onPress={onCommitDumbbellAdd}
                accessibilityRole="button"
                accessibilityLabel="Add Weight"
                className="items-center justify-center rounded-md border border-foreground-muted px-md py-sm"
                style={{ minWidth: 48, minHeight: 48, borderStyle: 'dashed' }}
              >
                <Text className="text-label font-normal text-accent">+ Add Weight</Text>
              </Pressable>
            </View>
          </View>
        </DetailSection>

        <DetailSection heading="Machines & Cable">
          <View className="gap-sm">
            {draft.machines.length === 0 ? (
              <Text className="text-label font-normal text-foreground-muted">No machines added</Text>
            ) : (
              <View className="gap-sm">
                {draft.machines.map((machine) => (
                  <View key={machine.id} className="gap-sm rounded-md bg-surface p-md">
                    <View className="flex-row items-start gap-sm">
                      <View className="flex-1">
                        <TextField
                          label="Machine name"
                          value={machine.name}
                          onChangeText={(value) => onChangeMachine(machine.id, { name: value })}
                        />
                      </View>
                      <Pressable
                        onPress={() => onRemoveMachine(machine.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${machine.name.trim().length > 0 ? machine.name : 'machine'}`}
                        style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Ionicons name="trash-outline" size={20} color={colors.destructive} />
                      </Pressable>
                    </View>

                    <ToggleRow
                      label="Available"
                      value={machine.available}
                      onToggle={() => onChangeMachine(machine.id, { available: !machine.available })}
                    />

                    {machine.available ? (
                      <View className="gap-sm">
                        <View className="flex-row gap-sm">
                          <View className="flex-1">
                            <TextField
                              label={`Stack min (${draft.nativeUnit})`}
                              value={machine.stackMin}
                              onChangeText={(value) => onChangeMachine(machine.id, { stackMin: value })}
                              keyboardType="decimal-pad"
                            />
                          </View>
                          <View className="flex-1">
                            <TextField
                              label={`Stack max (${draft.nativeUnit})`}
                              value={machine.stackMax}
                              onChangeText={(value) => onChangeMachine(machine.id, { stackMax: value })}
                              keyboardType="decimal-pad"
                            />
                          </View>
                        </View>
                        <TextField
                          label={`Increment (${draft.nativeUnit})`}
                          value={machine.stackIncrement}
                          onChangeText={(value) => onChangeMachine(machine.id, { stackIncrement: value })}
                          keyboardType="decimal-pad"
                        />
                        <TextField
                          label={`Starting resistance, optional (${draft.nativeUnit})`}
                          value={machine.baseResistance}
                          onChangeText={(value) => onChangeMachine(machine.id, { baseResistance: value })}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            )}

            <Pressable
              onPress={onAddMachine}
              accessibilityRole="button"
              accessibilityLabel="Add Machine"
              style={{ minHeight: 48, justifyContent: 'center' }}
            >
              <Text className="text-body font-normal text-accent">+ Add Machine</Text>
            </Pressable>
          </View>
        </DetailSection>

        <PrimaryButton label="Save Gym" onPress={onSubmit} submitting={submitting || !saveable} />
      </View>
    </ScrollView>
  );
}

export interface GymProfileEditorProps {
  heading: string;
  initialDraft: GymProfileDraft;
  onSubmit: (output: EquipmentProfileDraftOutput) => Promise<boolean>;
}

// Thin stateful wrapper — the same split every form component in this codebase uses
// (ExerciseSlotRow/ExerciseStrip). Owns the draft, the two ephemeral "value about to be added"
// inputs (not part of GymProfileDraft — they are not a denomination until committed), and the
// submit lifecycle. On a failed write, saveError is set and the draft is left exactly as the user
// left it — nothing here ever clears the form or navigates away on failure.
export function GymProfileEditor({ heading, initialDraft, onSubmit }: GymProfileEditorProps) {
  const themeColors = useThemeColors();
  const { colorScheme } = useColorScheme();
  const colors: EditorColors = {
    ...themeColors,
    destructive: DESTRUCTIVE_COLORS[colorScheme === 'dark' ? 'dark' : 'light'],
  };

  const [draft, setDraft] = useState<GymProfileDraft>(initialDraft);
  const [plateAddValue, setPlateAddValue] = useState('');
  const [dumbbellAddValue, setDumbbellAddValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const { saveable, nameError } = isGymProfileSaveable(draft);

  async function handleSubmit() {
    if (!saveable || submitting) return;

    setSubmitting(true);
    setSaveError(false);
    try {
      const ok = await onSubmit(toEquipmentProfileDraft(draft));
      if (!ok) setSaveError(true);
    } catch (error) {
      console.error('gym profile save failed', error);
      setSaveError(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <GymProfileEditorView
      heading={heading}
      draft={draft}
      colors={colors}
      submitting={submitting}
      saveError={saveError}
      nameError={nameError}
      saveable={saveable}
      plateAddValue={plateAddValue}
      dumbbellAddValue={dumbbellAddValue}
      onChangeName={(name) => setDraft((current) => ({ ...current, name }))}
      onChangeUnit={(unit) => setDraft((current) => setDraftUnit(current, unit))}
      onSelectBarPreset={(preset) =>
        setDraft((current) => ({
          ...current,
          barWeight:
            preset.weightKg === null ? '' : (fromCanonicalKg(preset.weightKg, current.nativeUnit) ?? current.barWeight),
        }))
      }
      onChangeBarWeight={(value) => setDraft((current) => ({ ...current, barWeight: value }))}
      onChangePlateAddValue={setPlateAddValue}
      onCommitPlateAdd={() => {
        setDraft((current) => upsertPlateDenomination(current, plateAddValue));
        setPlateAddValue('');
      }}
      onChangePlatePairCount={(weight, next) => setDraft((current) => setPlatePairCount(current, weight, next))}
      onRemovePlate={(weight) => setDraft((current) => removePlateDenomination(current, weight))}
      onChangeDumbbellAddValue={setDumbbellAddValue}
      onCommitDumbbellAdd={() => {
        setDraft((current) => upsertDumbbellWeight(current, dumbbellAddValue));
        setDumbbellAddValue('');
      }}
      onRemoveDumbbell={(weight) => setDraft((current) => removeDumbbellWeight(current, weight))}
      onAddMachine={() => setDraft((current) => upsertMachine(current))}
      onChangeMachine={(id, patch) => setDraft((current) => updateMachine(current, id, patch))}
      onRemoveMachine={(id) => setDraft((current) => removeMachine(current, id))}
      onSubmit={() => void handleSubmit()}
    />
  );
}
