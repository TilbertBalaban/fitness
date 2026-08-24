import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import {
  DeleteWorkoutDialog,
  HistoryActionSheet,
  RenameSessionDialog,
  type HistoryRowActionId,
} from '@/components/HistoryActionSheet';
import { SessionHistoryRow } from '@/components/SessionHistoryRow';
import { authClient } from '@/lib/auth-client';
import type { WriteDb } from '@/lib/db/powersync';
import { historyRowLabel, loadHistoryPage, type HistoryPage, type HistorySessionRow } from '@/lib/db/history-query';
import { deleteSession, duplicateSession, renameSession } from '@/lib/db/history-mutations';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

const PAGE_SIZE = 25;
// 05-10 reads this flag from the workout route to open it in `editing` mode for a new past-dated
// session (D-32/D-33) — this plan only renders the entry point and navigates with it.
const ADD_PAST_WORKOUT_ROUTE = '/(tabs)/workout?addPast=1';
const WORKOUT_TAB_ROUTE = '/(tabs)/workout';

export type HistoryScreenState = 'error' | 'loading' | 'empty' | 'ready';

export interface HistoryScreenStateInput {
  failed: boolean;
  page: HistoryPage | null;
}

// Mirrors deriveHomeScreenState's shape exactly (index.tsx): failed beats everything, a null page
// means the read has not landed yet, and a landed page with no rows is the real empty state.
export function deriveHistoryScreenState({ failed, page }: HistoryScreenStateInput): HistoryScreenState {
  if (failed) return 'error';
  if (page === null) return 'loading';
  if (page.rows.length === 0) return 'empty';
  return 'ready';
}

// Which overlay (if any) is open, and which row it belongs to — a discriminated union rather than
// three independent booleans/ids, so "sheet and rename open at once" is unrepresentable.
export type HistoryOverlay =
  | { kind: 'sheet'; sessionId: string }
  | { kind: 'rename'; sessionId: string }
  | { kind: 'delete'; sessionId: string }
  | null;

export interface HistoryScreenViewProps {
  state: HistoryScreenState;
  rows: HistorySessionRow[];
  colors: ThemeColors;
  overlay: HistoryOverlay;
  onRowPress: (sessionId: string) => void;
  onOverflowPress: (sessionId: string) => void;
  onEndReached: () => void;
  onAddPastWorkout: () => void;
  onSheetSelect: (action: HistoryRowActionId) => void;
  onCancelOverlay: () => void;
  onConfirmRename: (name: string) => void;
  onConfirmDelete: () => void;
}

// Hook-free — mirrors WorkoutScreenView's split from its own useWorkoutScreen hook. UI-SPEC E11:
// no loading state for the already-local first page (R6), so 'loading' renders an empty screen
// rather than a skeleton — this local read resolves near-instantly and the tab must never flash a
// spinner for it.
export function HistoryScreenView({
  state,
  rows,
  overlay,
  onRowPress,
  onOverflowPress,
  onEndReached,
  onAddPastWorkout,
  onSheetSelect,
  onCancelOverlay,
  onConfirmRename,
  onConfirmDelete,
}: HistoryScreenViewProps) {
  if (state === 'error') {
    return (
      <View className="flex-1 items-center justify-center gap-sm bg-background px-lg">
        <Text className="text-center text-heading font-semibold text-foreground">{"History couldn't load"}</Text>
        <Text className="text-center text-body font-normal text-foreground-muted">
          Restart the app to try again. Your programs and history are safe.
        </Text>
      </View>
    );
  }

  if (state === 'empty') {
    return (
      <View className="flex-1 items-center justify-center gap-sm bg-background px-lg">
        <Text className="text-center text-heading font-semibold text-foreground">No workouts yet</Text>
        <Text className="text-center text-body font-normal text-foreground-muted">
          Log your first workout to see it here.
        </Text>
        <Pressable
          onPress={onAddPastWorkout}
          accessibilityRole="button"
          accessibilityLabel="Add a Past Workout"
          style={{ minHeight: 48, justifyContent: 'center' }}
        >
          <Text className="text-body font-normal text-accent">Add a Past Workout</Text>
        </Pressable>
      </View>
    );
  }

  const overlayRow = overlay ? rows.find((row) => row.id === overlay.sessionId) : undefined;

  return (
    <View className="flex-1 bg-background">
      <FlashList
        data={state === 'ready' ? rows : []}
        keyExtractor={(row) => row.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 32 }}
        onEndReached={onEndReached}
        renderItem={({ item }) => (
          <View className="mb-sm">
            <SessionHistoryRow
              row={item}
              onPress={() => onRowPress(item.id)}
              onOverflowPress={() => onOverflowPress(item.id)}
            />
          </View>
        )}
      />

      {overlay?.kind === 'sheet' ? (
        <Modal transparent animationType="fade" onRequestClose={onCancelOverlay}>
          <HistoryActionSheet
            sessionLabel={overlayRow ? historyRowLabel(overlayRow) : ''}
            onSelect={onSheetSelect}
            onCancel={onCancelOverlay}
          />
        </Modal>
      ) : null}

      {overlay?.kind === 'rename' ? (
        <Modal transparent animationType="fade" onRequestClose={onCancelOverlay}>
          <RenameSessionDialog initialValue={overlayRow?.name ?? ''} onConfirm={onConfirmRename} onCancel={onCancelOverlay} />
        </Modal>
      ) : null}

      {overlay?.kind === 'delete' ? (
        <Modal transparent animationType="fade" onRequestClose={onCancelOverlay}>
          <DeleteWorkoutDialog onConfirm={onConfirmDelete} onCancel={onCancelOverlay} />
        </Modal>
      ) : null}
    </View>
  );
}

export interface UseHistoryScreenOptions {
  userId: string | null;
  db?: WriteDb;
}

export interface HistoryScreenViewModel {
  state: HistoryScreenState;
  rows: HistorySessionRow[];
  overlay: HistoryOverlay;
  onRowPress: (sessionId: string) => void;
  onOverflowPress: (sessionId: string) => void;
  onEndReached: () => void;
  onAddPastWorkout: () => void;
  onSheetSelect: (action: HistoryRowActionId) => void;
  onCancelOverlay: () => void;
  onConfirmRename: (name: string) => void;
  onConfirmDelete: () => void;
}

export function useHistoryScreen({ userId, db }: UseHistoryScreenOptions): HistoryScreenViewModel {
  const router = useRouter();
  const [page, setPage] = useState<HistoryPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [overlay, setOverlay] = useState<HistoryOverlay>(null);

  // On focus, not on mount — matches Home's own readNextUp effect (index.tsx): a session finished
  // on another tab (Workout) must not leave History showing a stale page until the app restarts.
  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        try {
          const result = await loadHistoryPage({ userId, limit: PAGE_SIZE }, db);
          if (!active) return;
          setPage(result);
          setFailed(false);
        } catch (error) {
          console.error('history load failed', error);
          if (!active) return;
          setFailed(true);
        }
      })();

      return () => {
        active = false;
      };
    }, [userId, db]),
  );

  const handleEndReached = useCallback(() => {
    if (!page || page.nextCursor === null || loadingMore) return;
    setLoadingMore(true);

    void (async () => {
      try {
        const next = await loadHistoryPage({ userId, limit: PAGE_SIZE, cursor: page.nextCursor }, db);
        setPage((current) => (current ? { rows: [...current.rows, ...next.rows], nextCursor: next.nextCursor } : next));
      } catch (error) {
        console.error('history page load failed', error);
      } finally {
        setLoadingMore(false);
      }
    })();
  }, [page, userId, db, loadingMore]);

  const handleSheetSelect = useCallback(
    (action: HistoryRowActionId) => {
      if (!overlay || overlay.kind !== 'sheet') return;
      const { sessionId } = overlay;

      if (action === 'view') {
        setOverlay(null);
        router.push(`/workout-summary?sessionId=${sessionId}`);
        return;
      }
      if (action === 'rename') {
        setOverlay({ kind: 'rename', sessionId });
        return;
      }
      if (action === 'delete') {
        setOverlay({ kind: 'delete', sessionId });
        return;
      }
      // action === 'duplicate': the copy starts in_progress (D-33's startSession funnel), so the
      // destination is the live Workout tab, not the read-only summary — LOG-20's "duplicate"
      // means doing the workout again right now, not viewing a clone of the finished one.
      setOverlay(null);
      void (async () => {
        try {
          await duplicateSession({ sourceSessionId: sessionId }, db);
          router.push(WORKOUT_TAB_ROUTE);
        } catch (error) {
          console.error('duplicate session failed', error);
        }
      })();
    },
    [overlay, db, router],
  );

  const handleConfirmRename = useCallback(
    (name: string) => {
      if (!overlay || overlay.kind !== 'rename') return;
      const { sessionId } = overlay;
      setOverlay(null);
      const trimmed = name.trim();

      void (async () => {
        try {
          await renameSession(sessionId, name, db);
          setPage((current) =>
            current
              ? {
                  ...current,
                  rows: current.rows.map((row) => (row.id === sessionId ? { ...row, name: trimmed.length > 0 ? trimmed : null } : row)),
                }
              : current,
          );
        } catch (error) {
          console.error('rename session failed', error);
        }
      })();
    },
    [overlay, db],
  );

  const handleConfirmDelete = useCallback(() => {
    if (!overlay || overlay.kind !== 'delete') return;
    const { sessionId } = overlay;
    setOverlay(null);

    void (async () => {
      try {
        await deleteSession(sessionId, db);
        setPage((current) => (current ? { ...current, rows: current.rows.filter((row) => row.id !== sessionId) } : current));
      } catch (error) {
        console.error('delete session failed', error);
      }
    })();
  }, [overlay, db]);

  return {
    state: deriveHistoryScreenState({ failed, page }),
    rows: page?.rows ?? [],
    overlay,
    onRowPress: (sessionId) => router.push(`/workout-summary?sessionId=${sessionId}`),
    onOverflowPress: (sessionId) => setOverlay({ kind: 'sheet', sessionId }),
    onEndReached: handleEndReached,
    onAddPastWorkout: () => router.push(ADD_PAST_WORKOUT_ROUTE),
    onSheetSelect: handleSheetSelect,
    onCancelOverlay: () => setOverlay(null),
    onConfirmRename: handleConfirmRename,
    onConfirmDelete: handleConfirmDelete,
  };
}

export default function HistoryScreen() {
  const colors = useThemeColors();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;
  const vm = useHistoryScreen({ userId });

  return <HistoryScreenView {...vm} colors={colors} />;
}
