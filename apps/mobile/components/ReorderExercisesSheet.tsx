import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import { DragHandle } from './DragHandle';
import type { ExerciseStripExercise } from './ExerciseStrip';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { reorderSessionExercises } from '@/lib/db/session-mutations';
import { SLOT_ROW_HEIGHT } from '@/lib/programs/reorder-drag';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

// Amendment A.3's own inverse of reorder-drag.ts's neighboursForIndex: that function turns
// (orderedIds, movedId, toIndex) into a neighbour pair; a drop only ever hands this sheet the
// neighbour pair back, so reconstructing the new ordered array means removing movedId from the
// current order and reinserting it immediately after beforeId (or at the front when beforeId is
// null — the row it landed above no longer has a "before"). Exported and pure so this arithmetic
// is directly testable without mounting the stateful sheet or its database write.
export function applyReorder(orderedIds: string[], movedId: string, beforeId: string | null): string[] {
  const remaining = orderedIds.filter((id) => id !== movedId);
  const insertAt = beforeId === null ? 0 : remaining.indexOf(beforeId) + 1;
  return [...remaining.slice(0, insertAt), movedId, ...remaining.slice(insertAt)];
}

export interface ReorderExercisesSheetViewProps {
  exercises: ExerciseStripExercise[];
  colors: ThemeColors;
  rowHeight: number;
  onMeasureRow: (height: number) => void;
  onReorder: (movedId: string, beforeId: string | null, afterId: string | null) => void;
  onDone: () => void;
}

// Hook-free — direct-invocable by a test, matching SessionActionSheetView/NoteSheetView. `exercises`
// arrives pre-ordered by the caller (order_index order); this view only renders the order it is
// given, never re-sorts. A drag handle only renders when the list holds two or more exercises (a
// single row has nowhere to go) — mirroring ExerciseSlotRowView's own canReorder rule. There is no
// disabled-row state and no loading/error state of its own (E10/E12 populated) — it opens from
// already-loaded session state.
export function ReorderExercisesSheetView({
  exercises,
  colors,
  rowHeight,
  onMeasureRow,
  onReorder,
  onDone,
}: ReorderExercisesSheetViewProps) {
  const orderedIds = exercises.map((exercise) => exercise.id);

  return (
    <View className="flex-1 items-center justify-center bg-background/80 px-lg">
      <ScrollView
        className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg"
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <Text className="text-heading font-semibold text-foreground">Reorder Exercises</Text>

        {exercises.length === 0 ? (
          <View className="mt-md items-center gap-sm py-lg">
            <Ionicons name="reorder-three-outline" size={20} color={colors.foregroundMuted} />
            <Text className="text-body font-semibold text-foreground">No exercises to reorder</Text>
            <Text className="text-label font-normal text-foreground-muted">
              Add an exercise from the workout screen to get started.
            </Text>
          </View>
        ) : (
          <View className="mt-md gap-xs">
            {exercises.map((exercise, index) => (
              <View
                key={exercise.id}
                onLayout={
                  index === 0 ? (event: LayoutChangeEvent) => onMeasureRow(event.nativeEvent.layout.height) : undefined
                }
                className="flex-row items-center gap-sm rounded-md px-md py-sm"
                style={{ minHeight: 48 }}
              >
                <View className="flex-1 gap-xs">
                  <Text className="text-body font-normal text-foreground">{exercise.name}</Text>
                  <Text className="text-label font-normal text-foreground-muted">
                    {exercise.completedWorkingSets}/{exercise.targetSets}
                  </Text>
                </View>
                {exercises.length >= 2 ? (
                  <DragHandle
                    exerciseName={exercise.name}
                    exerciseId={exercise.id}
                    fromIndex={index}
                    orderedIds={orderedIds}
                    rowHeight={rowHeight}
                    onReorder={(beforeId, afterId) => onReorder(exercise.id, beforeId, afterId)}
                  />
                ) : null}
              </View>
            ))}
          </View>
        )}

        <View className="mt-lg flex-row justify-end">
          <Pressable
            onPress={onDone}
            accessibilityRole="button"
            accessibilityLabel="Done"
            style={{ minWidth: 48, minHeight: 48 }}
            className="items-center justify-center rounded-md bg-accent px-md py-sm"
          >
            <Text className="text-body font-semibold text-white">Done</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

export interface ReorderExercisesSheetProps {
  sessionId: string;
  exercises: ExerciseStripExercise[];
  // Threaded to reorderSessionExercises's own db argument so a drop reaches the same database this
  // page's own reads came from, rather than reorderSessionExercises's default silently resolving
  // getPowerSync() again — the same TargetsSheet/NoteSheet gap 05-12/05-14 found and fixed
  // (WINDOWS #134/#135). Undefined at call sites that have never needed to override it;
  // reorderSessionExercises's own default takes over identically.
  db?: WriteDb;
  onDone: () => void;
}

// Thin stateful wrapper: owns the measured row height (Amendment A.3's font-scale rule, falling
// back to SLOT_ROW_HEIGHT before the first row has laid out) and the local ordered id array, so the
// list re-renders in its new order immediately on drop rather than waiting for onDone's caller to
// reload. Commits through reorderSessionExercises on every drop (not only on Done) so an
// interrupted session never loses a reorder that already happened on screen.
export function ReorderExercisesSheet({ sessionId, exercises, db, onDone }: ReorderExercisesSheetProps) {
  const colors = useThemeColors();
  const [orderedIds, setOrderedIds] = useState<string[]>(() => exercises.map((exercise) => exercise.id));
  const [rowHeight, setRowHeight] = useState(SLOT_ROW_HEIGHT);

  const exercisesById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const orderedExercises = orderedIds
    .map((id) => exercisesById.get(id))
    .filter((exercise): exercise is ExerciseStripExercise => exercise !== undefined);

  const handleReorder = (movedId: string, beforeId: string | null) => {
    const nextOrderedIds = applyReorder(orderedIds, movedId, beforeId);
    setOrderedIds(nextOrderedIds);
    void reorderSessionExercises(sessionId, nextOrderedIds, db ?? getPowerSync());
  };

  return (
    <ReorderExercisesSheetView
      exercises={orderedExercises}
      colors={colors}
      rowHeight={rowHeight}
      onMeasureRow={setRowHeight}
      onReorder={handleReorder}
      onDone={onDone}
    />
  );
}
