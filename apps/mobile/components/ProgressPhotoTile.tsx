import { Image, Pressable, Text, View } from 'react-native';

// S8 anatomy: a 2-column square grid, 8px inter-tile gap, matching ExerciseImageTile.tsx's
// resolveTileBox precedent — a pure, exported, named-constant sizing function, never a literal at
// a call site (R32). GRID_PADDING mirrors the screen's own contentContainerStyle padding so the
// tile math and the actual layout can never silently diverge.
export const PHOTO_GRID_COLUMNS = 2;
export const PHOTO_TILE_GAP = 8;
export const MIN_PHOTO_TILE_SIZE = 120;
const GRID_PADDING = 24;

// Shared by ProgressPhotoTile and ProgressPhotoPlaceholder (Task 3) so a real tile and a
// device-absent placeholder are always sized identically — R27's "everywhere a photo could
// otherwise render" requirement depends on this being the one function both call.
export function resolvePhotoTileSize(windowWidth: number): number {
  const safeWindowWidth = Number.isFinite(windowWidth) ? windowWidth : 0;
  const usableWidth = safeWindowWidth - 2 * GRID_PADDING - (PHOTO_GRID_COLUMNS - 1) * PHOTO_TILE_GAP;
  return Math.max(MIN_PHOTO_TILE_SIZE, usableWidth / PHOTO_GRID_COLUMNS);
}

export interface ProgressPhotoTileViewProps {
  photoUri: string;
  dateLabel: string;
  size: number;
  onPress: () => void;
}

// Hook-free — direct-invocable by a test, matching RecordRowView/BodyMetricRowView. Full-bleed
// Image with a bottom-edge bg-background/70 caption strip holding only the local_date — no other
// metadata competes with the photo itself (UI-SPEC S8 anatomy).
export function ProgressPhotoTileView({ photoUri, dateLabel, size, onPress }: ProgressPhotoTileViewProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Progress photo, ${dateLabel}`}
      style={{ width: size, height: size }}
      className="overflow-hidden rounded-md bg-surface"
    >
      <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      <View className="absolute bottom-0 left-0 right-0 bg-background/70 px-xs py-xs">
        <Text className="text-label font-normal text-foreground-muted">{dateLabel}</Text>
      </View>
    </Pressable>
  );
}

export interface ProgressPhotoTileProps extends ProgressPhotoTileViewProps {}

export function ProgressPhotoTile(props: ProgressPhotoTileProps) {
  return <ProgressPhotoTileView {...props} />;
}
