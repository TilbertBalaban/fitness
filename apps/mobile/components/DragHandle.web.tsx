import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useRef, useState } from 'react';
import { View, type PointerEvent } from 'react-native';
import { computeDropTarget, neighboursForIndex } from '@/lib/programs/reorder-drag';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

// The web sibling of DragHandle.tsx (docs/platform-modules.md's `.web.tsx` convention — Metro
// resolves this file for the web target, DragHandle.tsx for native, never a Platform.OS branch at
// a call site). react-native-gesture-handler's pan gesture is native-module-backed; this file uses
// plain DOM pointer events instead, per 04-UI-SPEC.md's own sanctioned web escape hatch and
// COVERAGE.md Surface C's documented fallback. DragHandleView's rendering is duplicated here
// (rather than imported from './DragHandle') because Metro's platform-extension resolution would
// resolve a bare './DragHandle' specifier written *inside this file* back to this same
// DragHandle.web.tsx on the web build — a self-import. Both copies are kept visually identical by
// construction: same accessibilityLabel format, same 48x48 hit target, same glyph.

export interface DragHandleViewProps {
  exerciseName: string;
  colors: ThemeColors;
}

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

// Pointer-events-based drag: onPointerDown captures the starting Y and the pointer id, onPointerMove
// accumulates translationY while that pointer is active, onPointerUp/onPointerCancel commits through
// the identical pure helpers reorder-drag.ts exports — the same computeDropTarget/neighboursForIndex
// pair DragHandle.tsx uses, so native and web can never compute a different drop target for the same
// gesture shape.
export function DragHandle({ exerciseName, exerciseId, fromIndex, orderedIds, onReorder }: DragHandleProps) {
  const colors = useThemeColors();
  const startY = useRef<number | null>(null);
  const activePointerId = useRef<number | null>(null);
  const [translationY, setTranslationY] = useState(0);

  const commitDrop = useCallback(
    (rawTranslationY: number) => {
      const { toIndex } = computeDropTarget({ fromIndex, translationY: rawTranslationY, count: orderedIds.length });
      const { beforeId, afterId } = neighboursForIndex(orderedIds, exerciseId, toIndex);
      onReorder(beforeId, afterId);
    },
    [fromIndex, orderedIds, exerciseId, onReorder],
  );

  const endDrag = useCallback(() => {
    activePointerId.current = null;
    startY.current = null;
    setTranslationY(0);
  }, []);

  const handlePointerDown = useCallback((event: PointerEvent) => {
    activePointerId.current = event.nativeEvent.pointerId;
    startY.current = event.nativeEvent.clientY;
  }, []);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    if (activePointerId.current !== event.nativeEvent.pointerId || startY.current === null) return;
    setTranslationY(event.nativeEvent.clientY - startY.current);
  }, []);

  const handlePointerUp = useCallback(
    (event: PointerEvent) => {
      if (activePointerId.current !== event.nativeEvent.pointerId || startY.current === null) return;
      const rawTranslationY = event.nativeEvent.clientY - startY.current;
      commitDrop(rawTranslationY);
      endDrag();
    },
    [commitDrop, endDrag],
  );

  return (
    <View
      style={{ transform: [{ translateY: translationY }] }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={endDrag}
    >
      <DragHandleView exerciseName={exerciseName} colors={colors} />
    </View>
  );
}
