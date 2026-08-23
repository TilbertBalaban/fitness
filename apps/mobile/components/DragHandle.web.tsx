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

// The DOM only dispatches pointer events to the element the pointer is currently over. A reorder
// drag leaves the 48x48 handle after roughly a third of one row, so without a capture the handle
// stops receiving pointermove and never receives pointerup at all: the drop is never committed and
// translationY is left at its last observed value, freezing the grip visually off-centre.
//
// Typed structurally rather than as Element so this stays testable and so react-native-web's View
// ref — which is the DOM node on web and a native shadow node elsewhere — can be passed without a
// platform check.
export interface PointerCaptureTarget {
  setPointerCapture?: (pointerId: number) => void;
  releasePointerCapture?: (pointerId: number) => void;
  hasPointerCapture?: (pointerId: number) => boolean;
}

export function capturePointer(node: PointerCaptureTarget | null | undefined, pointerId: number): void {
  node?.setPointerCapture?.(pointerId);
}

// releasePointerCapture throws NotFoundError when the id names no captured pointer, and the browser
// releases implicitly on pointercancel — so the capture is confirmed first where the engine reports
// it, and the call is guarded where it does not.
export function releasePointer(node: PointerCaptureTarget | null | undefined, pointerId: number): void {
  if (!node?.releasePointerCapture) return;
  if (node.hasPointerCapture && !node.hasPointerCapture(pointerId)) return;
  try {
    node.releasePointerCapture(pointerId);
  } catch {
    // Already revoked by the browser; there is nothing left to release.
  }
}

// Pointer-events-based drag: onPointerDown records the starting Y, records the pointer id and
// captures that pointer to this element, onPointerMove accumulates translationY while that pointer
// is active, onPointerUp/onPointerCancel releases the capture and commits through the identical
// pure helpers reorder-drag.ts exports — the same computeDropTarget/neighboursForIndex pair
// DragHandle.tsx uses, so native and web can never compute a different drop target for the same
// gesture shape.
export function DragHandle({ exerciseName, exerciseId, fromIndex, orderedIds, onReorder }: DragHandleProps) {
  const colors = useThemeColors();
  const startY = useRef<number | null>(null);
  const activePointerId = useRef<number | null>(null);
  const handleRef = useRef<View | null>(null);
  const [translationY, setTranslationY] = useState(0);

  const commitDrop = useCallback(
    (rawTranslationY: number) => {
      const { toIndex } = computeDropTarget({ fromIndex, translationY: rawTranslationY, count: orderedIds.length });
      const { beforeId, afterId } = neighboursForIndex(orderedIds, exerciseId, toIndex);
      onReorder(beforeId, afterId);
    },
    [fromIndex, orderedIds, exerciseId, onReorder],
  );

  // Also the cancel path: the browser revoking the capture (scroll takeover, element removed) must
  // leave no half-drag behind, so releasing and resetting are the same call.
  const endDrag = useCallback(() => {
    const pointerId = activePointerId.current;
    if (pointerId !== null) {
      releasePointer(handleRef.current as PointerCaptureTarget | null, pointerId);
    }
    activePointerId.current = null;
    startY.current = null;
    setTranslationY(0);
  }, []);

  const handlePointerDown = useCallback((event: PointerEvent) => {
    const { pointerId, clientY } = event.nativeEvent;
    activePointerId.current = pointerId;
    startY.current = clientY;
    capturePointer(handleRef.current as PointerCaptureTarget | null, pointerId);
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
      ref={handleRef}
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
