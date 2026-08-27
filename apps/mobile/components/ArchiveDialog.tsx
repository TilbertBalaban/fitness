import { Pressable, ScrollView, Text, View } from 'react-native';

export type ArchiveDialogSubject = 'exercise' | 'program' | 'gym';

export interface ArchiveDialogProps {
  unarchiving?: boolean;
  subject?: ArchiveDialogSubject;
  onConfirm: () => void;
  onCancel: () => void;
}

// Copy per the UI-SPEC Copywriting Contract's Destructive confirmation row (archive) — the
// exercise unarchive variant is not in that contract (restoring is not a destructive act), so its
// copy is written here directly rather than lifted from a fixed table entry. Both program rows
// are in the contract (04-UI-SPEC.md § Confirmations) and are reproduced verbatim, including
// "Restore" rather than "Unarchive" as the program verb.
const COPY = {
  exercise: {
    archive: {
      heading: 'Archive Exercise',
      body: 'Archiving removes it from pickers, but any logged sets stay in your history. Archive anyway?',
      confirmLabel: 'Archive',
    },
    unarchive: {
      heading: 'Unarchive Exercise',
      body: 'This exercise will reappear in pickers and search.',
      confirmLabel: 'Unarchive',
    },
  },
  program: {
    archive: {
      heading: 'Archive Program',
      body: 'Archiving removes it from your active list, but any logged workouts stay in your history. Archive anyway?',
      confirmLabel: 'Archive',
    },
    unarchive: {
      heading: 'Restore Program',
      body: 'This program will reappear in your library.',
      confirmLabel: 'Restore',
    },
  },
  // Verbatim from the 06-UI-SPEC.md Copywriting Contract's Destructive confirmation row — the
  // union's third extension point, no new component.
  gym: {
    archive: {
      heading: 'Archive Gym',
      body: 'Archiving removes it from your gym list, but any workouts logged there stay in your history. Archive anyway?',
      confirmLabel: 'Archive',
    },
    unarchive: {
      heading: 'Restore Gym',
      body: 'This gym will reappear in your gym list.',
      confirmLabel: 'Restore',
    },
  },
} as const;

// Copies SignOutDialog's structure exactly — same overlay, same two-button row, same 48x48
// controls — and changes only the copy and (for the unarchive variant) the confirm fill. Restoring
// an exercise is not a destructive act, so `unarchiving` drops the `destructive` fill entirely
// rather than reusing `accent` (which the Color contract reserves for CTA fill / active-filter-chip
// / focused-input border / selected-tab icon, none of which this control is).
export function ArchiveDialog({
  unarchiving = false,
  subject = 'exercise',
  onConfirm,
  onCancel,
}: ArchiveDialogProps) {
  const copy = unarchiving ? COPY[subject].unarchive : COPY[subject].archive;

  return (
    <View className="flex-1 items-center justify-center bg-background/80 px-lg">
      <ScrollView
        className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg"
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <Text className="text-heading font-semibold text-foreground">{copy.heading}</Text>
        <Text className="mt-sm text-body text-foreground-muted">{copy.body}</Text>
        <View className="mt-lg flex-row justify-end gap-sm">
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            style={{ minWidth: 48, minHeight: 48 }}
            className="items-center justify-center rounded-md px-md py-sm"
          >
            <Text className="text-body text-foreground-muted">Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            accessibilityRole="button"
            style={{ minWidth: 48, minHeight: 48 }}
            className={`items-center justify-center rounded-md px-md py-sm ${unarchiving ? '' : 'bg-destructive'}`}
          >
            <Text className={`text-body font-semibold ${unarchiving ? 'text-foreground' : 'text-background'}`}>
              {copy.confirmLabel}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
