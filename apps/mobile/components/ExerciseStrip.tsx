import Ionicons from '@expo/vector-icons/Ionicons';
import { countsTowardWorkingVolume, type SetType } from '@fitness/api-contracts';
import { Pressable, ScrollView, Text } from 'react-native';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

export type ExerciseChipState = 'current' | 'completed' | 'in-progress';

export interface ExerciseChipTone {
  borderStyle: 'solid' | 'dashed';
  borderTone: 'accent' | 'muted';
  fill: 'surface' | 'secondary';
}

// 05-UI-SPEC §Exercise Strip: current always takes the accent border regardless of completion; a
// non-current, fully-done exercise gets the muted/secondary "done" treatment; everything else is
// the plain not-yet-finished chip. The three tones stay mutually distinct — same rule
// CycleStrip.tsx's TONES table follows — collapsing any two is what makes the strip unreadable at
// a glance (D-12).
const CHIP_TONES: Record<ExerciseChipState, ExerciseChipTone> = {
  current: { borderStyle: 'solid', borderTone: 'accent', fill: 'surface' },
  completed: { borderStyle: 'solid', borderTone: 'muted', fill: 'secondary' },
  'in-progress': { borderStyle: 'solid', borderTone: 'muted', fill: 'surface' },
};

export function exerciseChipTone(state: ExerciseChipState): ExerciseChipTone {
  return CHIP_TONES[state];
}

export function exerciseChipState(isCurrent: boolean, completedWorkingSets: number, targetSets: number): ExerciseChipState {
  if (isCurrent) return 'current';
  if (targetSets > 0 && completedWorkingSets >= targetSets) return 'completed';
  return 'in-progress';
}

export type ExerciseChipFraction = { kind: 'fraction'; text: string } | { kind: 'complete' };

// completedWorkingSets/targetSets are both working-set-only counts — warm-up rows never reach this
// function's arguments, the caller excludes them before counting (RESEARCH.md Pitfall 2: set_index
// position never implies set_type, so the exclusion must be explicit, see countCompletedWorkingSets
// below). "4 of 4" is a redundant thing to read once true, so full completion replaces the fraction
// with a checkmark sentinel rather than rendering "4/4".
export function exerciseChipFraction(completedWorkingSets: number, targetSets: number): ExerciseChipFraction {
  if (targetSets > 0 && completedWorkingSets >= targetSets) return { kind: 'complete' };
  return { kind: 'fraction', text: `${completedWorkingSets}/${targetSets}` };
}

export interface ExerciseChipSet {
  setType: string;
  completed: boolean;
  parentSetId: string | null;
}

// D-10: a parent row is one set toward the prescription; children (drop/myorep/partial/per-side
// sub-entries) add volume but never increment the set count, so the strip fraction must exclude
// them the same way shouldAutoAdvance does (auto-advance.ts, D-19) — otherwise a drop set on a
// 4-set prescription reads 4/4 after two real sets. Delegates the warm-up exclusion to the shared
// countsTowardWorkingVolume predicate (D-17/R13) rather than re-deriving it inline — this was the
// fifth, previously-undocumented copy of that rule.
export function countCompletedWorkingSets(sets: ExerciseChipSet[]): number {
  return sets.filter((set) => set.parentSetId === null && countsTowardWorkingVolume(set.setType as SetType) && set.completed)
    .length;
}

export interface ExerciseStripExercise {
  id: string;
  name: string;
  completedWorkingSets: number;
  targetSets: number;
  // D-12/D-13: decorative and informational only — the link glyph it drives is not its own
  // Pressable, and is orthogonal to the chip's completion tone (E5 partial). Optional so every
  // existing caller (WorkoutSummary.tsx's correction rows) renders unchanged (R15).
  supersetGroupId?: string | null;
}

export interface ExerciseStripViewProps {
  exercises: ExerciseStripExercise[];
  currentExerciseId: string | null;
  colors: ThemeColors;
  onSelectExercise: (exerciseId: string) => void;
  onAddExercise: () => void;
}

// Hook-free — direct-invocable by a test, matching CycleStripView/DayDeckView. Chip anatomy and
// scroll behaviour copied verbatim from CycleStrip.tsx: same 48x48 floor, same horizontal-scroll-
// never-wrap rule. Unlike CycleStripView, an empty exercise list still renders the trailing Add
// Exercise chip — a session mid-build with zero exercises left is exactly when adding one matters
// most, so there is no "absent, not empty" early return here.
export function ExerciseStripView({ exercises, currentExerciseId, colors, onSelectExercise, onAddExercise }: ExerciseStripViewProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ alignItems: 'center', gap: 8, paddingVertical: 4 }}
    >
      {exercises.map((exercise) => {
        const isCurrent = exercise.id === currentExerciseId;
        const state = exerciseChipState(isCurrent, exercise.completedWorkingSets, exercise.targetSets);
        const tone = exerciseChipTone(state);
        const fraction = exerciseChipFraction(exercise.completedWorkingSets, exercise.targetSets);
        const drawsAccent = tone.borderTone === 'accent';

        const isPaired = exercise.supersetGroupId != null;

        return (
          <Pressable
            key={exercise.id}
            onPress={() => onSelectExercise(exercise.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: isCurrent }}
            accessibilityLabel={`${exercise.name}, ${fraction.kind === 'complete' ? 'complete' : fraction.text}${
              isPaired ? ', superset' : ''
            }`}
            className={`items-start justify-center rounded-md border px-md py-sm ${
              drawsAccent ? 'border-accent' : 'border-foreground-muted'
            } ${tone.fill === 'secondary' ? 'bg-secondary' : 'bg-surface'}`}
            style={{ minWidth: 48, minHeight: 48, borderStyle: tone.borderStyle, position: 'relative' }}
          >
            <Text className={`text-label font-normal ${drawsAccent ? 'text-accent' : 'text-foreground'}`}>{exercise.name}</Text>
            {fraction.kind === 'complete' ? (
              <Ionicons name="checkmark" size={14} color={colors.foregroundMuted} />
            ) : (
              <Text className="text-label font-normal text-foreground-muted">{fraction.text}</Text>
            )}
            {isPaired ? (
              <Ionicons name="link-outline" size={12} color={colors.foregroundMuted} style={{ position: 'absolute', top: 4, right: 4 }} />
            ) : null}
          </Pressable>
        );
      })}

      <Pressable
        onPress={onAddExercise}
        accessibilityRole="button"
        accessibilityLabel="Add Exercise"
        className="items-center justify-center rounded-md border border-foreground-muted px-md py-sm"
        style={{ minWidth: 48, minHeight: 48, borderStyle: 'dashed' }}
      >
        <Text className="text-label font-normal text-accent">+</Text>
      </Pressable>
    </ScrollView>
  );
}

export interface ExerciseStripProps {
  exercises: ExerciseStripExercise[];
  currentExerciseId: string | null;
  onSelectExercise: (exerciseId: string) => void;
  onAddExercise: () => void;
}

export function ExerciseStrip(props: ExerciseStripProps) {
  const colors = useThemeColors();
  return <ExerciseStripView {...props} colors={colors} />;
}
