import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import type { WeeklyProgressResult, WeeklyTrack, WeeklyTrackId } from '@fitness/analytics-engine';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

export const PROGRESS_TRACK_HEIGHT = 8;

// Not a touch target — this card has none. The floor exists so the three tracks read as an
// evenly-weighted set rather than three rows of whatever height their own copy happens to need.
const TRACK_BLOCK_MIN_HEIGHT = 48;
const GLYPH_SIZE = 16;

// Keyed by the pure result's own union, so a fourth track added to the package is a compile error
// here rather than a track that silently renders without a label.
const TRACK_LABELS: Record<WeeklyTrackId, string> = {
  sets: 'Sets',
  exercises: 'Exercises',
  muscles: 'Muscles trained',
};

const HEADING = 'Last 7 Days';
const SUBHEADING = 'Rolling window ending today.';
const NO_TARGET_CAPTION = 'No target set.';
const EMPTY_HEADING = 'Nothing logged in the last 7 days';
const EMPTY_BODY = 'Log a workout and your progress appears here.';

// A program prescribing zero on a track is a real prescription of nothing, not an absent one — an
// absent target arrives as null and never reaches here. Dividing by it would produce Infinity or
// NaN and paint a bar for both, so the two cases are answered explicitly.
function fillFraction(achieved: number, target: number): number {
  if (target <= 0) return achieved > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, achieved / target));
}

// A plain function, called rather than rendered as a <Track /> element: a component element stays
// an opaque, unexpanded node to the direct-invocation test walker this workspace uses, which is
// the same trap WorkoutSummary.tsx's renderPrBadges was written around.
function renderTrack(track: WeeklyTrack, colors: ThemeColors) {
  const label = TRACK_LABELS[track.id];

  if (track.target === null) {
    return (
      <View
        key={track.id}
        className="gap-xs"
        style={{ minHeight: TRACK_BLOCK_MIN_HEIGHT }}
        accessibilityRole="text"
        accessibilityLabel={`${label}: ${track.achieved}, no target set`}
      >
        <View className="flex-row flex-wrap items-center justify-between">
          <Text className="text-label font-normal text-foreground-muted">{label}</Text>
          <Text className="text-body font-semibold text-foreground">{`${track.achieved}`}</Text>
        </View>
        <Text className="text-label font-normal text-foreground-muted">{NO_TARGET_CAPTION}</Text>
      </View>
    );
  }

  return (
    <View
      key={track.id}
      className="gap-xs"
      style={{ minHeight: TRACK_BLOCK_MIN_HEIGHT }}
      accessibilityRole="progressbar"
      // aria-* rather than accessibilityValue: react-native-web 0.21 dropped the legacy prop, so
      // accessibilityValue renders role and label but no aria-valuemin/max/now at all, leaving the
      // track a silent rectangle to a screen reader on web. React Native has accepted the aria-*
      // spelling since 0.71, so one set of props is correct on both targets.
      aria-valuemin={0}
      aria-valuemax={track.target}
      aria-valuenow={track.achieved}
      accessibilityLabel={`${label}: ${track.achieved} of ${track.target}`}
    >
      <View className="flex-row flex-wrap items-center justify-between">
        <Text className="text-label font-normal text-foreground-muted">{label}</Text>
        <View className="flex-row items-center gap-xs">
          <Text className="text-body font-semibold text-foreground">{`${track.achieved} / ${track.target}`}</Text>
          {track.achieved >= track.target ? (
            // A met target changes the glyph, never the hue: there is no free colour for "done"
            // and inventing one would break the palette's 60/30/10 balance. The colour is a
            // resolved theme value passed as a prop — an icon never takes a NativeWind class.
            <Ionicons name="checkmark" size={GLYPH_SIZE} color={colors.foregroundMuted} />
          ) : null}
        </View>
      </View>
      {/* Two nested plain views, not SVG: a rectangle is not the one shape a View cannot draw, and
          widening that dependency's blast radius for it would buy nothing. Neither view grows with
          OS font scale — the numeral beside them does. */}
      <View className="rounded-full bg-foreground-muted/20" style={{ height: PROGRESS_TRACK_HEIGHT }}>
        <View
          className="rounded-full bg-accent"
          style={{ height: PROGRESS_TRACK_HEIGHT, width: `${fillFraction(track.achieved, track.target) * 100}%` }}
        />
      </View>
    </View>
  );
}

export interface WeeklyProgressCardViewProps {
  progress: WeeklyProgressResult;
  colors: ThemeColors;
}

// The Last 7 Days card (ANLY-08). Read-only: no press target and no navigation, because
// muscle-group drill-down is explicitly Phase 10 and a card that looks tappable but is not is
// worse than one that plainly is not.
//
// The card is all-or-nothing by construction: all three tracks derive from one session
// population, so a single logged set makes every one of them non-zero and there is no
// partially-empty case to design for. That is why the empty branch replaces the whole track block
// rather than each track carrying an empty state of its own (D-09).
export function WeeklyProgressCardView({ progress, colors }: WeeklyProgressCardViewProps) {
  return (
    <View className="gap-md rounded-md bg-surface p-md">
      <View className="gap-xs">
        <Text className="text-body font-semibold text-foreground">{HEADING}</Text>
        <Text className="text-label font-normal text-foreground-muted">{SUBHEADING}</Text>
      </View>

      {progress.hasActivity ? (
        // Rendered in the order received; the fixed order is the pure result's, not this file's.
        <View className="gap-md">{progress.tracks.map((track) => renderTrack(track, colors))}</View>
      ) : (
        <View className="gap-sm">
          <Text className="text-heading font-semibold text-foreground">{EMPTY_HEADING}</Text>
          <Text className="text-body font-normal text-foreground-muted">{EMPTY_BODY}</Text>
        </View>
      )}
    </View>
  );
}

export function WeeklyProgressCard({ progress }: { progress: WeeklyProgressResult }) {
  const colors = useThemeColors();
  return <WeeklyProgressCardView progress={progress} colors={colors} />;
}
