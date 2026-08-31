import { weeklyProgress, type TrendSessionInput, type WeeklyProgressResult } from '@fitness/analytics-engine';
import { WIDGET_KIND_SET, type WeightUnit, type WidgetKind } from '@fitness/api-contracts';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { captureCalendarDay } from '@/lib/calendar-day';
import type { DashboardWidgetRow } from '@/lib/db/dashboard-widgets';
import { loadHistoryTrend } from '@/lib/db/history-trend-query';
import { loadWeightUnit } from '@/lib/db/preferences';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { sortByOrderThenId } from '@/lib/db/programs/order-index';
import { loadWeeklyProgress, type LoadWeeklyProgressInput, type WeeklyProgressData } from '@/lib/db/weekly-progress-query';
import { BodyweightTrendWidget } from './BodyweightTrendWidget';
import { HistoryTrendCard } from './HistoryTrendCard';
import { MuscleHeatmapWidget } from './MuscleHeatmapWidget';
import { NextUpWidget } from './NextUpWidget';
import { RecentRecordsWidget } from './RecentRecordsWidget';
import { WeeklyProgressCard } from './WeeklyProgressCard';

export interface KnownWidget {
  id: string;
  kind: WidgetKind;
  position: number;
}

// Filters BEFORE mapping — never a switch's `default: throw` (D-22, R26, RESEARCH.md Pitfall 5).
// A row whose widget_kind this build has never heard of, or whose enabled is false, is excluded
// here and never reaches the dispatch table below; the call never raises either way.
export function resolveDashboardWidgets(rows: DashboardWidgetRow[]): KnownWidget[] {
  const known = rows.filter((row) => row.enabled && WIDGET_KIND_SET.has(row.widgetKind));
  const ordered = sortByOrderThenId(known.map((row) => ({ ...row, orderIndex: row.position })));
  return ordered.map((row) => ({ id: row.id, kind: row.widgetKind as WidgetKind, position: row.position }));
}

export type WeeklyProgressRead = { data: WeeklyProgressResult } | { failed: true };

// weekly_progress's own read — WeeklyProgressCard.tsx is reused verbatim (D-23), so the fetch this
// card needs lives here, at the dispatch layer, rather than inside that unedited file.
export async function readWeeklyProgress(
  userId: string | null,
  todayLocalDate: string,
  load: (input: LoadWeeklyProgressInput) => Promise<WeeklyProgressData> = (input) => loadWeeklyProgress(input),
): Promise<WeeklyProgressRead> {
  try {
    const { sessions, programTarget } = await load({ userId, todayLocalDate });
    return { data: weeklyProgress({ todayLocalDate, sessions, programTarget }) };
  } catch (error) {
    console.error('weekly progress load failed', error);
    return { failed: true };
  }
}

// Absent entirely on empty/error — Phase 9's shipped behavior for this card, untouched (R29: this
// widget owns its own failure handling, the host never renders on its behalf).
function WeeklyProgressWidget({ userId, db }: { userId: string | null; db?: WriteDb }) {
  const [weekly, setWeekly] = useState<WeeklyProgressResult | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        const result = await readWeeklyProgress(userId, captureCalendarDay(new Date()).localDate, (input) =>
          loadWeeklyProgress(input, db ?? getPowerSync()),
        );
        if (!active) return;
        setWeekly('failed' in result ? null : result.data);
      })();

      return () => {
        active = false;
      };
    }, [userId, db]),
  );

  if (!weekly) return null;
  return <WeeklyProgressCard progress={weekly} />;
}

interface HistoryTrendReadState {
  sessions: TrendSessionInput[] | null;
  todayLocalDate: string;
  weightUnit: WeightUnit;
}

const HISTORY_TREND_INITIAL_STATE: HistoryTrendReadState = {
  sessions: null,
  todayLocalDate: '',
  weightUnit: 'kg',
};

// history_trend's own read — HistoryTrendCard.tsx is reused verbatim (D-23); it already renders
// null for a null/empty result (R29), so this wrapper's only job is the fetch.
function HistoryTrendWidget({ userId, db }: { userId: string | null; db?: WriteDb }) {
  const [state, setState] = useState<HistoryTrendReadState>(HISTORY_TREND_INITIAL_STATE);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        const todayLocalDate = captureCalendarDay(new Date()).localDate;
        try {
          const resolvedDb = db ?? getPowerSync();
          const [sessions, weightUnit] = await Promise.all([
            loadHistoryTrend({ userId, todayLocalDate }, resolvedDb),
            userId ? loadWeightUnit(userId, resolvedDb) : Promise.resolve<WeightUnit>('kg'),
          ]);
          if (!active) return;
          setState({ sessions, todayLocalDate, weightUnit });
        } catch (error) {
          console.error('history trend load failed', error);
          if (active) setState({ sessions: [], todayLocalDate, weightUnit: 'kg' });
        }
      })();

      return () => {
        active = false;
      };
    }, [userId, db]),
  );

  return (
    <HistoryTrendCard sessions={state.sessions} todayLocalDate={state.todayLocalDate} weightUnit={state.weightUnit} />
  );
}

export interface DashboardWidgetHostProps {
  widgets: KnownWidget[];
  userId: string | null;
  db?: WriteDb;
}

// Maps the already-filtered KnownWidget list through a dispatch table — the filter happened in
// resolveDashboardWidgets, so this map has no unknown-kind branch to guard (D-22). Each widget owns
// its own empty/loading/error rendering; this host renders none of those on a widget's behalf.
export function DashboardWidgetHost({ widgets, userId, db }: DashboardWidgetHostProps) {
  return (
    <>
      {widgets.map((widget) => {
        if (widget.kind === 'next_up') return <NextUpWidget key={widget.id} userId={userId} db={db} />;
        if (widget.kind === 'weekly_progress') return <WeeklyProgressWidget key={widget.id} userId={userId} db={db} />;
        if (widget.kind === 'recent_records') return <RecentRecordsWidget key={widget.id} userId={userId} db={db} />;
        if (widget.kind === 'muscle_heatmap') return <MuscleHeatmapWidget key={widget.id} userId={userId} db={db} />;
        if (widget.kind === 'bodyweight_trend') return <BodyweightTrendWidget key={widget.id} userId={userId} db={db} />;
        if (widget.kind === 'history_trend') return <HistoryTrendWidget key={widget.id} userId={userId} db={db} />;
        return null;
      })}
    </>
  );
}
