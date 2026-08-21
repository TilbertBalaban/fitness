import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { computeDropTarget, neighboursForIndex } from '@/lib/programs/reorder-drag';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

// D-23: an always-visible grip, never hidden behind a long press or an edit mode. The parent
// (ExerciseSlotRow) decides whether this component renders at all — the exercise-count >= 2
// visibility rule (04-UI-SPEC.md's D-23 amendment) is computed once by the day page and never
// duplicated here.

export interface DragHandleViewProps {
  exerciseName: string;
  colors: ThemeColors;
}

// Hook-free — direct-invocable by a test. The grip glyph, the accessibility props and the 48x48
// hit target; carries no gesture of its own so a test can assert its shape without a gesture root.
export function DragHandleView({ exerciseName, colors }: DragHandleViewProps) {
  return (
    <View
      accessibilityRole="button"
      accessibilityLabel={`Reorder ${exerciseName}`}
      style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name="reorder-three-outline" size={20} color={colors.foregroundMuted} />
    </View>
  );
}

export interface DragHandleProps {
  exerciseName: string;
  exerciseId: string;
  fromIndex: number;
  orderedIds: string[];
  onReorder: (beforeId: string | null, afterId: string | null) => void;
}

// Stateful wrapper — owns the pan gesture and the shared-value translation that gives the grip
// pointer-following visual feedback while dragging. The pan activates on movement alone, with no
// long-press delay gate (D-23: the handle is always active, not hidden behind a long press).
// activeOffsetY/failOffsetX direction-lock the pan to the vertical axis: a touch that moves
// horizontally past the threshold before activating fails
// this gesture and is released to the day deck's own horizontal page swipe underneath, so the two
// gestures never fight over the same touch. On gesture end, the JS-thread callback computes the
// drop target and its neighbour ids from the pure helpers in reorder-drag.ts and hands them to the
// caller — this component never reads or writes order_index itself.
export function DragHandle({ exerciseName, exerciseId, fromIndex, orderedIds, onReorder }: DragHandleProps) {
  const colors = useThemeColors();
  const translationY = useSharedValue(0);

  const commitDrop = useCallback(
    (rawTranslationY: number) => {
      const { toIndex } = computeDropTarget({ fromIndex, translationY: rawTranslationY, count: orderedIds.length });
      const { beforeId, afterId } = neighboursForIndex(orderedIds, exerciseId, toIndex);
      onReorder(beforeId, afterId);
    },
    [fromIndex, orderedIds, exerciseId, onReorder],
  );

  const panGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .failOffsetX([-10, 10])
    .onUpdate((event) => {
      translationY.value = event.translationY;
    })
    .onEnd((event) => {
      const dropTranslation = event.translationY;
      translationY.value = withSpring(0);
      runOnJS(commitDrop)(dropTranslation);
    })
    .onFinalize(() => {
      translationY.value = withSpring(0);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translationY.value }],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={animatedStyle}>
        <DragHandleView exerciseName={exerciseName} colors={colors} />
      </Animated.View>
    </GestureDetector>
  );
}
