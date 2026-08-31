import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { NavBackButton } from '@/components/NavBackButton';
import { PhotoCaptureConfirmSheet } from '@/components/PhotoCaptureConfirmSheet';
import { PHOTO_GRID_COLUMNS, ProgressPhotoTile, resolvePhotoTileSize } from '@/components/ProgressPhotoTile';
import { formatChartDateLabel } from '@/lib/analytics/chart-labels';
import { authClient } from '@/lib/auth-client';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { loadProgressPhotos, type ProgressPhotoRow } from '@/lib/db/progress-photos';
import { capturePhoto } from '@/lib/photos/capture';
import { downscalePhoto } from '@/lib/photos/downscale';
import { getPhotoUri } from '@/lib/photos/photo-store';

// URL.revokeObjectURL does not exist on native's URL polyfill — this is a capability guard, not a
// Platform.OS branch (docs/platform-modules.md's one documented exception is authClient, but a
// benign "call it if it exists" cleanup guard carries no behavioural divergence to hide).
function revokeObjectUri(uri: string): void {
  const revoke = (URL as unknown as { revokeObjectURL?: (u: string) => void }).revokeObjectURL;
  if (typeof revoke === 'function') revoke(uri);
}

export interface ProgressPhotoCell {
  row: ProgressPhotoRow;
  photoUri: string | null;
}

export interface ProgressPhotosScreenProps {
  // The durability harness's seam, matching every other route in this app: mounts this exact route
  // against a caller-chosen db/userId instead of the production singleton.
  userId?: string;
  db?: WriteDb;
}

export default function ProgressPhotosScreen({ userId: userIdOverride, db }: ProgressPhotosScreenProps = {}) {
  const session = authClient.useSession();
  const userId = userIdOverride ?? session.data?.user?.id ?? null;
  const { width: windowWidth } = useWindowDimensions();

  const [rows, setRows] = useState<ProgressPhotoRow[] | null>(null);
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
      const uriEntries = await Promise.all(distinctKeys.map(async (key) => [key, await getPhotoUri(key)] as const));

      for (const uri of objectUrisRef.current) revokeObjectUri(uri);
      const uris = new Map<string, string>();
      const created: string[] = [];
      for (const [key, uri] of uriEntries) {
        if (uri) {
          uris.set(key, uri);
          created.push(uri);
        }
      }
      objectUrisRef.current = created;

      setRows(loadedRows);
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

  const cells: ProgressPhotoCell[] = (rows ?? []).map((row) => ({ row, photoUri: photoUris.get(row.storageKey) ?? null }));
  const tileSize = resolvePhotoTileSize(windowWidth);

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between px-lg pt-md">
        <View className="flex-row items-center">
          <NavBackButton fallbackHref="/(tabs)/profile" />
          <Text className="ml-sm text-heading font-semibold text-foreground">Progress Photos</Text>
        </View>
        <Pressable
          onPress={() => void handleAddPhoto()}
          accessibilityRole="button"
          accessibilityLabel="Add Photo"
          style={{ minHeight: 48, justifyContent: 'center' }}
        >
          <Text className="text-body font-normal text-accent">Add Photo</Text>
        </Pressable>
      </View>

      {failed ? (
        <View className="gap-xs px-lg pt-lg">
          <Text className="text-heading font-semibold text-foreground">Progress Photos couldn&apos;t load</Text>
          <Text className="text-body font-normal text-foreground-muted">
            Restart the app to try again. Your programs and history are safe.
          </Text>
        </View>
      ) : (
        <FlashList
          data={cells}
          numColumns={PHOTO_GRID_COLUMNS}
          keyExtractor={(cell) => cell.row.id}
          contentContainerStyle={{ padding: 24 }}
          renderItem={({ item }) =>
            item.photoUri ? (
              <View style={{ margin: 4 }}>
                <ProgressPhotoTile
                  photoUri={item.photoUri}
                  dateLabel={formatChartDateLabel(item.row.localDate)}
                  size={tileSize}
                  onPress={() => {}}
                />
              </View>
            ) : null
          }
        />
      )}

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
    </View>
  );
}
