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
import { SessionDateField } from '@/components/SessionDateField';
import { ExercisePickerModal, type PickerCatalogRow } from '@/components/ExercisePickerModal';
import { authClient } from '@/lib/auth-client';
import { captureCalendarDay } from '@/lib/calendar-day';
import { ensureDefaultEquipmentProfile } from '@/lib/db/equipment-profiles';
import { addSessionExercise, setSessionDate, startSession } from '@/lib/db/log-set';
import { completeSession } from '@/lib/db/session-lifecycle';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { historyRowLabel, loadHistoryPage, type HistoryPage, type HistorySessionRow } from '@/lib/db/history-query';
import { deleteSession, duplicateSession, renameSession } from '@/lib/db/history-mutations';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

const PAGE_SIZE = 25;
const WORKOUT_TAB_ROUTE = '/(tabs)/workout';

export interface StartBackfilledSessionInput {
  date: Date;
  timezone: string;
  exerciseIds: string[];
  // Optional for the same reason StartWorkoutFromProgramInput.userId is (log-set.ts) — the
  // durability harness's existing zero-arg-past-db calls keep stamping equipmentProfileId null.
  userId?: string | null;
}

// D-33's third funnel entry point: the SAME startSession log-set.ts's other two callers use, then
// setSessionDate (Task 1) to move it onto the chosen day, then addSessionExercise per selected
// exercise with no routine linkage — never a second `insert(workoutSession)` anywhere in this file.
// Completed immediately (not left `in_progress`): a freshly backfilled session must resolve to
// `editing` mode the instant the user lands on it (resolveSessionScreenMode reads status, and
// `in_progress` would incorrectly route it to the live screen instead) — the same reason a
// finished workout, not a running one, is what "add a workout you already did" actually means.
export async function startBackfilledSession(
  { date, timezone, exerciseIds, userId }: StartBackfilledSessionInput,
  db: WriteDb = getPowerSync(),
): Promise<string> {
  const equipmentProfileId = userId ? await ensureDefaultEquipmentProfile(userId, db) : null;
  const sessionId = await startSession({ equipmentProfileId }, db);
  await setSessionDate(sessionId, date, timezone, db);
  await completeSession(sessionId, date, db);

  for (const [index, exerciseId] of exerciseIds.entries()) {
    await addSessionExercise({ sessionId, exerciseId, orderIndex: index }, db);
  }

  return sessionId;
}

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
// independent booleans/ids, so two overlays can never be open at once by construction.
export type HistoryOverlay =
  | { kind: 'sheet'; sessionId: string }
  | { kind: 'rename'; sessionId: string }
  | { kind: 'delete'; sessionId: string }
  | null;

// The add-a-past-workout wizard's own step, separate from HistoryOverlay: it is reachable from
// both the populated top-level action and the empty-state affordance, neither of which names a row.
export type AddPastWorkoutStep = 'date' | 'exercises' | null;

export interface HistoryScreenViewProps {
  state: HistoryScreenState;
  rows: HistorySessionRow[];
  colors: ThemeColors;
  overlay: HistoryOverlay;
  addPastStep: AddPastWorkoutStep;
  addPastLocalDate: string;
  onRowPress: (sessionId: string) => void;
  onOverflowPress: (sessionId: string) => void;
  onEndReached: () => void;
  onAddPastWorkout: () => void;
  onRecords: () => void;
  onPendingDateChange: (date: Date, timezone: string) => void;
  onConfirmAddPastDate: () => void;
  onCancelAddPast: () => void;
  onConfirmAddPastExercises: (rows: PickerCatalogRow[]) => void;
  onSheetSelect: (action: HistoryRowActionId) => void;
  onCancelOverlay: () => void;
  onConfirmRename: (name: string) => void;
  onConfirmDelete: () => void;
}

// Hook-free — mirrors WorkoutScreenView's split from its own useWorkoutScreen hook. UI-SPEC E11:
// no loading state for the already-local first page (R6), so 'loading' renders an empty screen
// rather than a skeleton — this local read resolves near-instantly and the tab must never flash a
// spinner for it.
// The add-a-past-workout wizard's own two modals, layered above whichever state (empty or ready)
// exposes the entry point — a shared render so neither branch below duplicates the step logic.
function renderAddPastWorkoutModals({
  addPastStep,
  addPastLocalDate,
  onPendingDateChange,
  onConfirmAddPastDate,
  onCancelAddPast,
  onConfirmAddPastExercises,
}: Pick<HistoryScreenViewProps, 'addPastStep' | 'addPastLocalDate' | 'onPendingDateChange' | 'onConfirmAddPastDate' | 'onCancelAddPast' | 'onConfirmAddPastExercises'>) {
  return (
    <>
      {addPastStep === 'date' ? (
        <Modal transparent animationType="fade" onRequestClose={onCancelAddPast}>
          <View className="flex-1 items-center justify-center bg-background/80 px-lg">
            <View className="w-full max-w-[400px] gap-md rounded-md bg-surface p-lg">
              <Text className="text-heading font-semibold text-foreground">Add a Past Workout</Text>
              <SessionDateField localDate={addPastLocalDate} onChange={onPendingDateChange} />
              <View className="flex-row justify-end gap-sm">
                <Pressable
                  onPress={onCancelAddPast}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                  style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }}
                >
                  <Text className="text-body font-normal text-foreground-muted">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={onConfirmAddPastDate}
                  accessibilityRole="button"
                  accessibilityLabel="Next"
                  style={{ minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center' }}
                  className="rounded-md bg-accent px-md py-sm"
                >
                  <Text className="text-body font-semibold text-background">Next</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}

      {addPastStep === 'exercises' ? (
        <Modal animationType="slide" onRequestClose={onCancelAddPast}>
          <ExercisePickerModal dayName="this workout" onAdd={onConfirmAddPastExercises} onCancel={onCancelAddPast} />
        </Modal>
      ) : null}
    </>
  );
}

export function HistoryScreenView({
  state,
  rows,
  overlay,
  addPastStep,
  addPastLocalDate,
  onRowPress,
  onOverflowPress,
  onEndReached,
  onAddPastWorkout,
  onRecords,
  onPendingDateChange,
  onConfirmAddPastDate,
  onCancelAddPast,
  onConfirmAddPastExercises,
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
        <Pressable
          onPress={onRecords}
          accessibilityRole="button"
          accessibilityLabel="Records"
          style={{ minHeight: 48, justifyContent: 'center' }}
        >
          <Text className="text-body font-normal text-accent">Records</Text>
        </Pressable>

        {renderAddPastWorkoutModals({ addPastStep, addPastLocalDate, onPendingDateChange, onConfirmAddPastDate, onCancelAddPast, onConfirmAddPastExercises })}
      </View>
    );
  }

  const overlayRow = overlay ? rows.find((row) => row.id === overlay.sessionId) : undefined;

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row justify-between px-lg pt-md">
        <Pressable
          onPress={onRecords}
          accessibilityRole="button"
          accessibilityLabel="Records"
          style={{ minHeight: 48, justifyContent: 'center' }}
        >
          <Text className="text-body font-normal text-accent">Records</Text>
        </Pressable>
        <Pressable
          onPress={onAddPastWorkout}
          accessibilityRole="button"
          accessibilityLabel="Add a Past Workout"
          style={{ minHeight: 48, justifyContent: 'center' }}
        >
          <Text className="text-body font-normal text-accent">Add a Past Workout</Text>
        </Pressable>
      </View>

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

      {renderAddPastWorkoutModals({ addPastStep, addPastLocalDate, onPendingDateChange, onConfirmAddPastDate, onCancelAddPast, onConfirmAddPastExercises })}
    </View>
  );
}

export interface UseHistoryScreenOptions {
  userId: string | null;
  db?: WriteDb;
}

export type HistoryScreenViewModel = Omit<HistoryScreenViewProps, 'colors'>;

function todayPendingBackfill(): { date: Date; timezone: string } {
  const date = new Date();
  return { date, timezone: captureCalendarDay(date).timezone };
}

export function useHistoryScreen({ userId, db }: UseHistoryScreenOptions): HistoryScreenViewModel {
  const router = useRouter();
  const [page, setPage] = useState<HistoryPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [overlay, setOverlay] = useState<HistoryOverlay>(null);
  const [addPastStep, setAddPastStep] = useState<AddPastWorkoutStep>(null);
  const [pendingBackfill, setPendingBackfill] = useState(todayPendingBackfill);

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
      if (action === 'edit') {
        // Navigates to the SAME workout route the live screen renders, carrying the session id —
        // resolveSessionScreenMode (session-mode.tsx) resolves it to `editing` mode, never a
        // separate history editor (D-32, LOG-20).
        setOverlay(null);
        router.push(`${WORKOUT_TAB_ROUTE}?sessionId=${sessionId}`);
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
          await duplicateSession({ sourceSessionId: sessionId, userId }, db);
          router.push(WORKOUT_TAB_ROUTE);
        } catch (error) {
          console.error('duplicate session failed', error);
        }
      })();
    },
    [overlay, db, router, userId],
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

  // The add-a-past-workout wizard (D-33): step 1 picks the date (defaulting to today, changeable
  // through SessionDateField), step 2 picks exercises through the unmodified ExercisePickerModal —
  // then startBackfilledSession funnels through the one session-creation path and the screen
  // navigates straight into the editing screen with the date already chosen.
  const handleAddPastWorkout = useCallback(() => {
    setPendingBackfill(todayPendingBackfill());
    setAddPastStep('date');
  }, []);

  const handlePendingDateChange = useCallback((date: Date, timezone: string) => {
    setPendingBackfill({ date, timezone });
  }, []);

  const handleConfirmAddPastDate = useCallback(() => {
    setAddPastStep('exercises');
  }, []);

  const handleCancelAddPast = useCallback(() => {
    setAddPastStep(null);
  }, []);

  const handleConfirmAddPastExercises = useCallback(
    (rows: PickerCatalogRow[]) => {
      setAddPastStep(null);
      if (rows.length === 0) return;

      void (async () => {
        try {
          const sessionId = await startBackfilledSession(
            { date: pendingBackfill.date, timezone: pendingBackfill.timezone, exerciseIds: rows.map((row) => row.id), userId },
            db,
          );
          router.push(`${WORKOUT_TAB_ROUTE}?sessionId=${sessionId}`);
        } catch (error) {
          console.error('backfill session failed', error);
        }
      })();
    },
    [pendingBackfill, db, router, userId],
  );

  return {
    state: deriveHistoryScreenState({ failed, page }),
    rows: page?.rows ?? [],
    overlay,
    addPastStep,
    addPastLocalDate: captureCalendarDay(pendingBackfill.date, pendingBackfill.timezone).localDate,
    onRowPress: (sessionId) => router.push(`/workout-summary?sessionId=${sessionId}`),
    onOverflowPress: (sessionId) => setOverlay({ kind: 'sheet', sessionId }),
    onEndReached: handleEndReached,
    onAddPastWorkout: handleAddPastWorkout,
    onRecords: () => router.push('/records'),
    onPendingDateChange: handlePendingDateChange,
    onConfirmAddPastDate: handleConfirmAddPastDate,
    onCancelAddPast: handleCancelAddPast,
    onConfirmAddPastExercises: handleConfirmAddPastExercises,
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
