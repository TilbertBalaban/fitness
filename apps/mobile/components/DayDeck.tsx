import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { TabView } from 'react-native-tab-view';

export interface DayDeckDay {
  id: string;
  name: string;
}

export interface DayRoute {
  key: string;
  title: string;
}

// Routes are derived from the day order every render, never stored separately — the deck's page
// order and the caller's day order (already sorted by loadProgramTree via sortByOrderThenId) can
// never drift apart.
export function dayRoutes(days: DayDeckDay[]): DayRoute[] {
  return days.map((day) => ({ key: day.id, title: day.name }));
}

// Clamps into [0, dayCount - 1]; a zero-day program always resolves to 0 rather than a negative
// index, and a stale index past the end (a day was deleted) resolves to the new last day rather
// than throwing or rendering a blank page.
export function clampDeckIndex(index: number, dayCount: number): number {
  if (dayCount <= 0) return 0;
  if (index < 0) return 0;
  if (index > dayCount - 1) return dayCount - 1;
  return index;
}

export interface DayDeckViewProps<T extends DayDeckDay> {
  days: T[];
  index: number;
  onIndexChange: (index: number) => void;
  renderDay: (day: T) => ReactNode;
  width: number;
}

// Hook-free — direct-invocable by a test. Re-clamps its own `index` prop defensively (not just
// relying on the stateful wrapper below) so a caller that passes a now-stale index after a day was
// deleted still renders a real page rather than an empty pager.
export function DayDeckView<T extends DayDeckDay>({ days, index, onIndexChange, renderDay, width }: DayDeckViewProps<T>) {
  if (days.length === 0) {
    return (
      <View className="items-center gap-sm py-xl">
        <Text className="text-center text-heading font-semibold text-foreground">No days yet</Text>
        <Text className="text-center text-body font-normal text-foreground-muted">
          Add your first day to start building.
        </Text>
      </View>
    );
  }

  const routes = dayRoutes(days);
  const safeIndex = clampDeckIndex(index, days.length);

  return (
    <TabView
      navigationState={{ index: safeIndex, routes }}
      onIndexChange={onIndexChange}
      renderScene={({ route }) => {
        const day = days.find((d) => d.id === route.key);
        return day ? renderDay(day) : null;
      }}
      renderTabBar={() => null}
      swipeEnabled
      initialLayout={{ width }}
      keyboardDismissMode="on-drag"
      style={{ flex: 1 }}
    />
  );
}

export interface DayDeckProps<T extends DayDeckDay> {
  days: T[];
  renderDay: (day: T) => ReactNode;
}

// Thin stateful wrapper — owns the controlled page index (component state, no zustand, matching
// this phase's established precedent) and re-clamps it whenever the day list shrinks, so deleting
// the third of four days does not throw the user back to the first page.
export function DayDeck<T extends DayDeckDay>({ days, renderDay }: DayDeckProps<T>) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex((current) => clampDeckIndex(current, days.length));
  }, [days.length]);

  return (
    <DayDeckView
      days={days}
      index={clampDeckIndex(index, days.length)}
      onIndexChange={setIndex}
      renderDay={renderDay}
      width={width}
    />
  );
}
