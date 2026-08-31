import { useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import { TextField } from './TextField';
import { savePhoto } from '@/lib/db/progress-photos';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';

// Matches the shipped ReorderExercisesSheet/HistoryActionSheet/MetricEntrySheet modal card width —
// this sheet is the same card shape as every other action sheet in this app, never a bespoke
// width (R32).
export const PHOTO_CAPTURE_SHEET_MAX_WIDTH = 400;

export interface PhotoCaptureConfirmSheetViewProps {
  photoUri: string;
  note: string;
  saving: boolean;
  writeFailed: boolean;
  onNoteChange: (note: string) => void;
  onSave: () => void;
  onDiscard: () => void;
}

// Hook-free — direct-invocable by a test, matching MetricEntrySheetView's docked-card shape. This
// sheet is only ever presented after capture AND downscale have both returned bytes (S9's own
// "never shows the raw original" contract), so it has no empty state.
export function PhotoCaptureConfirmSheetView({
  photoUri,
  note,
  saving,
  writeFailed,
  onNoteChange,
  onSave,
  onDiscard,
}: PhotoCaptureConfirmSheetViewProps) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onDiscard}>
      <View className="flex-1 items-center justify-center bg-background/80 px-lg">
        <View className="w-full rounded-md bg-surface p-lg" style={{ maxWidth: PHOTO_CAPTURE_SHEET_MAX_WIDTH }}>
          <Text className="text-heading font-semibold text-foreground">Add Progress Photo</Text>

          <View className="mt-lg aspect-square w-full overflow-hidden rounded-md bg-background">
            <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </View>

          {/* Optional, wraps normally, no character limit imposed by this spec (S9 long-text). */}
          <View className="mt-lg">
            <TextField label="Note" placeholder="Add a note (optional)" value={note} onChangeText={onNoteChange} multiline />
          </View>

          <View className="mt-lg gap-sm">
            <Pressable
              onPress={onSave}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Save"
              accessibilityState={{ disabled: saving }}
              className={`items-center justify-center rounded-md bg-accent px-md py-sm ${saving ? 'opacity-60' : ''}`}
              style={{ minHeight: 48 }}
            >
              <Text className="text-body font-semibold text-white">Save</Text>
            </Pressable>
            {writeFailed ? (
              <Text className="text-label font-normal text-foreground-muted">{"Couldn't save. Try again."}</Text>
            ) : null}
          </View>

          <View className="mt-lg flex-row justify-end">
            <Pressable
              onPress={onDiscard}
              accessibilityRole="button"
              accessibilityLabel="Discard"
              style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text className="text-body font-normal text-foreground-muted">Discard</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export interface PhotoCaptureConfirmSheetProps {
  userId: string;
  // The already-downscaled preview URI/bytes — this component never re-decodes or re-downscales.
  photoUri: string;
  bytes: Uint8Array;
  db?: WriteDb;
  onSaved: () => void;
  onDiscard: () => void;
}

// The stateful wrapper — owns the note field, the write and its failure state. A failed write
// keeps the sheet open and re-enables Save (S9's own error state), never a silently dropped photo.
export function PhotoCaptureConfirmSheet({ userId, photoUri, bytes, db, onSaved, onDiscard }: PhotoCaptureConfirmSheetProps) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [writeFailed, setWriteFailed] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePhoto({ userId, bytes, note: note.trim().length > 0 ? note.trim() : null }, db ?? getPowerSync());
      setWriteFailed(false);
      onSaved();
    } catch (error) {
      console.error('save progress photo failed', error);
      setSaving(false);
      setWriteFailed(true);
    }
  };

  return (
    <PhotoCaptureConfirmSheetView
      photoUri={photoUri}
      note={note}
      saving={saving}
      writeFailed={writeFailed}
      onNoteChange={setNote}
      onSave={() => void handleSave()}
      onDiscard={onDiscard}
    />
  );
}
