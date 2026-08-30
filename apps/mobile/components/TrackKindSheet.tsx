import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { BODY_METRIC_KIND_LABELS, BODY_METRIC_KIND_ORDER, type BodyMetricKind } from '@fitness/api-contracts';

export interface TrackKindSheetViewProps {
  trackedKinds: ReadonlySet<BodyMetricKind>;
  onSelect: (kind: BodyMetricKind) => void;
  onCancel: () => void;
}

// Hook-free, shaped like HistoryActionSheetView — a row-list sheet with a single Cancel escape.
// D-07's whole "no custom kind" rule lives in this one line: the row list is generated from
// BODY_METRIC_KIND_ORDER filtered by what is already tracked, and nothing else.
export function TrackKindSheetView({ trackedKinds, onSelect, onCancel }: TrackKindSheetViewProps) {
  const untracked = BODY_METRIC_KIND_ORDER.filter((kind) => !trackedKinds.has(kind));

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-background/80 px-lg">
        <ScrollView
          className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg"
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <Text className="text-heading font-semibold text-foreground">Track a Measurement</Text>

          {untracked.length === 0 ? (
            <View className="mt-md gap-xs">
              <Text className="text-heading font-semibold text-foreground">{"You're tracking everything"}</Text>
              <Text className="text-body font-normal text-foreground-muted">Every measurement is already on your list.</Text>
            </View>
          ) : (
            <View className="mt-md gap-xs">
              {untracked.map((kind) => (
                <Pressable
                  key={kind}
                  onPress={() => onSelect(kind)}
                  accessibilityRole="button"
                  accessibilityLabel={BODY_METRIC_KIND_LABELS[kind]}
                  style={{ minHeight: 48 }}
                  className="flex-row items-center rounded-md px-md py-sm"
                >
                  <Text className="text-body font-normal text-foreground">{BODY_METRIC_KIND_LABELS[kind]}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <View className="mt-lg flex-row justify-end">
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={{ minWidth: 48, minHeight: 48 }}
              className="items-center justify-center rounded-md px-md py-sm"
            >
              <Text className="text-body text-foreground-muted">Cancel</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export type TrackKindSheetProps = TrackKindSheetViewProps;

export function TrackKindSheet(props: TrackKindSheetProps) {
  return <TrackKindSheetView {...props} />;
}
