import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { fromCanonicalKg, type WeightUnit } from '@fitness/api-contracts';
import { solvePlateBreakdown, type PlateBreakdown, type ResolvedInventory } from '@fitness/plate-math';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

const PLATE_SEPARATOR = ' · ';

// Mirrors NumericKeypad.tsx's own RESERVED_BAND_HEIGHT — kept as a separate constant rather than
// an import so PlateStrip.tsx (mounted BY NumericKeypad.tsx) never imports back from it, which
// would make the two files mutually dependent.
const RESERVED_BAND_HEIGHT = 40;

export interface PlateStripViewProps {
  breakdown: PlateBreakdown;
  unit: WeightUnit;
  colors: ThemeColors;
}

// Hook-free and props-driven, matching NumericKeypadView's own shape (D-12): given an
// already-computed PlateBreakdown it renders synchronously — it never calls the solver itself.
// Loadable renders the bar-weight prefix (quiet, Label/muted) then the descending per-side stack
// (Body semibold), middle-dot joined. Every other kind collapses to zero height this task; 06-05
// fills in the not-loadable/no-plates/unsupported content.
export function PlateStripView({ breakdown, unit, colors }: PlateStripViewProps) {
  if (breakdown.kind !== 'loadable') {
    return <View style={{ height: 0 }} />;
  }

  const barLabel = `${fromCanonicalKg(breakdown.barKg, unit)}${unit} bar`;
  const stackLabel = breakdown.perSidePlatesKg.map((plateKg) => fromCanonicalKg(plateKg, unit)).join(PLATE_SEPARATOR);

  return (
    <View
      className="flex-row items-center justify-center gap-2 bg-background"
      style={{ minHeight: RESERVED_BAND_HEIGHT }}
    >
      <Text className="text-label font-normal text-foreground-muted">{barLabel}</Text>
      {stackLabel.length > 0 ? <Text className="text-body font-semibold text-foreground">{stackLabel}</Text> : null}
    </View>
  );
}

export interface PlateStripProps {
  inventory: ResolvedInventory | null;
  targetKg: string | null;
  unit: WeightUnit;
}

// The stateful wrapper: resolves theme colors and memoises the solver call on the
// (inventory, target) pair, so a keystroke that changes neither does not re-solve (D-15's live-
// typing constraint).
export function PlateStrip({ inventory, targetKg, unit }: PlateStripProps) {
  const colors = useThemeColors();

  const breakdown = useMemo<PlateBreakdown>(() => {
    if (!inventory || targetKg === null) return { kind: 'unsupported' };
    return solvePlateBreakdown(targetKg, inventory);
  }, [inventory, targetKg]);

  return <PlateStripView breakdown={breakdown} unit={unit} colors={colors} />;
}
