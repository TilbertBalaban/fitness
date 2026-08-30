import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import {
  BODY_METRIC_KIND_LABELS,
  fromCanonicalValue,
  resolveDisplayUnit,
  toCanonicalValue,
  type BodyMetricKind,
  type WeightUnit,
} from '@fitness/api-contracts';
import { applyKeypadPress, MetricValueKeypadView } from './MetricValueKeypad';
import type { KeypadPress } from './NumericKeypad';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { loadWeightUnit } from '@/lib/db/preferences';
import { loadLatestMetric, logMetric } from '@/lib/db/body-metrics';

// Matches the shipped ReorderExercisesSheet/HistoryActionSheet modal card width — this sheet is
// the same card shape as every other action sheet in this app, never a bespoke width (R32).
export const KEYPAD_SHEET_MAX_WIDTH = 400;

const DEFAULT_WEIGHT_UNIT: WeightUnit = 'kg';

export interface MetricEntrySheetViewProps {
  kind: BodyMetricKind;
  unitLabel: string;
  // The field's current DISPLAY-unit string value, driven entirely by applyKeypadPress (D-29) —
  // never fabricated as "0" for an unlogged kind (extends D-13 to entry defaults).
  value: string | null;
  logEnabled: boolean;
  onKeypadPress: (press: KeypadPress) => void;
  onLog: () => void;
  onCancel: () => void;
  colors: ThemeColors;
}

// Hook-free — direct-invocable by a test, matching RecordRowView/MuscleDrilldownSheetView. The
// docked-keypad shape (not the plain action-sheet shape) because it hosts MetricValueKeypad beneath
// the live value display.
export function MetricEntrySheetView({
  kind,
  unitLabel,
  value,
  logEnabled,
  onKeypadPress,
  onLog,
  onCancel,
  colors,
}: MetricEntrySheetViewProps) {
  const kindLabel = BODY_METRIC_KIND_LABELS[kind];

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-background/80 px-lg">
        <View className="w-full rounded-md bg-surface p-lg" style={{ maxWidth: KEYPAD_SHEET_MAX_WIDTH }}>
          <Text className="text-heading font-semibold text-foreground">{`Log ${kindLabel}`}</Text>

          <View className="mt-lg items-center">
            <View className="flex-row items-baseline gap-xs">
              <Text className="text-display font-semibold text-foreground">{value ?? ''}</Text>
              <Text className="text-label font-normal text-foreground-muted">{unitLabel}</Text>
            </View>
          </View>

          <View className="mt-lg">
            <MetricValueKeypadView colors={colors} onPress={onKeypadPress} />
          </View>

          <View className="mt-lg gap-sm">
            <Pressable
              onPress={onLog}
              disabled={!logEnabled}
              accessibilityRole="button"
              accessibilityLabel="Log"
              accessibilityState={{ disabled: !logEnabled }}
              className={`items-center justify-center rounded-md bg-accent px-md py-sm ${logEnabled ? '' : 'opacity-60'}`}
              style={{ minHeight: 48 }}
            >
              <Text className="text-body font-semibold text-white">Log</Text>
            </Pressable>
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text className="text-body font-normal text-foreground-muted">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export interface MetricEntrySheetProps {
  userId: string;
  kind: BodyMetricKind;
  db?: WriteDb;
  onCancel: () => void;
  onLogged: () => void;
}

// resolveDisplayUnit renders 'percent' as the word "percent"; the sheet's trailing unit label is
// always the short glyph a user actually reads next to a typed number.
function unitLabel(displayUnit: ReturnType<typeof resolveDisplayUnit>): string {
  return displayUnit === 'percent' ? '%' : displayUnit;
}

// The stateful wrapper — owns the last-value read, the keypad's reducer state and the write. One
// preference (weightUnit) resolves the display unit for every kind via resolveDisplayUnit — a
// circumference kind entered under an lb preference is entered in inches, stored in centimetres,
// and read back in inches (D-08).
export function MetricEntrySheet({ userId, kind, db, onCancel, onLogged }: MetricEntrySheetProps) {
  const colors = useThemeColors();
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(DEFAULT_WEIGHT_UNIT);
  const [value, setValue] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const database = db ?? getPowerSync();
      const [unit, latest] = await Promise.all([loadWeightUnit(userId, database), loadLatestMetric(userId, kind, database)]);
      if (!active) return;
      setWeightUnit(unit);
      setValue(latest ? fromCanonicalValue(kind, latest.value, unit) : null);
    })();
    return () => {
      active = false;
    };
  }, [userId, kind, db]);

  const handleLog = () => {
    if (value === null || value === '') return;
    const canonical = toCanonicalValue(kind, value, weightUnit);
    if (canonical === null) return;
    void logMetric({ userId, kind, value: canonical }, db ?? getPowerSync()).then(onLogged);
  };

  return (
    <MetricEntrySheetView
      kind={kind}
      unitLabel={unitLabel(resolveDisplayUnit(kind, weightUnit))}
      value={value}
      logEnabled={value !== null && value !== ''}
      onKeypadPress={(press) => setValue((current) => applyKeypadPress(current, press))}
      onLog={handleLog}
      onCancel={onCancel}
      colors={colors}
    />
  );
}
