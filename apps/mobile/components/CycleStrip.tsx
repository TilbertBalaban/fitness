import Ionicons from '@expo/vector-icons/Ionicons';
import type { CycleKind } from '@fitness/api-contracts';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

export interface CycleStripCycle {
  id: string;
  name: string;
  kind: CycleKind;
  durationDays: number | null;
}

// The label is always the user's own name — the kind is carried by the tone, never by rewriting
// the text. Time off is the one exception: "how long am I off" is the fact that chip exists to
// communicate, so its length rides along in the label.
export function cycleChipLabel({ name, kind, durationDays }: CycleStripCycle): string {
  if (kind === 'time_off' && durationDays !== null) return `${name} · ${durationDays}d`;
  return name;
}

const KIND_ANNOUNCEMENT: Record<CycleKind, string> = {
  training: 'training cycle',
  deload: 'deload cycle',
  time_off: 'time off',
};

export function cycleChipAccessibilityLabel(cycle: CycleStripCycle): string {
  return `${cycleChipLabel(cycle)}, ${KIND_ANNOUNCEMENT[cycle.kind]}`;
}

export type CycleChipIcon = 'trending-down-outline' | 'moon-outline';

export interface CycleChipTone {
  icon: CycleChipIcon | null;
  borderStyle: 'solid' | 'dashed';
  selectionIndicator: 'accent-border' | 'muted-underline';
  opacity: number;
}

// 04-UI-SPEC.md's Cycle Strip table. Kind and selection are orthogonal visual dimensions and no
// second hex is introduced: kind is drawn with an icon, a border style and opacity; selection is
// drawn with the accent. Time off is the one kind that never takes the accent — accent is reserved
// for "trainable content ahead", which time off explicitly is not — so it shows selection with a
// muted underline instead. The three tones must stay mutually distinct; collapsing any two of them
// is what makes a block's shape unreadable at a glance (D-12).
const TONES: Record<CycleKind, CycleChipTone> = {
  training: { icon: null, borderStyle: 'solid', selectionIndicator: 'accent-border', opacity: 1 },
  deload: { icon: 'trending-down-outline', borderStyle: 'dashed', selectionIndicator: 'accent-border', opacity: 1 },
  time_off: { icon: 'moon-outline', borderStyle: 'solid', selectionIndicator: 'muted-underline', opacity: 0.6 },
};

export function cycleChipTone(kind: CycleKind): CycleChipTone {
  return TONES[kind];
}

export interface CycleStripViewProps {
  cycles: CycleStripCycle[];
  selectedCycleId: string | null;
  colors: ThemeColors;
  onSelectCycle: (cycleId: string) => void;
  onAddCycle: () => void;
  onEditCycle: (cycleId: string) => void;
}

// Hook-free — direct-invocable by a test, matching the ExerciseSlotRowView/DayDeckView split. Owns
// no database call and performs no write: selecting a cycle is view state, and a selection that
// mutated rows would rewrite the program by browsing it.
export function CycleStripView({
  cycles,
  selectedCycleId,
  colors,
  onSelectCycle,
  onAddCycle,
  onEditCycle,
}: CycleStripViewProps) {
  // Absent, not empty — the same rule FilterChipRow applies to a facet with no values. A
  // non-periodized program never needs cycles at all, and an empty chip row would imply otherwise.
  if (cycles.length === 0) return null;

  const selectedCycle = cycles.find((cycle) => cycle.id === selectedCycleId) ?? null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ alignItems: 'center', gap: 8, paddingVertical: 4 }}
    >
      {cycles.map((cycle) => {
        const selected = cycle.id === selectedCycleId;
        const tone = cycleChipTone(cycle.kind);
        const drawsAccent = selected && tone.selectionIndicator === 'accent-border';

        return (
          <Pressable
            key={cycle.id}
            onPress={() => onSelectCycle(cycle.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={cycleChipAccessibilityLabel(cycle)}
            className={`items-center justify-center rounded-md border bg-surface px-md py-sm ${
              drawsAccent ? 'border-accent' : 'border-foreground-muted'
            }`}
            style={{ minWidth: 48, minHeight: 48, borderStyle: tone.borderStyle, opacity: tone.opacity }}
          >
            <View className="flex-row items-center gap-xs">
              {tone.icon ? (
                <Ionicons name={tone.icon} size={16} color={drawsAccent ? colors.accent : colors.foregroundMuted} />
              ) : null}
              <Text className={`text-label font-normal ${drawsAccent ? 'text-accent' : 'text-foreground-muted'}`}>
                {cycleChipLabel(cycle)}
              </Text>
            </View>
            {selected && tone.selectionIndicator === 'muted-underline' ? (
              <View className="mt-xs self-stretch bg-foreground-muted" style={{ height: 2 }} />
            ) : null}
          </Pressable>
        );
      })}

      {selectedCycle ? (
        <Pressable
          onPress={() => onEditCycle(selectedCycle.id)}
          accessibilityRole="button"
          accessibilityLabel="Edit Cycle"
          className="items-center justify-center px-md"
          style={{ minWidth: 48, minHeight: 48 }}
        >
          <Text className="text-label font-normal text-accent">Edit Cycle</Text>
        </Pressable>
      ) : null}

      <Pressable
        onPress={onAddCycle}
        accessibilityRole="button"
        accessibilityLabel="Add Cycle"
        className="items-center justify-center px-md"
        style={{ minWidth: 48, minHeight: 48 }}
      >
        <Text className="text-label font-normal text-accent">Add Cycle</Text>
      </Pressable>
    </ScrollView>
  );
}

export interface CycleStripProps {
  cycles: CycleStripCycle[];
  selectedCycleId: string | null;
  onSelectCycle: (cycleId: string) => void;
  onAddCycle: () => void;
  onEditCycle: (cycleId: string) => void;
}

export function CycleStrip(props: CycleStripProps) {
  const colors = useThemeColors();
  return <CycleStripView {...props} colors={colors} />;
}
