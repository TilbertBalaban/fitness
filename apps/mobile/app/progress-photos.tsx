import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { NavBackButton } from '@/components/NavBackButton';
import { PhotoCaptureConfirmSheet } from '@/components/PhotoCaptureConfirmSheet';
import { ProgressPhotoPlaceholder } from '@/components/ProgressPhotoPlaceholder';
import { PHOTO_GRID_COLUMNS, PHOTO_TILE_GAP, ProgressPhotoTile, resolvePhotoTileSize } from '@/components/ProgressPhotoTile';
import { PrimaryButton } from '@/components/PrimaryButton';
import { formatChartDateLabel } from '@/lib/analytics/chart-labels';
import { authClient } from '@/lib/auth-client';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import {
  canBuildComposite,
  derivePhotoGalleryState,
  loadProgressPhotos,
  resolveGalleryCells,
  type GalleryCell,
  type PhotoGalleryState,
  type ProgressPhotoRow,
} from '@/lib/db/progress-photos';
import { capturePhoto } from '@/lib/photos/capture';
import { downscalePhoto } from '@/lib/photos/downscale';
import { getPhotoUri, hasPhotoBytes } from '@/lib/photos/photo-store';

// R6 — the shipped three-row skeleton every local-SQLite-backed list in this app uses on first
// paint, matching RecordsScreenView/BodyMetricsScreenView's own constant.
const SKELETON_ROW_COUNT = 3;

// URL.revokeObjectURL does not exist on native's URL polyfill — this is a capability guard, not a
// Platform.OS branch (docs/platform-modules.md's one documented exception is authClient, but a
// benign "call it if it exists" cleanup guard carries no behavioural divergence to hide).
function revokeObjectUri(uri: string): void {
  const revoke = (URL as unknown as { revokeObjectURL?: (u: string) => void }).revokeObjectURL;
  if (typeof revoke === 'function') revoke(uri);
}

// A plain function, called rather than rendered as a JSX tag — records.tsx's renderStateBlock
// precedent, so a direct-invocation test can see inside the block.
function renderStateBlock(heading: string, body: string) {
  return (
    <View className="gap-xs px-lg pt-lg">
      <Text className="text-heading font-semibold text-foreground">{heading}</Text>
      <Text className="text-body font-normal text-foreground-muted">{body}</Text>
    </View>
  );
}

export interface ProgressPhotoCell {
  row: ProgressPhotoRow;
  present: boolean;
  photoUri: string | null;
}

export interface ProgressPhotosScreenViewProps {
  state: PhotoGalleryState;
  cells: ProgressPhotoCell[];
  tileSize: number;
  // The "Create Before & After" gate (S8 zero-one-many) — absent, not disabled, below two
  // on-device photos.
  canComposite: boolean;
  onAddPhoto: () => void;
  onCompositePress: () => void;
  onTilePress: (row: ProgressPhotoRow) => void;
}

// Hook-free so a test and the durability harness can render it directly, matching
// RecordsScreenView/BodyMetricsScreenView's split. Present tiles and device-absent placeholders
// interleave in `cells`' own order (S8 partial, design decision 11) — this view never re-sorts or
// re-groups them.
export function ProgressPhotosScreenView({
  state,
  cells,
  tileSize,
  canComposite,
  onAddPhoto,
  onCompositePress,
  onTilePress,
}: ProgressPhotosScreenViewProps) {
  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between px-lg pt-md">
        <View className="flex-row items-center">
          <NavBackButton fallbackHref="/(tabs)/profile" />
          <Text className="ml-sm text-heading font-semibold text-foreground">Progress Photos</Text>
        </View>
        <Pressable
          onPress={onAddPhoto}
          accessibilityRole="button"
          accessibilityLabel="Add Photo"
          style={{ minHeight: 48, justifyContent: 'center' }}
        >
          <Text className="text-body font-normal text-accent">Add Photo</Text>
        </Pressable>
      </View>

      {canComposite ? (
        <View className="px-lg pt-sm">
          <PrimaryButton label="Create Before & After" onPress={onCompositePress} />
        </View>
      ) : null}

      {/* R6: a local SQLite read never shows a spinner — the shipped skeleton, widened to a grid. */}
      {state === 'loading' ? (
        <View className="flex-row flex-wrap gap-sm px-lg pt-lg">
          {Array.from({ length: PHOTO_GRID_COLUMNS * SKELETON_ROW_COUNT }).map((_, index) => (
            <View key={index} className="rounded-md bg-surface" style={{ width: tileSize, height: tileSize }} />
          ))}
        </View>
      ) : null}

      {state === 'error'
        ? renderStateBlock("Progress Photos couldn't load", 'Restart the app to try again. Your programs and history are safe.')
        : null}

      {state === 'empty' ? renderStateBlock('No progress photos yet', 'Add your first photo to start tracking.') : null}

      <FlashList
        data={state === 'ready' ? cells : []}
        numColumns={PHOTO_GRID_COLUMNS}
        keyExtractor={(cell) => cell.row.id}
        contentContainerStyle={{ padding: 24 }}
        renderItem={({ item }) => (
          <View style={{ margin: PHOTO_TILE_GAP / 2 }}>
            {item.present && item.photoUri ? (
              <ProgressPhotoTile
                photoUri={item.photoUri}
                dateLabel={formatChartDateLabel(item.row.localDate)}
                size={tileSize}
                onPress={() => onTilePress(item.row)}
              />
            ) : (
              <ProgressPhotoPlaceholder dateLabel={formatChartDateLabel(item.row.localDate)} size={tileSize} />
            )}
          </View>
        )}
      />
    </View>
  );
}

export interface ProgressPhotosScreenProps {
  // The durability harness's seam, matching every other route in this app: mounts this exact route
  // against a caller-chosen db/userId instead of the production singleton.
  userId?: string;
  db?: WriteDb;
}

export default function ProgressPhotosScreen({ userId: userIdOverride, db }: ProgressPhotosScreenProps = {}) {
  const router = useRouter();
  const session = authClient.useSession();
  const userId = userIdOverride ?? session.data?.user?.id ?? null;
  const { width: windowWidth } = useWindowDimensions();

  const [rows, setRows] = useState<ProgressPhotoRow[] | null>(null);
  const [presenceByKey, setPresenceByKey] = useState<Map<string, boolean>>(new Map());
  const [photoUris, setPhotoUris] = useState<Map<string, string>>(new Map());
  const [failed, setFailed] = useState(false);
  const [pendingCapture, setPendingCapture] = useState<{ photoUri: string; bytes: Uint8Array } | null>(null);
  const objectUrisRef = useRef<string[]>([]);

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      const database = db ?? getPowerSync();
      const loadedRows = await loadProgressPhotos(userId, database);
      const distinctKeys = [...new Set(loadedRows.map((row) => row.storageKey))];

      // ONE batched hasPhotoBytes pass per distinct storage_key (never once per cell) — the R27
      // predicate the whole placeholder branch hangs on. getPhotoUri only runs for a key already
      // known present, so an absent key never pays for a second, pointless store lookup.
      const presence = new Map<string, boolean>();
      const uris = new Map<string, string>();
      const created: string[] = [];
      await Promise.all(
        distinctKeys.map(async (key) => {
          const present = await hasPhotoBytes(key);
          presence.set(key, present);
          if (present) {
            const uri = await getPhotoUri(key);
            if (uri) {
              uris.set(key, uri);
              created.push(uri);
            }
          }
        }),
      );

      for (const uri of objectUrisRef.current) revokeObjectUri(uri);
      objectUrisRef.current = created;

      setRows(loadedRows);
      setPresenceByKey(presence);
      setPhotoUris(uris);
      setFailed(false);
    } catch (error) {
      console.error('progress photos load failed', error);
      setFailed(true);
    }
  }, [userId, db]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => {
    return () => {
      for (const uri of objectUrisRef.current) revokeObjectUri(uri);
    };
  }, []);

  const handleAddPhoto = async () => {
    const captured = await capturePhoto();
    if (!captured) return;
    const downscaled = await downscalePhoto(captured);
    setPendingCapture({ photoUri: downscaled.uri, bytes: downscaled.bytes });
  };

  const baseCells: GalleryCell[] = rows !== null ? resolveGalleryCells(rows, presenceByKey) : [];
  const cells: ProgressPhotoCell[] = baseCells.map((cell) => ({
    row: cell.row,
    present: cell.present,
    photoUri: photoUris.get(cell.row.storageKey) ?? null,
  }));
  const state = derivePhotoGalleryState({ failed, cells: rows === null ? null : baseCells });
  const canComposite = canBuildComposite(baseCells);
  const tileSize = resolvePhotoTileSize(windowWidth);

  return (
    <>
      <ProgressPhotosScreenView
        state={state}
        cells={cells}
        tileSize={tileSize}
        canComposite={canComposite}
        onAddPhoto={() => void handleAddPhoto()}
        onCompositePress={() => router.push('/photo-composite')}
        // Task 4 wires this to ProgressPhotoActionSheet — a no-op until then.
        onTilePress={() => {}}
      />

      {pendingCapture && userId ? (
        <PhotoCaptureConfirmSheet
          userId={userId}
          photoUri={pendingCapture.photoUri}
          bytes={pendingCapture.bytes}
          db={db}
          onSaved={() => {
            revokeObjectUri(pendingCapture.photoUri);
            setPendingCapture(null);
            void reload();
          }}
          onDiscard={() => {
            revokeObjectUri(pendingCapture.photoUri);
            setPendingCapture(null);
          }}
        />
      ) : null}
    </>
  );
}
