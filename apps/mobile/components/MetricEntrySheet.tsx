import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import {
  BODY_METRIC_KIND_LABELS,
  BODY_METRIC_KIND_ORDER,
  fromCanonicalValue,
  resolveDisplayUnit,
  toCanonicalValue,
  type BodyMetricKind,
  type WeightUnit,
} from '@fitness/api-contracts';
import { applyKeypadPress, MetricValueKeypadView } from './MetricValueKeypad';
import type { KeypadPress } from './NumericKeypad';
import { SegmentedChipRowView } from './SegmentedChipRow';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { loadWeightUnit } from '@/lib/db/preferences';
import { loadLatestMetric, logMetric, updateMetric } from '@/lib/db/body-metrics';

// Matches the shipped ReorderExercisesSheet/HistoryActionSheet modal card width — this sheet is
// the same card shape as every other action sheet in this app, never a bespoke width (R32).
export const KEYPAD_SHEET_MAX_WIDTH = 400;

const DEFAULT_WEIGHT_UNIT: WeightUnit = 'kg';

export interface MetricEntrySheetViewProps {
  // null only for the quick-measurement entry point, before a kind has been chosen from the kind
  // picker (decision 6). Every other entry point (S5/S6 row-level "+"/edit affordances, the
  // Quick Weigh-In action, TrackKindSheet's own selection) supplies a kind up front.
  kind: BodyMetricKind | null;
  // The user's tracked kinds excluding bodyweight — the kind picker's own chip options. Ignored
  // when kind is already named.
  pickerKinds: BodyMetricKind[];
  unitLabel: string;
  // The field's current DISPLAY-unit string value, driven entirely by applyKeypadPress (D-29) —
  // never fabricated as "0" for an unlogged kind (extends D-13 to entry defaults).
  value: string | null;
  logEnabled: boolean;
  // A write that failed keeps the sheet open and Log re-enabled (never a silent failure, never a
  // dismissed sheet with a lost value) — see MetricEntrySheet's handleLog below.
  writeFailed: boolean;
  onSelectKind: (kind: BodyMetricKind) => void;
  onKeypadPress: (press: KeypadPress) => void;
  onLog: () => void;
  onCancel: () => void;
  colors: ThemeColors;
}

// Hook-free — direct-invocable by a test, matching RecordRowView/MuscleDrilldownSheetView. The
// docked-keypad shape (not the plain action-sheet shape) because it hosts MetricValueKeypad beneath
// the live value display. Two steps, never rendered together: the kind picker (kind === null) or
// the value entry (kind named) — "Selecting a chip advances to step 3" (UI-SPEC S4).
export function MetricEntrySheetView({
  kind,
  pickerKinds,
  unitLabel,
  value,
  logEnabled,
  writeFailed,
  onSelectKind,
  onKeypadPress,
  onLog,
  onCancel,
  colors,
}: MetricEntrySheetViewProps) {
  const kindLabel = kind ? BODY_METRIC_KIND_LABELS[kind] : null;

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-background/80 px-lg">
        <View className="w-full rounded-md bg-surface p-lg" style={{ maxWidth: KEYPAD_SHEET_MAX_WIDTH }}>
          <Text className="text-heading font-semibold text-foreground">
            {kindLabel ? `Log ${kindLabel}` : 'Log a Measurement'}
          </Text>

          {kind === null ? (
            <View className="mt-lg">
              <SegmentedChipRowView
                groupLabel="Measurement kind"
                options={pickerKinds.map((pickerKind) => ({ id: pickerKind, label: BODY_METRIC_KIND_LABELS[pickerKind] }))}
                selectedId=""
                onSelect={(id) => onSelectKind(id as BodyMetricKind)}
                colors={colors}
              />
            </View>
          ) : (
            <>
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
                {writeFailed ? (
                  <Text className="text-label font-normal text-foreground-muted">{"Couldn't save. Try again."}</Text>
                ) : null}
              </View>
            </>
          )}

          <View className="mt-lg flex-row justify-end">
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
  // null opens the sheet on the quick-measurement kind picker instead of a named kind.
  kind: BodyMetricKind | null;
  // Required when kind is null — the picker's own chip options are derived from it (bodyweight
  // excluded). Unused once a kind is named.
  trackedKinds?: ReadonlySet<BodyMetricKind>;
  // Present only when this sheet is editing an existing S6 entry rather than logging a new one —
  // pre-fills THIS entry's own canonical value rather than the kind's latest (UI-SPEC Confirmations:
  // "not the kind's latest, since this IS the entry being edited"), and routes the confirm action
  // through updateMetric instead of logMetric. D-10: no separate correction concept — this is an
  // ordinary row edit, saved with no confirmation.
  editEntry?: { id: string; canonicalValue: string };
  db?: WriteDb;
  onCancel: () => void;
  onLogged: () => void;
}

// resolveDisplayUnit renders 'percent' as the word "percent"; the sheet's trailing unit label is
// always the short glyph a user actually reads next to a typed number.
function unitLabel(displayUnit: ReturnType<typeof resolveDisplayUnit>): string {
  return displayUnit === 'percent' ? '%' : displayUnit;
}

// The stateful wrapper — owns the kind-picker selection, the last-value read, the keypad's reducer
// state, the write and its failure state. One preference (weightUnit) resolves the display unit for
// every kind via resolveDisplayUnit — a circumference kind entered under an lb preference is
// entered in inches, stored in centimetres, and read back in inches (D-08).
export function MetricEntrySheet({
  userId,
  kind: initialKind,
  trackedKinds,
  editEntry,
  db,
  onCancel,
  onLogged,
}: MetricEntrySheetProps) {
  const colors = useThemeColors();
  const [selectedKind, setSelectedKind] = useState<BodyMetricKind | null>(initialKind);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(DEFAULT_WEIGHT_UNIT);
  const [value, setValue] = useState<string | null>(null);
  const [writeFailed, setWriteFailed] = useState(false);

  useEffect(() => {
    if (selectedKind === null) return;
    let active = true;
    void (async () => {
      const database = db ?? getPowerSync();
      const unit = await loadWeightUnit(userId, database);
      if (!active) return;
      setWeightUnit(unit);
      // editEntry checked BEFORE any loadLatestMetric read — an edit pre-fills the entry being
      // edited, never the kind's latest (which could be a newer, different entry).
      if (editEntry) {
        setValue(fromCanonicalValue(selectedKind, editEntry.canonicalValue, unit));
        return;
      }
      const latest = await loadLatestMetric(userId, selectedKind, database);
      if (!active) return;
      setValue(latest ? fromCanonicalValue(selectedKind, latest.value, unit) : null);
    })();
    return () => {
      active = false;
    };
  }, [userId, selectedKind, editEntry, db]);

  const handleLog = async () => {
    if (selectedKind === null || value === null || value === '') return;
    const canonical = toCanonicalValue(selectedKind, value, weightUnit);
    if (canonical === null) return;
    try {
      if (editEntry) {
        await updateMetric({ userId, id: editEntry.id, value: canonical }, db ?? getPowerSync());
      } else {
        await logMetric({ userId, kind: selectedKind, value: canonical }, db ?? getPowerSync());
      }
      setWriteFailed(false);
      onLogged();
    } catch (error) {
      console.error('log metric failed', error);
      setWriteFailed(true);
    }
  };

  const pickerKinds = trackedKinds
    ? BODY_METRIC_KIND_ORDER.filter((candidate) => candidate !== 'bodyweight' && trackedKinds.has(candidate))
    : [];

  return (
    <MetricEntrySheetView
      kind={selectedKind}
      pickerKinds={pickerKinds}
      unitLabel={selectedKind ? unitLabel(resolveDisplayUnit(selectedKind, weightUnit)) : ''}
      value={value}
      logEnabled={value !== null && value !== ''}
      writeFailed={writeFailed}
      onSelectKind={setSelectedKind}
      onKeypadPress={(press) => setValue((current) => applyKeypadPress(current, press))}
      onLog={() => void handleLog()}
      onCancel={onCancel}
      colors={colors}
    />
  );
}
