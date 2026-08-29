import { Text, View } from 'react-native';
// Shape primitives only. R16 forbids importing this library's Text/TSpan/TextPath under any alias:
// in-canvas text does not honour OS font scaling on either target, and that is the whole mechanism
// behind this phase's large-font-scale guarantee.
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { buildChartGeometry } from '@fitness/analytics-engine';
import type { ThemeColors } from '@/lib/theme-colors';

export const TREND_CHART_HEIGHT = 120;
export const MIN_CHART_WIDTH = 200;
export const MAX_POINT_MARKERS = 12;

const SCREEN_PADDING = 24;
const CARD_PADDING = 16;
const MARKER_RADIUS = 3;
const FINAL_MARKER_RADIUS = 4;
const SINGLE_POINT_RADIUS = 5;
const LINE_STROKE_WIDTH = 2;
const AREA_FILL_OPACITY = 0.12;
const BASELINE_STROKE_OPACITY = 0.3;
const EN_DASH = ' – ';
const MIDDLE_DOT = ' · ';

// Mirrors the exported resolveHeroImageWidth idiom: a pure, separately-testable width resolver, so
// a collapsed or unbounded canvas could only originate here.
export function resolveChartWidth(windowWidth: number): number {
  const safeWindowWidth = Number.isFinite(windowWidth) ? windowWidth : 0;
  return Math.max(MIN_CHART_WIDTH, safeWindowWidth - 2 * SCREEN_PADDING - 2 * CARD_PADDING);
}

export interface TrendPoint {
  key: string;
  value: number;
  valueLabel: string;
  dateLabel: string;
}

export interface TrendChartProps {
  points: TrendPoint[];
  colors: ThemeColors;
  width: number;
  metricLabel: string;
  rangeLabel: string;
}

function extremeLabels(points: TrendPoint[]): { minLabel: string; maxLabel: string } {
  let lowest = points[0];
  let highest = points[0];
  for (const point of points) {
    if (point.value < lowest.value) lowest = point;
    if (point.value > highest.value) highest = point;
  }
  return { minLabel: lowest.valueLabel, maxLabel: highest.valueLabel };
}

// R20: the one sentence the chart announces. Exported and unit-tested on its own so the CONTENT of
// the announcement is proven without a renderer, leaving the e2e only to prove it reached the DOM.
export function trendChartSummary({ points, metricLabel, rangeLabel }: TrendChartProps): string {
  const opening = `${metricLabel} over ${rangeLabel}.`;
  if (points.length === 1) {
    const only = points[0];
    return `${opening} One point: ${only.valueLabel} on ${only.dateLabel}.`;
  }
  const first = points[0];
  const last = points[points.length - 1];
  const { minLabel, maxLabel } = extremeLabels(points);
  return `${opening} ${points.length} points. From ${first.valueLabel} on ${first.dateLabel} to ${last.valueLabel} on ${last.dateLabel}. Lowest ${minLabel}, highest ${maxLabel}.`;
}

// Hides one shape from assistive technology on both platforms, so a reader announces the series
// once through the canvas root rather than reciting anonymous paths and circles.
const HIDDEN_FROM_ASSISTIVE_TECH = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

// Hook-free and computation-free: it receives already-formatted points and takes `colors` as a
// prop, so a test invokes it directly with no renderer. All geometry comes from the pure package.
export function TrendChart(props: TrendChartProps) {
  const { points, colors, width } = props;
  if (points.length === 0) return null;

  const geometry = buildChartGeometry({
    values: points.map((point) => point.value),
    width,
    height: TREND_CHART_HEIGHT,
  });
  const label = trendChartSummary(props);
  const single = points.length === 1;
  const showEveryMarker = points.length <= MAX_POINT_MARKERS;

  return (
    <View className="gap-xs">
      {single ? null : (
        <Text className="text-label font-normal text-foreground-muted">
          {`${extremeLabels(points).minLabel}${EN_DASH}${extremeLabels(points).maxLabel}`}
        </Text>
      )}

      <Svg width={width} height={TREND_CHART_HEIGHT} accessible accessibilityRole="image" accessibilityLabel={label}>
        {/* Chrome marking the chart's floor — explicitly not a zero line; no data is ever drawn on it. */}
        <Line
          x1={0}
          y1={geometry.baselineY}
          x2={width}
          y2={geometry.baselineY}
          stroke={colors.foregroundMuted}
          strokeOpacity={BASELINE_STROKE_OPACITY}
          strokeWidth={1}
          {...HIDDEN_FROM_ASSISTIVE_TECH}
        />
        {geometry.area === '' ? null : (
          <Path d={geometry.area} fill={colors.accent} fillOpacity={AREA_FILL_OPACITY} {...HIDDEN_FROM_ASSISTIVE_TECH} />
        )}
        {geometry.line === '' ? null : (
          <Path
            d={geometry.line}
            stroke={colors.accent}
            strokeWidth={LINE_STROKE_WIDTH}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            {...HIDDEN_FROM_ASSISTIVE_TECH}
          />
        )}
        {geometry.markers.map((marker, index) => {
          const final = index === geometry.markers.length - 1;
          // Above MAX_POINT_MARKERS the circles merge into noise and the line alone carries the
          // shape — but the final point always keeps its marker, because that is where the lifter
          // is now.
          if (!showEveryMarker && !final) return null;
          const radius = single ? SINGLE_POINT_RADIUS : final ? FINAL_MARKER_RADIUS : MARKER_RADIUS;
          return (
            <Circle
              key={points[index].key}
              cx={marker.x}
              cy={marker.y}
              r={radius}
              fill={colors.accent}
              {...HIDDEN_FROM_ASSISTIVE_TECH}
            />
          );
        })}
      </Svg>

      {single ? (
        <Text className="text-body font-normal text-foreground">
          {`${points[0].valueLabel}${MIDDLE_DOT}${points[0].dateLabel}`}
        </Text>
      ) : (
        // Exactly two labels, ever — a dense axis is unreadable at 120px and unreadable again at
        // 200% font scale. flex-wrap so the two stack instead of colliding at maximum font scale.
        <View className="flex-row flex-wrap justify-between">
          <Text className="text-label font-normal text-foreground-muted">{points[0].dateLabel}</Text>
          <Text className="text-label font-normal text-foreground-muted">{points[points.length - 1].dateLabel}</Text>
        </View>
      )}
    </View>
  );
}
