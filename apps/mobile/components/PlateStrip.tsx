import { Pressable, Text, View } from 'react-native';
import { fromCanonicalKg, type WeightUnit } from '@fitness/api-contracts';
import type { EquipmentBandState } from '@fitness/plate-math';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

const PLATE_SEPARATOR = ' · ';

// Mirrors NumericKeypad.tsx's own RESERVED_BAND_HEIGHT — kept as a separate constant rather than
// an import so PlateStrip.tsx (mounted BY NumericKeypad.tsx) never imports back from it, which
// would make the two files mutually dependent.
const RESERVED_BAND_HEIGHT = 40;

// The Spacing Scale's grow-past-40px exception (06-UI-SPEC): a real tap target (the not-loadable
// neighbours, the zero-plates recovery link) always gets the shipped 48px minimum, never a faked
// hit area at the passive 40px height.
const MIN_TOUCH_SIZE = 48;

function display(kg: string, unit: WeightUnit): string {
  return fromCanonicalKg(kg, unit) as string;
}

function displayWithUnit(kg: string, unit: WeightUnit): string {
  return `${display(kg, unit)}${unit}`;
}

export interface PlateStripViewProps {
  state: EquipmentBandState;
  unit: WeightUnit;
  colors: ThemeColors;
  // Fires with the tapped neighbour's canonical-kg value — the caller writes it into the weight
  // field exactly as if typed (D-09). This view decides nothing about where that value goes.
  onNeighbourPress: (valueKg: string) => void;
  // Routes to the active gym's Plates editor section — a navigation the caller owns, not this view.
  onRecoveryPress: () => void;
}

function renderPlates(state: Extract<EquipmentBandState, { kind: 'plates' }>, unit: WeightUnit) {
  const barLabel = `${display(state.barKg, unit)}${unit} bar`;
  const stackLabel = state.perSidePlatesKg.map((plateKg) => display(plateKg, unit)).join(PLATE_SEPARATOR);

  return (
    <View
      className="flex-row flex-wrap items-center justify-center gap-2 bg-background"
      style={{ minHeight: RESERVED_BAND_HEIGHT }}
    >
      <Text className="text-label font-normal text-foreground-muted">{barLabel}</Text>
      {stackLabel.length > 0 ? <Text className="text-body font-semibold text-foreground">{stackLabel}</Text> : null}
    </View>
  );
}

function renderPair(state: Extract<EquipmentBandState, { kind: 'pair' }>, unit: WeightUnit) {
  return (
    <View
      className="flex-row flex-wrap items-center justify-center gap-2 bg-background"
      style={{ minHeight: RESERVED_BAND_HEIGHT }}
    >
      <Text className="text-body font-semibold text-foreground">{`${displayWithUnit(state.weightKg, unit)} pair`}</Text>
    </View>
  );
}

function renderStack(state: Extract<EquipmentBandState, { kind: 'stack' }>, unit: WeightUnit) {
  const parts = [`Stack ${display(state.minKg, unit)}–${displayWithUnit(state.maxKg, unit)}`];
  if (state.incrementKg !== null) parts.push(`+${displayWithUnit(state.incrementKg, unit)} steps`);
  if (state.baseResistanceKg !== null) parts.push(`+${displayWithUnit(state.baseResistanceKg, unit)} base`);

  return (
    <View
      className="flex-row flex-wrap items-center justify-center gap-2 bg-background"
      style={{ minHeight: RESERVED_BAND_HEIGHT }}
    >
      <Text className="text-body font-semibold text-foreground">{parts.join(PLATE_SEPARATOR)}</Text>
    </View>
  );
}

function renderNeighbour(kg: string, unit: WeightUnit, onNeighbourPress: (valueKg: string) => void) {
  const label = displayWithUnit(kg, unit);
  return (
    <Pressable
      onPress={() => onNeighbourPress(kg)}
      accessibilityRole="button"
      accessibilityLabel={`Use ${label}`}
      style={{ minWidth: MIN_TOUCH_SIZE, minHeight: MIN_TOUCH_SIZE, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text className="text-body font-semibold text-accent">{label}</Text>
    </Pressable>
  );
}

function renderNotLoadable(
  state: Extract<EquipmentBandState, { kind: 'not_loadable' }>,
  unit: WeightUnit,
  onNeighbourPress: (valueKg: string) => void,
) {
  return (
    <View
      className="flex-row flex-wrap items-center justify-center gap-2 bg-background"
      style={{ minHeight: MIN_TOUCH_SIZE }}
    >
      <Text className="text-label font-normal text-foreground-muted">Not loadable</Text>
      {state.lowerKg !== null ? renderNeighbour(state.lowerKg, unit, onNeighbourPress) : null}
      <Text className="text-label font-normal text-foreground-muted">{'← →'}</Text>
      {state.higherKg !== null ? renderNeighbour(state.higherKg, unit, onNeighbourPress) : null}
    </View>
  );
}

function renderNoPlates(onRecoveryPress: () => void) {
  return (
    <View
      className="flex-row flex-wrap items-center justify-center gap-2 bg-background"
      style={{ minHeight: MIN_TOUCH_SIZE }}
    >
      <Text className="text-label font-normal text-foreground-muted">No plates configured</Text>
      <Pressable
        onPress={onRecoveryPress}
        accessibilityRole="button"
        accessibilityLabel="Add plates"
        style={{ minWidth: MIN_TOUCH_SIZE, minHeight: MIN_TOUCH_SIZE, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text className="text-body font-semibold text-accent">Add plates</Text>
      </Pressable>
    </View>
  );
}

const COLLAPSED = <View style={{ height: 0 }} />;

// Hook-free and props-driven (D-12): given an already-resolved EquipmentBandState it renders
// synchronously — it never calls the solver or the band resolver itself (that computation happens
// once in the caller, memoised on the inventory and target pair). Wrapped in a defensive try/catch
// so a thrown formatting error collapses the band to zero height rather than surfacing a partial or
// garbled computation inside the keypad's reserved slot (E3 error state).
export function PlateStripView({ state, unit, onNeighbourPress, onRecoveryPress }: PlateStripViewProps) {
  try {
    switch (state.kind) {
      case 'plates':
        return renderPlates(state, unit);
      case 'pair':
        return renderPair(state, unit);
      case 'stack':
        return renderStack(state, unit);
      case 'not_loadable':
        return renderNotLoadable(state, unit, onNeighbourPress);
      case 'no_plates':
        return renderNoPlates(onRecoveryPress);
      case 'collapsed':
      default:
        return COLLAPSED;
    }
  } catch {
    return COLLAPSED;
  }
}

export interface PlateStripProps {
  state: EquipmentBandState;
  unit: WeightUnit;
  onNeighbourPress: (valueKg: string) => void;
  onRecoveryPress: () => void;
}

// The stateful wrapper: resolves theme colors only. Every band computation already happened in the
// caller before this component ever mounts — this file makes no call to solvePlateBreakdown or
// resolveEquipmentBand at any call site.
export function PlateStrip({ state, unit, onNeighbourPress, onRecoveryPress }: PlateStripProps) {
  const colors = useThemeColors();
  return (
    <PlateStripView state={state} unit={unit} colors={colors} onNeighbourPress={onNeighbourPress} onRecoveryPress={onRecoveryPress} />
  );
}
