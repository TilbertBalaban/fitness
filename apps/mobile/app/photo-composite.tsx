import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { NavBackButton } from '@/components/NavBackButton';
import { ProgressPhotoPlaceholderView } from '@/components/ProgressPhotoPlaceholder';
import { PHOTO_GRID_COLUMNS, PHOTO_TILE_GAP, ProgressPhotoTile, resolvePhotoTileSize } from '@/components/ProgressPhotoTile';
import { PrimaryButton } from '@/components/PrimaryButton';
import { formatChartDateLabel } from '@/lib/analytics/chart-labels';
import { authClient } from '@/lib/auth-client';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { loadProgressPhotos, resolveGalleryCells, type GalleryCell, type ProgressPhotoRow } from '@/lib/db/progress-photos';
import { MAX_COMPOSITE_PHOTOS } from '@/lib/photos/composite-layout';
import { CompositeCaptureView, shareComposite } from '@/lib/photos/composite';
import { getPhotoUri, hasPhotoBytes } from '@/lib/photos/photo-store';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

function revokeObjectUri(uri: string): void {
  const revoke = (URL as unknown as { revokeObjectURL?: (u: string) => void }).revokeObjectURL;
  if (typeof revoke === 'function') revoke(uri);
}

export type CompositeStep = 'choose-before' | 'choose-after' | 'preview';

export interface CompositeSelection {
  before: string | null;
  after: string | null;
}

// `before`/`after` become the step; nothing else stores the step separately, so "Start Over"
// resetting both ids IS resetting the step, with no second place that can drift out of sync.
// "Preview" is reached at exactly MAX_COMPOSITE_PHOTOS chosen — never a literal 2 — matching this
// screen's own MAX_COMPOSITE_PHOTOS-gated grid picker.
export function deriveCompositeStep(selection: CompositeSelection): CompositeStep {
  const chosenCount = [selection.before, selection.after].filter((id): id is string => id !== null).length;
  if (chosenCount === MAX_COMPOSITE_PHOTOS) return 'preview';
  if (chosenCount > 0) return 'choose-after';
  return 'choose-before';
}

// A boolean per cell, same order/index as `cells` — a non-selectable cell keeps its position, it
// is never dropped or regrouped. Device-absent cells are never selectable (R28/D-19); the already-
// chosen Before is excluded once chosenBeforeId is set (a photo cannot be both halves).
export function resolveSelectableCells(cells: GalleryCell[], chosenBeforeId: string | null): boolean[] {
  return cells.map((cell) => cell.present && cell.row.id !== chosenBeforeId);
}

export type CompositeScreenState = 'not-enough-photos' | 'ready';

// Below MAX_COMPOSITE_PHOTOS device-resident photos, this screen is only reachable through a stale
// deep link (S8's own Create Before & After control already gates normal entry) — it still needs
// an explicable landing rather than a broken grid.
export function deriveCompositeScreenState(cells: GalleryCell[]): CompositeScreenState {
  const presentCount = cells.filter((cell) => cell.present).length;
  return presentCount < MAX_COMPOSITE_PHOTOS ? 'not-enough-photos' : 'ready';
}

export function compositeStepLabel(step: CompositeStep): string {
  if (step === 'choose-before') return 'Step 1 of 2: Choose Before';
  if (step === 'choose-after') return 'Step 2 of 2: Choose After';
  return 'Preview';
}

export interface CompositePhotoCell {
  row: ProgressPhotoRow;
  present: boolean;
  photoUri: string | null;
}

export interface PhotoCompositeScreenViewProps {
  state: CompositeScreenState;
  step: CompositeStep;
  cells: CompositePhotoCell[];
  selectable: boolean[];
  beforeId: string | null;
  afterId: string | null;
  tileSize: number;
  colors: ThemeColors;
  sharing: boolean;
  shareError: boolean;
  onSelect: (row: ProgressPhotoRow) => void;
  onShare: () => void;
  onStartOver: () => void;
}

// Hook-free so a test and the durability harness can render it directly, matching
// ProgressPhotosScreenView's own split.
export function PhotoCompositeScreenView({
  state,
  step,
  cells,
  selectable,
  beforeId,
  afterId,
  tileSize,
  colors,
  sharing,
  shareError,
  onSelect,
  onShare,
  onStartOver,
}: PhotoCompositeScreenViewProps) {
  const beforeCell = cells.find((cell) => cell.row.id === beforeId) ?? null;
  const afterCell = cells.find((cell) => cell.row.id === afterId) ?? null;

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center px-lg pt-md">
        <NavBackButton fallbackHref="/progress-photos" />
        <Text className="ml-sm text-heading font-semibold text-foreground">Before &amp; After</Text>
      </View>

      {state === 'not-enough-photos' ? (
        <View className="gap-xs px-lg pt-lg">
          <Text className="text-heading font-semibold text-foreground">Not enough photos on this device</Text>
          <Text className="text-body font-normal text-foreground-muted">
            You need at least two progress photos on this device to build a before &amp; after.
          </Text>
        </View>
      ) : (
        <>
          <View className="px-lg pt-sm">
            <Text className="text-label font-normal text-foreground-muted">{compositeStepLabel(step)}</Text>
          </View>

          {step !== 'preview' ? (
            <FlashList
              data={cells}
              numColumns={PHOTO_GRID_COLUMNS}
              keyExtractor={(cell) => cell.row.id}
              contentContainerStyle={{ padding: 24 }}
              renderItem={({ item, index }) => {
                const canSelect = selectable[index] ?? false;
                const isChosenBefore = step === 'choose-after' && item.row.id === beforeId;

                return (
                  <View
                    style={{
                      margin: PHOTO_TILE_GAP / 2,
                      borderWidth: isChosenBefore ? 2 : 0,
                      borderColor: isChosenBefore ? colors.accent : 'transparent',
                      borderRadius: 8,
                    }}
                  >
                    {item.present && item.photoUri ? (
                      <ProgressPhotoTile
                        photoUri={item.photoUri}
                        dateLabel={formatChartDateLabel(item.row.localDate)}
                        size={tileSize}
                        onPress={canSelect ? () => onSelect(item.row) : () => {}}
                      />
                    ) : (
                      <ProgressPhotoPlaceholderView dateLabel={formatChartDateLabel(item.row.localDate)} size={tileSize} colors={colors} />
                    )}
                  </View>
                );
              }}
            />
          ) : (
            <>
              <View className="flex-row gap-sm px-lg pt-lg">
                {beforeCell?.photoUri ? (
                  <View className="flex-1">
                    <Image source={{ uri: beforeCell.photoUri }} style={{ width: '100%', aspectRatio: 1, borderRadius: 8 }} resizeMode="cover" />
                    <Text className="mt-xs text-center text-label font-normal text-foreground-muted">
                      {formatChartDateLabel(beforeCell.row.localDate)}
                    </Text>
                  </View>
                ) : null}
                {afterCell?.photoUri ? (
                  <View className="flex-1">
                    <Image source={{ uri: afterCell.photoUri }} style={{ width: '100%', aspectRatio: 1, borderRadius: 8 }} resizeMode="cover" />
                    <Text className="mt-xs text-center text-label font-normal text-foreground-muted">
                      {formatChartDateLabel(afterCell.row.localDate)}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View className="px-lg pt-lg">
                <PrimaryButton label={Platform.OS === 'web' ? 'Download' : 'Share'} onPress={onShare} submitting={sharing} />
                {shareError ? (
                  <Text className="mt-xs text-label font-normal text-foreground-muted">Couldn't share. Try again.</Text>
                ) : null}
              </View>
            </>
          )}

          <Pressable
            onPress={onStartOver}
            accessibilityRole="button"
            accessibilityLabel="Start Over"
            style={{ minHeight: 48, justifyContent: 'center' }}
            className="px-lg"
          >
            <Text className="text-body font-normal text-accent">Start Over</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

export interface PhotoCompositeScreenProps {
  userId?: string;
  db?: WriteDb;
}

export default function PhotoCompositeScreen({ userId: userIdOverride, db }: PhotoCompositeScreenProps = {}) {
  const session = authClient.useSession();
  const userId = userIdOverride ?? session.data?.user?.id ?? null;
  const { width: windowWidth } = useWindowDimensions();
  const colors = useThemeColors();

  const [rows, setRows] = useState<ProgressPhotoRow[] | null>(null);
  const [presenceByKey, setPresenceByKey] = useState<Map<string, boolean>>(new Map());
  const [photoUris, setPhotoUris] = useState<Map<string, string>>(new Map());
  const [selection, setSelection] = useState<CompositeSelection>({ before: null, after: null });
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState(false);
  const objectUrisRef = useRef<string[]>([]);
  const captureViewRef = useRef<View>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    const database = db ?? getPowerSync();
    const loadedRows = await loadProgressPhotos(userId, database);
    const distinctKeys = [...new Set(loadedRows.map((row) => row.storageKey))];

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

  const baseCells: GalleryCell[] = rows !== null ? resolveGalleryCells(rows, presenceByKey) : [];
  const cells: CompositePhotoCell[] = baseCells.map((cell) => ({
    row: cell.row,
    present: cell.present,
    photoUri: photoUris.get(cell.row.storageKey) ?? null,
  }));
  const step = deriveCompositeStep(selection);
  const selectable = resolveSelectableCells(baseCells, selection.before);
  const beforeCell = cells.find((cell) => cell.row.id === selection.before) ?? null;
  const afterCell = cells.find((cell) => cell.row.id === selection.after) ?? null;

  const handleSelect = (row: ProgressPhotoRow) => {
    if (step === 'choose-before') {
      setSelection({ before: row.id, after: null });
      return;
    }
    if (step === 'choose-after') {
      setSelection((previous) => ({ ...previous, after: row.id }));
    }
  };

  const handleStartOver = () => {
    setSelection({ before: null, after: null });
    setShareError(false);
  };

  const handleShare = () => {
    if (!beforeCell?.photoUri || !afterCell?.photoUri) return;

    setSharing(true);
    void shareComposite({
      before: { uri: beforeCell.photoUri, dateLabel: formatChartDateLabel(beforeCell.row.localDate) },
      after: { uri: afterCell.photoUri, dateLabel: formatChartDateLabel(afterCell.row.localDate) },
      viewRef: captureViewRef,
    })
      .then(() => setShareError(false))
      .catch((error: unknown) => {
        console.error('composite share failed', error);
        setShareError(true);
      })
      .finally(() => setSharing(false));
  };

  if (rows === null) return null;

  const screenState = deriveCompositeScreenState(baseCells);

  return (
    <>
      <PhotoCompositeScreenView
        state={screenState}
        step={step}
        cells={cells}
        selectable={selectable}
        beforeId={selection.before}
        afterId={selection.after}
        tileSize={resolvePhotoTileSize(windowWidth)}
        colors={colors}
        sharing={sharing}
        shareError={shareError}
        onSelect={handleSelect}
        onShare={handleShare}
        onStartOver={handleStartOver}
      />
      {step === 'preview' && beforeCell?.photoUri && afterCell?.photoUri ? (
        <CompositeCaptureView
          ref={captureViewRef}
          before={{ uri: beforeCell.photoUri, dateLabel: formatChartDateLabel(beforeCell.row.localDate) }}
          after={{ uri: afterCell.photoUri, dateLabel: formatChartDateLabel(afterCell.row.localDate) }}
        />
      ) : null}
    </>
  );
}
