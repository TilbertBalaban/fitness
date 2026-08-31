import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import { WIDGET_KIND_LABELS, WIDGET_KIND_SET, type WidgetKind } from '@fitness/api-contracts';
import { DragHandle } from './DragHandle';
import type { KnownWidget } from './DashboardWidgetHost';
import {
  addWidget,
  loadDashboardWidgets,
  moveWidget,
  removeWidget,
  resolveAvailableWidgetKinds,
  type DashboardWidgetRow,
} from '@/lib/db/dashboard-widgets';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { SLOT_ROW_HEIGHT } from '@/lib/programs/reorder-drag';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

// D-22's own filter-before-map rule, applied here: an unrecognised widget_kind is dropped before
// this sheet ever tries to label it, never rendered as an "unknown widget" row.
export function knownWidgetRows(rows: DashboardWidgetRow[]): { id: string; widgetKind: WidgetKind }[] {
  return rows
    .filter((row) => WIDGET_KIND_SET.has(row.widgetKind))
    .map((row) => ({ id: row.id, widgetKind: row.widgetKind as WidgetKind }));
}

function toPickerRows(widgets: KnownWidget[]): DashboardWidgetRow[] {
  return widgets.map((widget) => ({ id: widget.id, widgetKind: widget.kind, position: widget.position, enabled: true }));
}

export interface DashboardWidgetPickerViewProps {
  widgets: { id: string; widgetKind: WidgetKind }[];
  colors: ThemeColors;
  rowHeight: number;
  onMeasureRow: (height: number) => void;
  onRemove: (widgetKind: WidgetKind) => void;
  onAdd: (widgetKind: WidgetKind) => void;
  onReorder: (widgetId: string, beforeId: string | null, afterId: string | null) => void;
  onDone: () => void;
}

// Hook-free — direct-invocable by a test, matching ReorderExercisesSheetView's own split. Every
// add/remove/reorder commits immediately per row tap or drag (S2 anatomy), so "Done" is purely
// dismissal and there is no separate "Cancel"/discard path.
export function DashboardWidgetPickerView({
  widgets,
  colors,
  rowHeight,
  onMeasureRow,
  onRemove,
  onAdd,
  onReorder,
  onDone,
}: DashboardWidgetPickerViewProps) {
  const orderedIds = widgets.map((widget) => widget.id);
  const availableKinds = resolveAvailableWidgetKinds(widgets.map((widget) => widget.widgetKind));

  return (
    <View className="flex-1 items-center justify-center bg-background/80 px-lg">
      <ScrollView
        className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg"
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <Text className="text-heading font-semibold text-foreground">Edit Dashboard</Text>

        <View className="mt-md gap-xs">
          <Text className="text-body font-semibold text-foreground">Your Widgets</Text>
          {widgets.length === 0 ? (
            <Text className="text-label font-normal text-foreground-muted">No widgets added yet.</Text>
          ) : (
            widgets.map((widget, index) => {
              const name = WIDGET_KIND_LABELS[widget.widgetKind];
              return (
                <View
                  key={widget.id}
                  onLayout={
                    index === 0 ? (event: LayoutChangeEvent) => onMeasureRow(event.nativeEvent.layout.height) : undefined
                  }
                  className="flex-row items-center gap-sm rounded-md px-md py-sm"
                  style={{ minHeight: 48 }}
                >
                  {widgets.length >= 2 ? (
                    <DragHandle
                      exerciseName={name}
                      exerciseId={widget.id}
                      fromIndex={index}
                      orderedIds={orderedIds}
                      rowHeight={rowHeight}
                      onReorder={(beforeId, afterId) => onReorder(widget.id, beforeId, afterId)}
                    />
                  ) : null}
                  <Text className="flex-1 text-body font-normal text-foreground">{name}</Text>
                  <Pressable
                    onPress={() => onRemove(widget.widgetKind)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${name} from dashboard`}
                    style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="remove-circle-outline" size={20} color={colors.foregroundMuted} />
                  </Pressable>
                </View>
              );
            })
          )}
        </View>

        {availableKinds.length > 0 ? (
          <View className="mt-lg gap-xs">
            <Text className="text-body font-semibold text-foreground">Add a Widget</Text>
            {availableKinds.map((widgetKind) => {
              const name = WIDGET_KIND_LABELS[widgetKind];
              return (
                <Pressable
                  key={widgetKind}
                  onPress={() => onAdd(widgetKind)}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${name} to dashboard`}
                  style={{ minHeight: 48 }}
                  className="flex-row items-center gap-sm rounded-md px-md py-sm"
                >
                  <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
                  <Text className="flex-1 text-body font-normal text-foreground">{name}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

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

export interface DashboardWidgetPickerProps {
  userId: string | null;
  db?: WriteDb;
  // Home's own already-disambiguated widget state (null = still resolving, [] = genuinely empty
  // per D-24/D-26's materialize-once contract) — the picker's row list starts from this REACTIVE
  // prop rather than its own independent read. A second, independent read taken at mount can land
  // in the narrow window before Home's own first-focus loadOrMaterializeDashboardWidgets call has
  // committed its default-set insert, and — unlike Home, which is guaranteed to re-render with the
  // post-insert result — a one-shot read has no signal telling it whether an empty result means
  // "genuinely empty" or "materializing right now", so it can only take a single, possibly-stale
  // snapshot with no way to self-correct. Home's own state carries exactly that disambiguation
  // already, for free, so the picker mirrors it instead of duplicating the read.
  widgets: KnownWidget[] | null;
  onDone: () => void;
}

// Thin stateful wrapper — owns the measured row height (matching ReorderExercisesSheet's own
// Amendment A.3 rule) and its own row list, seeded and kept in sync with Home's own `widgets` prop
// until the user's first edit through this sheet, after which the sheet's own post-write reads (via
// the plain, never-materializing loadDashboardWidgets — never loadOrMaterializeDashboardWidgets, see
// that pair's own doc comments) are the newer truth and Home's prop is no longer mirrored.
export function DashboardWidgetPicker({ userId, db, widgets, onDone }: DashboardWidgetPickerProps) {
  const colors = useThemeColors();
  const resolvedDb = db ?? getPowerSync();
  const [rows, setRows] = useState<DashboardWidgetRow[]>(() => toPickerRows(widgets ?? []));
  const [rowHeight, setRowHeight] = useState(SLOT_ROW_HEIGHT);
  const editedRef = useRef(false);

  useEffect(() => {
    if (editedRef.current) return;
    if (widgets === null) return;
    setRows(toPickerRows(widgets));
  }, [widgets]);

  const reload = useCallback(async () => {
    if (!userId) {
      setRows([]);
      return;
    }
    setRows(await loadDashboardWidgets(userId, resolvedDb));
  }, [userId, resolvedDb]);

  const handleRemove = (widgetKind: WidgetKind) => {
    if (!userId) return;
    editedRef.current = true;
    removeWidget({ userId, widgetKind }, resolvedDb)
      .then(reload)
      .catch((error) => console.error('dashboard widget remove failed', error));
  };

  const handleAdd = (widgetKind: WidgetKind) => {
    if (!userId) return;
    editedRef.current = true;
    addWidget({ userId, widgetKind }, resolvedDb)
      .then(reload)
      .catch((error) => console.error('dashboard widget add failed', error));
  };

  const handleReorder = (widgetId: string, beforeId: string | null, afterId: string | null) => {
    if (!userId) return;
    editedRef.current = true;
    moveWidget({ userId, widgetId, beforeId, afterId }, resolvedDb)
      .then(reload)
      .catch((error) => console.error('dashboard widget reorder failed', error));
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onDone}>
      <DashboardWidgetPickerView
        widgets={knownWidgetRows(rows)}
        colors={colors}
        rowHeight={rowHeight}
        onMeasureRow={setRowHeight}
        onRemove={handleRemove}
        onAdd={handleAdd}
        onReorder={handleReorder}
        onDone={onDone}
      />
    </Modal>
  );
}
