import { Text, View } from 'react-native';
// Shape primitives only. R16 forbids importing this library's Text/TSpan/TextPath under any alias:
// in-canvas text does not honour OS font scaling on either target, and that is the whole mechanism
// behind this phase's large-font-scale guarantee.
import Svg, { Rect } from 'react-native-svg';
import {
  MUSCLE_MAP_ROW_ORDER,
  topTrainedPoint,
  type MuscleFigureSide,
  type MuscleMapPoint,
} from '@fitness/analytics-engine';
import type { MuscleGroupId } from '@fitness/api-contracts';
import type { ThemeColors } from '@/lib/theme-colors';

export const MUSCLE_FIGURE_HEIGHT = 240;
export const MIN_FIGURE_WIDTH = 120;
export const FIGURE_GAP = 16;
export const UNTRAINED_FILL_OPACITY = 0.16;
export const TRAINED_FILL_OPACITY_FLOOR = 0.35;

const SCREEN_PADDING = 24;
const ZONE_MARGIN = 4;
const ZONE_COLUMNS = 2;

// Mirrors resolveChartWidth's exported, unit-testable, hook-free idiom (TrendChart.tsx) exactly —
// same shape, one more figure to fit.
export function resolveMuscleMapFigureWidth(windowWidth: number): number {
  const safeWindowWidth = Number.isFinite(windowWidth) ? windowWidth : 0;
  return Math.max(MIN_FIGURE_WIDTH, (safeWindowWidth - 2 * SCREEN_PADDING - FIGURE_GAP) / 2);
}

export interface MuscleHeatmapPoint extends MuscleMapPoint {
  muscleName: string;
  volumeLabel: string | null;
}

export interface MuscleHeatmapProps {
  points: MuscleHeatmapPoint[];
  colors: ThemeColors;
  frontWidth: number;
  backWidth: number;
  windowLabel: string;
}

// A muscle group absent from the host's points array falls back to this untrained shape rather
// than an ambiguous blank frame — this is what makes the zero-figure-data guard hold for real.
function fallbackPoint(muscleGroupId: MuscleGroupId, side: MuscleFigureSide): MuscleHeatmapPoint {
  return {
    muscleGroupId,
    side,
    trainingVolumeKg: null,
    weightedSets: null,
    setCount: 0,
    relativeIntensity: null,
    muscleName: '',
    volumeLabel: null,
  };
}

// Always MUSCLE_MAP_ROW_ORDER[side].length zones, in that fixed order, whatever the host supplies —
// never called with fewer than nineteen combined by contract, but this normalizer is what stops a
// host under-supplying from producing a shorter, ambiguous figure.
function zonesForSide(side: MuscleFigureSide, points: MuscleHeatmapPoint[]): MuscleHeatmapPoint[] {
  const byId = new Map(points.map((point) => [point.muscleGroupId, point]));
  return MUSCLE_MAP_ROW_ORDER[side].map((muscleGroupId) => byId.get(muscleGroupId) ?? fallbackPoint(muscleGroupId, side));
}

// Categorical, never continuous, across the untrained/trained boundary (R22/D-10): untrained is
// always the muted foreground at a fixed low opacity, trained is always the accent at a floor
// opacity plus its share of the remaining range. No gradient ever crosses between the two colours —
// that is what keeps "no data" and "trained lightly" from ever looking alike.
export function fillForMusclePoint(point: MuscleHeatmapPoint, colors: ThemeColors): { color: string; opacity: number } {
  if (point.trainingVolumeKg === null) {
    return { color: colors.foregroundMuted, opacity: UNTRAINED_FILL_OPACITY };
  }
  const relativeIntensity = point.relativeIntensity ?? 0;
  return { color: colors.accent, opacity: TRAINED_FILL_OPACITY_FLOOR + relativeIntensity * (1 - TRAINED_FILL_OPACITY_FLOOR) };
}

export interface MuscleMapFigureSummaryInput {
  side: MuscleFigureSide;
  windowLabel: string;
  points: MuscleHeatmapPoint[];
}

// R23: the one sentence each figure announces. Exported and unit-tested on its own, matching
// trendChartSummary's exact idiom, so the CONTENT of the announcement is proven without a renderer.
export function muscleMapFigureSummary({ side, windowLabel, points }: MuscleMapFigureSummaryInput): string {
  const sideName = side === 'front' ? 'Front' : 'Back';
  const zones = zonesForSide(side, points);
  const trained = zones.filter((zone) => zone.trainingVolumeKg !== null);

  if (trained.length === 0) {
    return `${sideName} view, ${windowLabel}. No muscles trained on this view.`;
  }

  // The pure package's tie-break lives in topTrainedPoint; a second sort here would silently
  // override it, so the top muscle is found this way rather than by ranking again.
  const top = topTrainedPoint(zones, side) as MuscleHeatmapPoint | null;
  const topVolumeLabel = top?.volumeLabel ?? '';
  return `${sideName} view, ${windowLabel}. ${trained.length} of ${zones.length} muscles trained. Highest: ${top?.muscleName ?? ''}, ${topVolumeLabel} Training Volume.`;
}

// Hides one shape from assistive technology on both platforms, copied from TrendChart, so a reader
// announces the figure once through the canvas root rather than reciting nineteen anonymous shapes.
const HIDDEN_FROM_ASSISTIVE_TECH = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

function zoneLayout(index: number, total: number, width: number): { x: number; y: number; width: number; height: number } {
  const rows = Math.ceil(total / ZONE_COLUMNS);
  const row = Math.floor(index / ZONE_COLUMNS);
  const column = index % ZONE_COLUMNS;
  const cellWidth = width / ZONE_COLUMNS;
  const cellHeight = MUSCLE_FIGURE_HEIGHT / rows;
  return {
    x: column * cellWidth + ZONE_MARGIN,
    y: row * cellHeight + ZONE_MARGIN,
    width: Math.max(0, cellWidth - ZONE_MARGIN * 2),
    height: Math.max(0, cellHeight - ZONE_MARGIN * 2),
  };
}

function renderZones(side: MuscleFigureSide, width: number, points: MuscleHeatmapPoint[], colors: ThemeColors) {
  const zones = zonesForSide(side, points);
  return zones.map((zone, index) => {
    const layout = zoneLayout(index, zones.length, width);
    const fill = fillForMusclePoint(zone, colors);
    return (
      <Rect
        key={zone.muscleGroupId}
        x={layout.x}
        y={layout.y}
        width={layout.width}
        height={layout.height}
        rx={4}
        fill={fill.color}
        fillOpacity={fill.opacity}
        {...HIDDEN_FROM_ASSISTIVE_TECH}
      />
    );
  });
}

// Hook-free and computation-free — it receives already-bucketed, already-labelled points and takes
// colors as a prop, so a test invokes it directly with no renderer. All aggregation lives in the
// pure package, not here. No .web.tsx sibling: one file, both targets (D-05). Two <Svg> blocks are
// written out separately rather than shared through one sub-component, so each carries its own,
// independently-announced accessibilityRole and label rather than one function's props threading
// masking the fact that there are genuinely two figures here.
export function MuscleHeatmap({ points, colors, frontWidth, backWidth, windowLabel }: MuscleHeatmapProps) {
  const frontLabel = muscleMapFigureSummary({ side: 'front', windowLabel, points });
  const backLabel = muscleMapFigureSummary({ side: 'back', windowLabel, points });

  return (
    <View className="flex-row gap-md">
      <View className="items-center gap-xs">
        <Svg width={frontWidth} height={MUSCLE_FIGURE_HEIGHT} accessible accessibilityRole="image" accessibilityLabel={frontLabel}>
          {renderZones('front', frontWidth, points, colors)}
        </Svg>
        <Text className="text-label font-normal text-foreground-muted">Front</Text>
      </View>
      <View className="items-center gap-xs">
        <Svg width={backWidth} height={MUSCLE_FIGURE_HEIGHT} accessible accessibilityRole="image" accessibilityLabel={backLabel}>
          {renderZones('back', backWidth, points, colors)}
        </Svg>
        <Text className="text-label font-normal text-foreground-muted">Back</Text>
      </View>
    </View>
  );
}
