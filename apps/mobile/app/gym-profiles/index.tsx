import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ArchiveDialog } from '@/components/ArchiveDialog';
import { ErrorBanner } from '@/components/ErrorBanner';
import { GymProfileActionSheet, type GymProfileAction } from '@/components/GymProfileActionSheet';
import { authClient } from '@/lib/auth-client';
import { runMutation } from '@/lib/programs/mutation';
import type { WriteDb } from '@/lib/db/powersync';
import {
  archiveEquipmentProfile,
  duplicateEquipmentProfile,
  formatGymRowSubtitle,
  loadActiveEquipmentProfileId,
  loadEquipmentProfiles,
  resolveLiveEquipmentProfileId,
  restoreEquipmentProfile,
  setActiveEquipmentProfile,
  type EquipmentProfileRow,
} from '@/lib/db/equipment-profiles';

export type GymProfilesScreenState = 'error' | 'loading' | 'populated';

export interface GymProfilesScreenStateInput {
  failed: boolean;
  profiles: EquipmentProfileRow[] | null;
}

// No 'empty' branch, unlike deriveLibraryScreenState: a user reaching this screen always has at
// least the D-19 seeded default gym, so zero profiles is not a state this screen ever renders.
export function deriveGymProfilesScreenState({ failed, profiles }: GymProfilesScreenStateInput): GymProfilesScreenState {
  if (failed) return 'error';
  if (profiles === null) return 'loading';
  return 'populated';
}

export interface PartitionedGymProfiles {
  active: EquipmentProfileRow[];
  rest: EquipmentProfileRow[];
  archived: EquipmentProfileRow[];
}

function byNameThenId(a: EquipmentProfileRow, b: EquipmentProfileRow): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

// Unlike partitionRoutines, active is a single-item partition (never more than one gym can be
// active) and there is no drafts/ready split — every non-archived, non-active row is just "rest".
// resolveLiveEquipmentProfileId owns the archived-wins-and-always-resolves-a-live-gym rule; this
// function trusts it rather than re-deriving it.
export function partitionGymProfiles(
  rows: EquipmentProfileRow[],
  activeId: string | null = null,
): PartitionedGymProfiles {
  const partition: PartitionedGymProfiles = { active: [], rest: [], archived: [] };
  const resolvedActiveId = resolveLiveEquipmentProfileId(rows, activeId);

  for (const row of rows) {
    if (row.archivedAt !== null) partition.archived.push(row);
    else if (row.id === resolvedActiveId) partition.active.push(row);
    else partition.rest.push(row);
  }

  partition.rest.sort(byNameThenId);
  partition.archived.sort(byNameThenId);

  return partition;
}

const SET_ACTIVE = 'set-active';
const EDIT = 'edit';
const DUPLICATE = 'duplicate';
const ARCHIVE = 'archive';
const RESTORE = 'restore';

// Mirrors actionsForRow's own shape: which actions apply is a property of the row (already
// active? archived?), computed once here so the sheet stays a pure renderer.
export function actionsForGymRow(isActive: boolean, archived: boolean): GymProfileAction[] {
  const actions: GymProfileAction[] = [];

  if (!isActive) actions.push({ key: SET_ACTIVE, label: 'Set Active' });
  actions.push({ key: EDIT, label: 'Edit' });
  actions.push({ key: DUPLICATE, label: 'Duplicate' });
  actions.push(
    archived ? { key: RESTORE, label: 'Restore' } : { key: ARCHIVE, label: 'Archive', destructive: true },
  );

  return actions;
}

type GymListItem =
  | { kind: 'header'; title: string }
  | { kind: 'row'; row: EquipmentProfileRow; isActive: boolean };

function buildGymListItems(rows: EquipmentProfileRow[], activeId: string | null): GymListItem[] {
  const partition = partitionGymProfiles(rows, activeId);
  const items: GymListItem[] = [];

  for (const row of partition.active) items.push({ kind: 'row', row, isActive: true });
  for (const row of partition.rest) items.push({ kind: 'row', row, isActive: false });

  if (partition.archived.length > 0) {
    items.push({ kind: 'header', title: 'Archived' });
    for (const row of partition.archived) items.push({ kind: 'row', row, isActive: false });
  }

  return items;
}

export interface GymProfilesScreenProps {
  // The durability harness's own seam (06-04 Task 3): mounts this exact route component against
  // a caller-chosen db/userId instead of the production getPowerSync() singleton and the signed-in
  // session, exactly as useWorkoutScreen({ userId, db }) does for the workout screen. Both are
  // undefined for every real navigation to this route — production behaviour is unchanged.
  userId?: string;
  db?: WriteDb;
}

export default function GymProfilesScreen({ userId: userIdOverride, db }: GymProfilesScreenProps = {}) {
  const router = useRouter();
  const session = authClient.useSession();
  const userId = userIdOverride ?? session.data?.user?.id ?? null;

  const [profiles, setProfiles] = useState<EquipmentProfileRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [sheetRowId, setSheetRowId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ profileId: string; unarchiving: boolean } | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      const [loaded, pointer] = await Promise.all([
        loadEquipmentProfiles(userId, db),
        loadActiveEquipmentProfileId(userId, db),
      ]);
      setProfiles(loaded);
      setActiveProfileId(pointer);
      setFailed(false);
    } catch (error) {
      console.error('gym profiles load failed', error);
      setFailed(true);
    }
  }, [userId, db]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Never rejects, so no async handler reaches onSelect/onPress as an unhandled rejection — same
  // rule library.tsx's own mutate follows (WR-11).
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
      const row = profiles?.find((candidate) => candidate.id === sheetRowId);
      if (!row || !userId) return;

      setSheetRowId(null);

      switch (key) {
        case SET_ACTIVE:
          await mutate(
            () => setActiveEquipmentProfile(userId, row.id, db),
            `Couldn't make ${row.name} the active gym.`,
          );
          return;
        case EDIT:
          router.push(`/gym-profiles/edit/${row.id}`);
          return;
        case DUPLICATE:
          await mutate(() => duplicateEquipmentProfile(userId, row.id, db), `Couldn't duplicate ${row.name}.`);
          return;
        case ARCHIVE:
          setConfirming({ profileId: row.id, unarchiving: false });
          return;
        case RESTORE:
          setConfirming({ profileId: row.id, unarchiving: true });
          return;
        default:
          return;
      }
    },
    [mutate, profiles, router, sheetRowId, userId, db],
  );

  const handleConfirm = useCallback(async () => {
    if (!confirming) return;
    const { profileId, unarchiving } = confirming;
    setConfirming(null);

    if (unarchiving) {
      await mutate(() => restoreEquipmentProfile(profileId, db), "Couldn't restore that gym.");
      return;
    }
    await mutate(() => archiveEquipmentProfile(profileId, db), "Couldn't archive that gym.");
  }, [confirming, mutate, db]);

  const screenState = deriveGymProfilesScreenState({ failed, profiles });

  if (screenState === 'error') {
    return (
      <View className="flex-1 items-center justify-center bg-background px-lg">
        <Text className="text-center text-heading font-semibold text-foreground">{"Gym Profiles couldn't load"}</Text>
        <Text className="mt-sm text-center text-body font-normal text-foreground-muted">
          Restart the app to try again. Your programs and history are safe.
        </Text>
      </View>
    );
  }

  if (confirming) {
    return (
      <ArchiveDialog
        subject="gym"
        unarchiving={confirming.unarchiving}
        onConfirm={() => void handleConfirm()}
        onCancel={() => setConfirming(null)}
      />
    );
  }

  if (sheetRowId) {
    const row = profiles?.find((candidate) => candidate.id === sheetRowId);
    if (row) {
      const isActive = row.id === resolveLiveEquipmentProfileId(profiles ?? [], activeProfileId);
      return (
        <GymProfileActionSheet
          gymName={row.name}
          actions={actionsForGymRow(isActive, row.archivedAt !== null)}
          onSelect={(key) => void handleSelectAction(key)}
          onCancel={() => setSheetRowId(null)}
        />
      );
    }
  }

  const items = buildGymListItems(profiles ?? [], activeProfileId);

  return (
    <View className="flex-1 bg-background">
      {mutationError ? (
        <View className="px-lg pt-md">
          <ErrorBanner message={mutationError} />
        </View>
      ) : null}

      <Pressable
        onPress={() => router.push('/gym-profiles/new')}
        accessibilityRole="button"
        accessibilityLabel="New Gym"
        style={{ minHeight: 48, justifyContent: 'center' }}
        className="px-lg pt-md"
      >
        <Text className="text-body font-normal text-accent">New Gym</Text>
      </Pressable>

      <FlashList
        data={items}
        keyExtractor={(item) => (item.kind === 'header' ? `header-${item.title}` : item.row.id)}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 }}
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            return <Text className="mt-lg mb-sm text-body font-semibold text-foreground">{item.title}</Text>;
          }

          const { row, isActive } = item;
          const archived = row.archivedAt !== null;
          const subtitle = formatGymRowSubtitle({
            barbellWeightKg: row.barbellWeightKg,
            plateCount: row.plates.length,
            dumbbellCount: row.dumbbells.length,
            machineCount: row.machines.length,
            nativeUnit: row.nativeUnit,
            archivedAt: row.archivedAt,
          });

          return (
            <View
              className={`mb-sm flex-row items-center gap-sm rounded-md border p-md ${
                isActive ? 'border-accent bg-surface' : 'border-transparent bg-surface'
              }`}
              style={{ opacity: archived ? 0.6 : 1 }}
            >
              <View className="flex-1 gap-xs">
                <Text
                  className={`text-body ${isActive ? 'font-semibold text-accent' : 'font-normal text-foreground'}`}
                >
                  {row.name}
                </Text>
                {subtitle.length > 0 ? (
                  <Text className="text-label font-normal text-foreground-muted">{subtitle}</Text>
                ) : null}
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
      />
    </View>
  );
}
