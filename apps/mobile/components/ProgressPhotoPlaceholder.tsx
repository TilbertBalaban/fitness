import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

export interface ProgressPhotoPlaceholderViewProps {
  dateLabel: string;
  size: number;
  colors: ThemeColors;
  // Present (gallery context) — the tile is an ordinary tappable button opening the info sheet.
  // Absent (composite-picker context, R28) — no press handler, accessibilityState marks it
  // disabled. The two modes are the whole of this component's press contract (E11 non-selectability).
  onPress?: () => void;
}

// Hook-free — direct-invocable by a test, matching ProgressPhotoTileView's split. Same square
// footprint as a real tile via resolvePhotoTileSize (R27's "everywhere a photo could otherwise
// render" requirement depends on both callers passing the same size), same local_date caption
// strip a real tile carries — the date is metadata that DID sync; only the bytes did not.
export function ProgressPhotoPlaceholderView({ dateLabel, size, colors, onPress }: ProgressPhotoPlaceholderViewProps) {
  const disabled = onPress === undefined;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Progress photo, ${dateLabel}, not on this device`}
      accessibilityState={disabled ? { disabled: true } : undefined}
      style={{ width: size, height: size }}
      className="items-center justify-center gap-xs overflow-hidden rounded-md bg-surface p-sm"
    >
      <Ionicons name="cloud-offline-outline" size={24} color={colors.foregroundMuted} />
      <Text className="text-label font-normal text-foreground-muted">On your other device</Text>
      <View className="absolute bottom-0 left-0 right-0 bg-background/70 px-xs py-xs">
        <Text className="text-label font-normal text-foreground-muted">{dateLabel}</Text>
      </View>
    </Pressable>
  );
}

export interface PhotoNotOnDeviceSheetProps {
  onClose: () => void;
}

// A small info-only modal, the same <Modal transparent animationType="fade" onRequestClose>
// shell MuscleDrilldownSheet/RenameSessionDialog already use — heading, body, one Close control,
// nothing else (E11's whole content).
export function PhotoNotOnDeviceSheet({ onClose }: PhotoNotOnDeviceSheetProps) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-background/80 px-lg">
        <View className="w-full rounded-md bg-surface p-lg" style={{ maxWidth: 400 }}>
          <Text className="text-heading font-semibold text-foreground">Not on this device</Text>
          {/* The copy is fixed and short, but no line clamp is imposed on it regardless (R4). */}
          <Text className="mt-sm text-body font-normal text-foreground-muted">
            This photo was taken on another device. Its bytes haven&apos;t synced here.
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="mt-lg items-center justify-center self-end rounded-md px-md py-sm"
            style={{ minHeight: 48 }}
          >
            <Text className="text-body font-normal text-foreground-muted">Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export interface ProgressPhotoPlaceholderProps {
  dateLabel: string;
  size: number;
}

// The gallery-context wrapper — owns the info-sheet open state itself, matching
// MuscleMapScreen's own drilldown-sheet seam. The composite picker (12-06) renders
// ProgressPhotoPlaceholderView directly with no onPress instead of this wrapper, since it needs
// the disabled mode this component never produces.
export function ProgressPhotoPlaceholder({ dateLabel, size }: ProgressPhotoPlaceholderProps) {
  const colors = useThemeColors();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <ProgressPhotoPlaceholderView dateLabel={dateLabel} size={size} colors={colors} onPress={() => setSheetOpen(true)} />
      {sheetOpen ? <PhotoNotOnDeviceSheet onClose={() => setSheetOpen(false)} /> : null}
    </>
  );
}
