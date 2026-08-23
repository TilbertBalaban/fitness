import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { TabView } from 'react-native-tab-view';

export interface ExercisePagerExercise {
  id: string;
}

export interface ExercisePagerRoute {
  key: string;
  title: string;
}

// Routes are derived from the exercise order every render, never stored separately — the pager's
// page order and the caller's exercise order (session_exercise.order_index) can never drift apart.
export function exercisePagerRoutes(exercises: ExercisePagerExercise[]): ExercisePagerRoute[] {
  return exercises.map((exercise) => ({ key: exercise.id, title: exercise.id }));
}

// Clamps into [0, exerciseCount - 1] — an exercise removed mid-session (a later plan's swap/remove
// action) must not throw or blank the pager, the same way DayDeck.tsx's clampDeckIndex protects a
// deleted program day.
export function clampPagerIndex(index: number, exerciseCount: number): number {
  if (exerciseCount <= 0) return 0;
  if (index < 0) return 0;
  if (index > exerciseCount - 1) return exerciseCount - 1;
  return index;
}

export interface ExercisePagerViewProps<T extends ExercisePagerExercise> {
  exercises: T[];
  index: number;
  onIndexChange: (index: number) => void;
  renderExercise: (exercise: T) => ReactNode;
  width: number;
}

// Hook-free — direct-invocable by a test, matching DayDeckView. Re-clamps its own `index` prop
// defensively (not just relying on the stateful wrapper below) so a caller passing a now-stale
// index after an exercise was removed still renders a real page rather than an empty pager.
export function ExercisePagerView<T extends ExercisePagerExercise>({
  exercises,
  index,
  onIndexChange,
  renderExercise,
  width,
}: ExercisePagerViewProps<T>) {
  if (exercises.length === 0) return null;

  const routes = exercisePagerRoutes(exercises);
  const safeIndex = clampPagerIndex(index, exercises.length);

  return (
    <TabView
      navigationState={{ index: safeIndex, routes }}
      onIndexChange={onIndexChange}
      renderScene={({ route }) => {
        const exercise = exercises.find((candidate) => candidate.id === route.key);
        return exercise ? renderExercise(exercise) : null;
      }}
      renderTabBar={() => null}
      swipeEnabled
      initialLayout={{ width }}
      keyboardDismissMode="on-drag"
      style={{ flex: 1 }}
    />
  );
}

export interface ExercisePagerProps<T extends ExercisePagerExercise> {
  exercises: T[];
  renderExercise: (exercise: T) => ReactNode;
}

// Thin stateful wrapper mirroring DayDeck — owns the controlled page index and re-clamps it
// whenever the exercise list shrinks. workout.tsx's own composition shares one index between the
// strip and the pager instead (05-UI-SPEC's requirement), so it uses ExercisePagerView directly
// rather than this wrapper; this component exists so a future caller with no reason to share the
// index externally gets the same self-contained surface every other *Deck/*Strip pair offers.
export function ExercisePager<T extends ExercisePagerExercise>({ exercises, renderExercise }: ExercisePagerProps<T>) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex((current) => clampPagerIndex(current, exercises.length));
  }, [exercises.length]);

  return (
    <ExercisePagerView
      exercises={exercises}
      index={clampPagerIndex(index, exercises.length)}
      onIndexChange={setIndex}
      renderExercise={renderExercise}
      width={width}
    />
  );
}
