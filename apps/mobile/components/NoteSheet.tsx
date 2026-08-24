import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { DetailSection } from './DetailSection';
import { TextField } from './TextField';
import { setNote, type NoteLevel } from '@/lib/db/session-mutations';

const HEADING: Record<NoteLevel, string> = {
  set: 'Set Note',
  exercise: 'Exercise Note',
  session: 'Session Note',
};

export interface NoteSheetViewProps {
  level: NoteLevel;
  text: string;
  saving: boolean;
  onChangeText: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

// One component serving all three note levels (set/exercise/session) — the level only changes the
// heading and which column setNote writes to (session-mutations.ts owns that routing); the sheet's
// own shape never branches on level. Reuses TextField/DetailSection rather than a bespoke input.
export function NoteSheetView({ level, text, saving, onChangeText, onSave, onCancel }: NoteSheetViewProps) {
  return (
    <View className="flex-1 items-center justify-center bg-background/80 px-lg">
      <ScrollView className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg" contentContainerStyle={{ flexGrow: 1 }}>
        <Text className="text-heading font-semibold text-foreground">{HEADING[level]}</Text>

        <DetailSection heading="Note">
          <TextField label="Note" value={text} onChangeText={onChangeText} multiline />
        </DetailSection>

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
            onPress={onSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Save Note"
            style={{ minWidth: 48, minHeight: 48, opacity: saving ? 0.6 : 1 }}
            className="items-center justify-center rounded-md bg-accent px-md py-sm"
          >
            <Text className="text-body font-semibold text-white">Save</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

export interface NoteSheetProps {
  level: NoteLevel;
  id: string;
  initialText: string | null;
  onSaved: () => void;
  onCancel: () => void;
}

// Thin stateful wrapper: local draft text, writes through setNote on Save. normalizeNote (inside
// setNote) is what turns an empty/all-whitespace draft into null — this wrapper passes the raw
// draft straight through rather than pre-trimming it itself, so there is exactly one place that
// rule lives.
export function NoteSheet({ level, id, initialText, onSaved, onCancel }: NoteSheetProps) {
  const [text, setText] = useState(initialText ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setNote({ level, id, text });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <NoteSheetView
      level={level}
      text={text}
      saving={saving}
      onChangeText={setText}
      onSave={() => void handleSave()}
      onCancel={onCancel}
    />
  );
}
