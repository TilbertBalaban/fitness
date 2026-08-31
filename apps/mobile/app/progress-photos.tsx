import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { NavBackButton } from '@/components/NavBackButton';
import { PhotoCaptureConfirmSheet } from '@/components/PhotoCaptureConfirmSheet';
import { DeletePhotoDialog, ProgressPhotoActionSheet, type ProgressPhotoActionId } from '@/components/ProgressPhotoActionSheet';
import { ProgressPhotoPlaceholder } from '@/components/ProgressPhotoPlaceholder';
import { PHOTO_GRID_COLUMNS, PHOTO_TILE_GAP, ProgressPhotoTile, resolvePhotoTileSize } from '@/components/ProgressPhotoTile';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { formatChartDateLabel } from '@/lib/analytics/chart-labels';
import { authClient } from '@/lib/auth-client';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import {
  canBuildComposite,
  deletePhoto,
  derivePhotoGalleryState,
  loadProgressPhotos,
  resolveGalleryCells,
  updatePhotoNote,
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

export interface EditPhotoNoteSheetProps {
  initialNote: string;
  saving: boolean;
  onSave: (note: string) => void;
  onCancel: () => void;
}

// Reuses TextField the same way PhotoCaptureConfirmSheet's note field does, rather than inventing
// a second note editor — this sheet edits an EXISTING row's note only, never taken_at/timezone/
// local_date/storage_key (updatePhotoNote's own single-column contract).
export function EditPhotoNoteSheet({ initialNote, saving, onSave, onCancel }: EditPhotoNoteSheetProps) {
  const [note, setNote] = useState(initialNote);

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-background/80 px-lg">
        <View className="w-full rounded-md bg-surface p-lg" style={{ maxWidth: 400 }}>
          <Text className="text-heading font-semibold text-foreground">Edit Note</Text>
          <View className="mt-lg">
            <TextField label="Note" placeholder="Add a note (optional)" value={note} onChangeText={setNote} multiline />
          </View>
          <View className="mt-lg flex-row justify-end gap-sm">
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={{ minWidth: 48, minHeight: 48 }}
              className="items-center justify-center rounded-md px-md py-sm"
            >
              <Text className="text-body text-foreground-muted">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => onSave(note)}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Save"
              accessibilityState={{ disabled: saving }}
              style={{ minWidth: 48, minHeight: 48 }}
              className={`items-center justify-center rounded-md bg-accent px-md py-sm ${saving ? 'opacity-60' : ''}`}
            >
              <Text className="text-body font-semibold text-white">Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
  const [actionSheetRow, setActionSheetRow] = useState<ProgressPhotoRow | null>(null);
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<ProgressPhotoRow | null>(null);
  const [editingNoteRow, setEditingNoteRow] = useState<ProgressPhotoRow | null>(null);
  const [savingNote, setSavingNote] = useState(false);
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

  // Selecting delete only asks (DeletePhotoDialog) — this sheet never mutates directly.
  // 'view' has no dedicated full-size viewer yet; selecting it simply closes the sheet.
  const handleActionSelect = (id: ProgressPhotoActionId) => {
    if (!actionSheetRow) return;
    const row = actionSheetRow;
    setActionSheetRow(null);
    if (id === 'delete') setConfirmDeleteRow(row);
    if (id === 'edit-note') setEditingNoteRow(row);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteRow || !userId) return;
    const row = confirmDeleteRow;
    setConfirmDeleteRow(null);
    try {
      await deletePhoto({ userId, id: row.id }, db ?? getPowerSync());
    } catch (error) {
      // deletePhoto removes the row before the bytes (progress-photos.ts's own documented
      // ordering) — a deletePhotoBytes rejection here still means the row is gone, so reload()
      // below must still run rather than leaving the just-deleted photo showing until next focus.
      console.error('progress photo delete failed', error);
    }
    await reload();
  };

  const handleSaveNote = async (note: string) => {
    if (!editingNoteRow || !userId) return;
    setSavingNote(true);
    await updatePhotoNote({ userId, id: editingNoteRow.id, note: note.trim().length > 0 ? note.trim() : null }, db ?? getPowerSync());
    setSavingNote(false);
    setEditingNoteRow(null);
    await reload();
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
        onTilePress={(row) => setActionSheetRow(row)}
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

      {actionSheetRow ? (
        <ProgressPhotoActionSheet
          dateLabel={formatChartDateLabel(actionSheetRow.localDate)}
          onSelect={handleActionSelect}
          onCancel={() => setActionSheetRow(null)}
        />
      ) : null}

      {confirmDeleteRow ? (
        <DeletePhotoDialog onConfirm={() => void handleConfirmDelete()} onCancel={() => setConfirmDeleteRow(null)} />
      ) : null}

      {editingNoteRow ? (
        <EditPhotoNoteSheet
          initialNote={editingNoteRow.note ?? ''}
          saving={savingNote}
          onSave={(note) => void handleSaveNote(note)}
          onCancel={() => setEditingNoteRow(null)}
        />
      ) : null}
    </>
  );
}
