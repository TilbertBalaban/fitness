import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ArchiveDialog } from '@/components/ArchiveDialog';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RoutineActionSheet, type RoutineAction } from '@/components/RoutineActionSheet';
import { TextField } from '@/components/TextField';
import { authClient } from '@/lib/auth-client';
import { duplicateRoutine } from '@/lib/db/programs/duplicate-routine';
import { runMutation } from '@/lib/programs/mutation';
import {
  activateRoutine,
  archiveRoutine,
  loadActiveRoutineId,
  loadLibraryRoutines,
  renameRoutine,
  resolveLiveRoutineId,
  restoreRoutine,
  type LibraryRoutineRow,
} from '@/lib/db/programs/lifecycle';

const SKELETON_ROW_COUNT = 3;

export type LibraryScreenState = 'error' | 'loading' | 'empty' | 'populated';

export interface LibraryScreenStateInput {
  failed: boolean;
  routines: LibraryRoutineRow[] | null;
}

export function deriveLibraryScreenState({ failed, routines }: LibraryScreenStateInput): LibraryScreenState {
  if (failed) return 'error';
  if (routines === null) return 'loading';
  if (routines.length === 0) return 'empty';
  return 'populated';
}

export interface PartitionedRoutines {
  active: LibraryRoutineRow[];
  drafts: LibraryRoutineRow[];
  ready: LibraryRoutineRow[];
  archived: LibraryRoutineRow[];
}

function byNameThenId(a: LibraryRoutineRow, b: LibraryRoutineRow): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

// Archived wins over every other classification, including the active pointer: a stale pointer
// arriving from another device must not be able to present an archived program as the one being
// run. That reconciliation is resolveLiveRoutineId's to make — the pointer and the archive stamp
// are two rows under row-level LWW and can genuinely disagree, and one owner of the rule is what
// keeps this screen, the builder and the Home card from answering it differently. Ordering is by
// name then id so the sequence is total even when two programs share a name.
export function partitionRoutines(
  rows: LibraryRoutineRow[],
  activeRoutineId: string | null = null,
): PartitionedRoutines {
  const partition: PartitionedRoutines = { active: [], drafts: [], ready: [], archived: [] };
  const resolvedActiveId = resolveLiveRoutineId(rows, activeRoutineId);

  for (const row of rows) {
    if (row.archivedAt !== null) partition.archived.push(row);
    else if (row.id === resolvedActiveId) partition.active.push(row);
    else if (row.status === 'draft') partition.drafts.push(row);
    else partition.ready.push(row);
  }

  partition.active.sort(byNameThenId);
  partition.drafts.sort(byNameThenId);
  partition.ready.sort(byNameThenId);
  partition.archived.sort(byNameThenId);

  return partition;
}

export interface LibraryRowSubtitleInput {
  status: string;
  archivedAt: string | null;
  isActive: boolean;
  progressionFrozen?: boolean;
}

function titleCaseStatus(status: string): string {
  if (status.length === 0) return status;
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// Every applicable state word, joined. Status is Title Case rather than the raw enum value (the
// UI-SPEC's Correction Note), and "Frozen" sits beside "Active" rather than replacing it, because
// freeze and activation are independent facts (D-16). Nothing here frames a frozen program as
// failing: freezing is a deliberate choice, and this phase implements no progression at all.
export function formatLibraryRowSubtitle({
  status,
  archivedAt,
  isActive,
  progressionFrozen = false,
}: LibraryRowSubtitleInput): string {
  const words = [titleCaseStatus(status)];

  if (archivedAt !== null) {
    words.push('Archived');
    return words.join(' · ');
  }

  if (isActive) words.push('Active');
  if (progressionFrozen) words.push('Frozen');

  return words.join(' · ');
}

export type LibraryListItem =
  | { kind: 'header'; title: string }
  | { kind: 'row'; row: LibraryRoutineRow; isActive: boolean };

// Two sections, each present only when it has rows — the same own-empty-omits-header convention
// DetailSection follows. The active program is listed here too, badged, so activate and deactivate
// are reachable from the same place.
export function buildLibraryListItems(
  rows: LibraryRoutineRow[],
  activeRoutineId: string | null,
): LibraryListItem[] {
  const partition = partitionRoutines(rows, activeRoutineId);
  const items: LibraryListItem[] = [];

  const yours = [...partition.active, ...partition.ready, ...partition.drafts];
  if (yours.length > 0) {
    items.push({ kind: 'header', title: 'Your Programs' });
    for (const row of partition.active) items.push({ kind: 'row', row, isActive: true });
    for (const row of [...partition.ready, ...partition.drafts]) items.push({ kind: 'row', row, isActive: false });
  }

  if (partition.archived.length > 0) {
    items.push({ kind: 'header', title: 'Archived' });
    for (const row of partition.archived) items.push({ kind: 'row', row, isActive: false });
  }

  return items;
}

const ACTIVATE = 'activate';
const DUPLICATE = 'duplicate';
const RENAME = 'rename';
const ARCHIVE = 'archive';
const RESTORE = 'restore';

export function actionsForRow(row: LibraryRoutineRow, isActive: boolean): RoutineAction[] {
  const archived = row.archivedAt !== null;
  const actions: RoutineAction[] = [];

  // Activating is hidden rather than disabled on the already-active row and on archived rows: an
  // archived program is never the active one, so offering the action would advertise a state that
  // archiveRoutine immediately undoes.
  if (!isActive && !archived) actions.push({ key: ACTIVATE, label: 'Activate' });
  actions.push({ key: DUPLICATE, label: 'Duplicate' });
  actions.push({ key: RENAME, label: 'Rename' });
  actions.push(
    archived
      ? { key: RESTORE, label: 'Restore' }
      : { key: ARCHIVE, label: 'Archive', destructive: true },
  );

  return actions;
}

export default function ProgramLibraryScreen() {
  const router = useRouter();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const [routines, setRoutines] = useState<LibraryRoutineRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [activeRoutineId, setActiveRoutineId] = useState<string | null>(null);
  const [sheetRowId, setSheetRowId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ routineId: string; unarchiving: boolean } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [loaded, pointer] = await Promise.all([
        loadLibraryRoutines(),
        userId ? loadActiveRoutineId(userId) : Promise.resolve(null),
      ]);
      setRoutines(loaded);
      setActiveRoutineId(pointer);
      setFailed(false);
    } catch (error) {
      console.error('program library load failed', error);
      setFailed(true);
    }
  }, [userId]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const [loaded, pointer] = await Promise.all([
          loadLibraryRoutines(),
          userId ? loadActiveRoutineId(userId) : Promise.resolve(null),
        ]);
        if (mounted) {
          setRoutines(loaded);
          setActiveRoutineId(pointer);
          setFailed(false);
        }
      } catch (error) {
        console.error('program library load failed', error);
        if (mounted) setFailed(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [userId]);

  // Same rule as the builder's mutate: never rejects, so no async handler reaches onSelect/onPress
  // as an unhandled rejection, and every failure has a banner to land in (WR-11).
  const mutate = useCallback(
    async (action: () => Promise<unknown>, fallback: string): Promise<boolean> => {
      const outcome = await runMutation(action, fallback);
      setMutationError(outcome.message);
      await reload();
      return outcome.ok;
    },
    [reload],
  );

  const handleSelectAction = useCallback(
    async (key: string) => {
      const row = routines?.find((candidate) => candidate.id === sheetRowId);
      if (!row) return;

      setSheetRowId(null);

      switch (key) {
        case ACTIVATE:
          if (!userId) return;
          await mutate(
            () => activateRoutine({ userId, routineId: row.id }),
            `Couldn't make ${row.name} the active program.`,
          );
          return;
        case DUPLICATE: {
          let duplicateId: string | null = null;
          const duplicated = await mutate(async () => {
            duplicateId = (await duplicateRoutine({ sourceRoutineId: row.id, name: `${row.name} copy` })).id;
          }, `Couldn't duplicate ${row.name}.`);
          if (!duplicated || duplicateId === null) return;
          // Duplicating navigates straight into the new draft rather than leaving the user on the
          // list — "the builder should not put anything between the user and building".
          router.push({ pathname: '/(tabs)/programs', params: { routineId: duplicateId } });
          return;
        }
        case RENAME:
          setRenamingId(row.id);
          setRenameValue(row.name);
          setRenameError(null);
          return;
        case ARCHIVE:
          setConfirming({ routineId: row.id, unarchiving: false });
          return;
        case RESTORE:
          setConfirming({ routineId: row.id, unarchiving: true });
          return;
        default:
          return;
      }
    },
    [mutate, routines, router, sheetRowId, userId],
  );

  const handleConfirm = useCallback(async () => {
    if (!confirming) return;
    const { routineId, unarchiving } = confirming;
    setConfirming(null);

    if (unarchiving) {
      await mutate(() => restoreRoutine(routineId), "Couldn't restore that program.");
      return;
    }
    if (userId) {
      await mutate(() => archiveRoutine({ userId, routineId }), "Couldn't archive that program.");
    }
  }, [confirming, mutate, userId]);

  const handleSaveRename = useCallback(async () => {
    if (!renamingId) return;
    const renamed = await mutate(() => renameRoutine(renamingId, renameValue), "Couldn't rename that program.");
    if (renamed) {
      setRenamingId(null);
      setRenameError(null);
      return;
    }
    setRenameError('Program name is required');
  }, [mutate, renameValue, renamingId]);

  const screenState = deriveLibraryScreenState({ failed, routines });

  if (screenState === 'error') {
    return (
      <View className="flex-1 items-center justify-center bg-background px-lg">
        <Text className="text-center text-heading font-semibold text-foreground">{"Programs couldn't load"}</Text>
        <Text className="mt-sm text-center text-body font-normal text-foreground-muted">
          Restart the app to try again. Your programs and history are safe.
        </Text>
      </View>
    );
  }

  if (confirming) {
    return (
      <ArchiveDialog
        subject="program"
        unarchiving={confirming.unarchiving}
        onConfirm={() => void handleConfirm()}
        onCancel={() => setConfirming(null)}
      />
    );
  }

  if (sheetRowId) {
    const row = routines?.find((candidate) => candidate.id === sheetRowId);
    if (row) {
      return (
        <RoutineActionSheet
          programName={row.name}
          actions={actionsForRow(row, row.id === resolveLiveRoutineId(routines ?? [], activeRoutineId))}
          onSelect={(key) => void handleSelectAction(key)}
          onCancel={() => setSheetRowId(null)}
        />
      );
    }
  }

  const items = buildLibraryListItems(routines ?? [], activeRoutineId);

  return (
    <View className="flex-1 bg-background">
      {mutationError ? (
        <View className="px-lg pt-md">
          <ErrorBanner message={mutationError} />
        </View>
      ) : null}
      <FlashList
        data={items}
        keyExtractor={(item) => (item.kind === 'header' ? `header-${item.title}` : item.row.id)}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            return (
              <Text className="mt-lg mb-sm text-body font-semibold text-foreground">{item.title}</Text>
            );
          }

          const { row, isActive } = item;
          const archived = row.archivedAt !== null;

          if (renamingId === row.id) {
            return (
              <View className="mb-sm gap-sm rounded-md bg-surface p-md">
                <TextField
                  label="Program name"
                  value={renameValue}
                  onChangeText={(value) => {
                    setRenameValue(value);
                    setRenameError(null);
                  }}
                  error={renameError}
                />
                <PrimaryButton label="Save" onPress={() => void handleSaveRename()} />
              </View>
            );
          }

          return (
            <View
              className="mb-sm flex-row items-center gap-sm rounded-md bg-surface p-md"
              // Matches the cycle strip's time_off treatment — archived and off read the same way:
              // present but not active.
              style={{ opacity: archived ? 0.6 : 1 }}
            >
              <View className="flex-1 gap-xs">
                <View className="flex-row flex-wrap items-center gap-sm">
                  <Text className="text-body font-normal text-foreground">{row.name}</Text>
                  {isActive ? (
                    <View className="rounded-md bg-accent px-sm py-xs">
                      <Text className="text-label font-normal text-white">Active</Text>
                    </View>
                  ) : null}
                </View>
                <Text className="text-label font-normal text-foreground-muted">
                  {formatLibraryRowSubtitle({
                    status: row.status,
                    archivedAt: row.archivedAt,
                    isActive,
                    progressionFrozen: row.progressionFrozen,
                  })}
                </Text>
              </View>

              <Pressable
                onPress={() => setSheetRowId(row.id)}
                accessibilityRole="button"
                accessibilityLabel={`More actions for ${row.name}`}
                style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text className="text-body font-normal text-foreground-muted">•••</Text>
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={
          screenState === 'empty' ? (
            <View className="mt-xl items-center gap-sm">
              <Text className="text-center text-heading font-semibold text-foreground">No other programs yet</Text>
              <Pressable
                onPress={() => router.push('/programs/new')}
                accessibilityRole="button"
                accessibilityLabel="New Program"
                style={{ minHeight: 48, justifyContent: 'center' }}
              >
                <Text className="text-body font-normal text-accent">New Program</Text>
              </Pressable>
            </View>
          ) : screenState === 'loading' ? (
            <View className="mt-xl gap-sm">
              {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
                <View key={index} className="rounded-md bg-surface" style={{ height: 64 }} />
              ))}
            </View>
          ) : null
        }
        ListFooterComponent={
          screenState === 'populated' ? (
            <Pressable
              onPress={() => router.push('/programs/new')}
              accessibilityRole="button"
              accessibilityLabel="New Program"
              style={{ minHeight: 48, justifyContent: 'center' }}
              className="mt-lg"
            >
              <Text className="text-body font-normal text-accent">New Program</Text>
            </Pressable>
          ) : null
        }
      />
    </View>
  );
}
