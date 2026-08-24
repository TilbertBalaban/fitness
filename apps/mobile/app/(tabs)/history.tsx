import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SessionHistoryRow } from '@/components/SessionHistoryRow';
import { authClient } from '@/lib/auth-client';
import type { WriteDb } from '@/lib/db/powersync';
import { loadHistoryPage, type HistoryPage, type HistorySessionRow } from '@/lib/db/history-query';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

const PAGE_SIZE = 25;
// 05-10 reads this flag from the workout route to open it in `editing` mode for a new past-dated
// session (D-32/D-33) — this plan only renders the entry point and navigates with it.
const ADD_PAST_WORKOUT_ROUTE = '/(tabs)/workout?addPast=1';

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

export interface HistoryScreenViewProps {
  state: HistoryScreenState;
  rows: HistorySessionRow[];
  colors: ThemeColors;
  onRowPress: (sessionId: string) => void;
  onOverflowPress: (sessionId: string) => void;
  onEndReached: () => void;
  onAddPastWorkout: () => void;
}

// Hook-free — mirrors WorkoutScreenView's split from its own useWorkoutScreen hook. UI-SPEC E11:
// no loading state for the already-local first page (R6), so 'loading' renders an empty screen
// rather than a skeleton — this local read resolves near-instantly and the tab must never flash a
// spinner for it.
export function HistoryScreenView({
  state,
  rows,
  onRowPress,
  onOverflowPress,
  onEndReached,
  onAddPastWorkout,
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
  onRowPress: (sessionId: string) => void;
  onOverflowPress: (sessionId: string) => void;
  onEndReached: () => void;
  onAddPastWorkout: () => void;
}

export function useHistoryScreen({ userId, db }: UseHistoryScreenOptions): HistoryScreenViewModel {
  const router = useRouter();
  const [page, setPage] = useState<HistoryPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

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

  return {
    state: deriveHistoryScreenState({ failed, page }),
    rows: page?.rows ?? [],
    onRowPress: (sessionId) => router.push(`/workout-summary?sessionId=${sessionId}`),
    // Task 3 replaces this with the real HistoryActionSheet open/close wiring.
    onOverflowPress: () => {},
    onEndReached: handleEndReached,
    onAddPastWorkout: () => router.push(ADD_PAST_WORKOUT_ROUTE),
  };
}

export default function HistoryScreen() {
  const colors = useThemeColors();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;
  const vm = useHistoryScreen({ userId });

  return <HistoryScreenView {...vm} colors={colors} />;
}
