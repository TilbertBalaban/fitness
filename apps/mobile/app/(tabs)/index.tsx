import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { DashboardWidgetHost, resolveDashboardWidgets, type KnownWidget } from '@/components/DashboardWidgetHost';
import { PrimaryButton } from '@/components/PrimaryButton';
import { WorkoutInProgressBanner } from '@/components/WorkoutInProgressBanner';
import { authClient } from '@/lib/auth-client';
import { loadOrMaterializeDashboardWidgets } from '@/lib/db/dashboard-widgets';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { discardSession, loadInProgressSessionSummary, type InProgressSessionSummary } from '@/lib/db/session-lifecycle';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

// Widget-list-area first-paint skeleton, distinct from NextUpWidget's own (12-UI-SPEC design
// decision 2 retires the old screen-level HomeScreenState machine for everything except this
// pinned chrome + the widget-list read itself).
const SKELETON_ROW_COUNT = 3;

export type InProgressRead = { data: InProgressSessionSummary | null } | { failed: true };

// D-28's cost constraint lives here, not just in the render: a signed-out call never reaches
// `load` at all. A rejection (the E8 backstop UI-state) is reported distinctly from "no session"
// so the caller can tell the two apart even though both collapse to "banner absent" below.
export async function readInProgressSession(
  userId: string | null,
  load: (id: string) => Promise<InProgressSessionSummary | null> = (id) => loadInProgressSessionSummary(id, getPowerSync()),
): Promise<InProgressRead> {
  if (!userId) return { data: null };
  try {
    return { data: await load(userId) };
  } catch (error) {
    console.error('in-progress session load failed', error);
    return { failed: true };
  }
}

export interface HomeDashboardViewProps {
  colors: ThemeColors;
  userId: string | null;
  db?: WriteDb;
  inProgress: InProgressSessionSummary | null;
  widgets: KnownWidget[] | null;
  pickerOpen: boolean;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  onOpenQuickActions: () => void;
  onResumeSession: () => void;
  onDiscardSession: () => void;
  onBrowseExercises: () => void;
}

// Hook-free — every state this screen can render is a prop, matching NextUpWidget/
// DashboardWidgetHost's own split, so the states are unit testable without a renderer.
export function HomeDashboardView({
  colors,
  userId,
  db,
  inProgress,
  widgets,
  pickerOpen,
  onOpenPicker,
  onClosePicker,
  onOpenQuickActions,
  onResumeSession,
  onDiscardSession,
  onBrowseExercises,
}: HomeDashboardViewProps) {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 }}
    >
      <View className="mt-xl gap-lg">
        {/* Both controls keep working in every screen state, including mid-error and
            mid-loading — neither depends on the widget-list read (12-UI-SPEC "Home header row"). */}
        <View className="flex-row items-center justify-between px-lg pt-md">
          <Pressable
            onPress={onOpenQuickActions}
            accessibilityRole="button"
            accessibilityLabel="Quick Actions"
            style={{ minHeight: 48 }}
            className="flex-row items-center gap-xs"
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
            <Text className="text-body font-normal text-accent">Quick Actions</Text>
          </Pressable>
          <Pressable
            onPress={pickerOpen ? onClosePicker : onOpenPicker}
            accessibilityRole="button"
            accessibilityLabel={pickerOpen ? 'Done editing dashboard' : 'Edit Dashboard'}
            style={{ minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text className="text-body font-normal text-accent">{pickerOpen ? 'Done' : 'Edit'}</Text>
          </Pressable>
        </View>

        {inProgress ? (
          <WorkoutInProgressBanner
            session={{
              id: inProgress.id,
              startedAtMs: new Date(inProgress.startedAt).getTime(),
              accumulatedPausedSeconds: inProgress.accumulatedPausedSeconds,
              pausedAtMs: inProgress.pausedAt ? new Date(inProgress.pausedAt).getTime() : null,
            }}
            onResume={onResumeSession}
            onDiscard={onDiscardSession}
          />
        ) : null}

        <View className="gap-lg">
          {widgets === null ? (
            Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
              <View key={index} className="rounded-md bg-surface" style={{ height: 64 }} />
            ))
          ) : (
            <DashboardWidgetHost widgets={widgets} userId={userId} db={db} />
          )}
        </View>

        <View className="items-center">
          <PrimaryButton label="Browse exercises" onPress={onBrowseExercises} />
        </View>
      </View>
    </ScrollView>
  );
}

export interface HomeScreenProps {
  userId?: string;
  db?: WriteDb;
}

export default function HomeScreen({ userId: userIdOverride, db }: HomeScreenProps = {}) {
  const router = useRouter();
  const colors = useThemeColors();
  const session = authClient.useSession();
  const userId = userIdOverride ?? session.data?.user?.id ?? null;
  const [inProgress, setInProgress] = useState<InProgressSessionSummary | null>(null);
  const [widgets, setWidgets] = useState<KnownWidget[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Mounts nothing yet — 12-08 mounts QuickActionSheet on this flag. Held here now so the header
  // row's Quick Actions control has a real state to set rather than a placeholder no-op.
  const [, setQuickActionsOpen] = useState(false);

  // A second, independent focus read — the in-progress banner is pinned chrome, not part of the
  // widget-list read below, and must not gate or be gated by it: a failed widget read must not
  // hide a real in-progress session, and vice versa.
  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        const result = await readInProgressSession(userId, (id) => loadInProgressSessionSummary(id, db ?? getPowerSync()));
        if (!active) return;
        // A query failure (the E8 backstop) is a deliberate, pinned choice to render identically
        // to "no in-progress session" — the banner's absence either way.
        setInProgress('failed' in result ? null : result.data);
      })();

      return () => {
        active = false;
      };
    }, [userId, db]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        setWidgets([]);
        return;
      }
      let active = true;

      void (async () => {
        try {
          const rows = await loadOrMaterializeDashboardWidgets(userId, db ?? getPowerSync());
          if (!active) return;
          setWidgets(resolveDashboardWidgets(rows));
        } catch (error) {
          console.error('dashboard widgets load failed', error);
          if (active) setWidgets([]);
        }
      })();

      return () => {
        active = false;
      };
    }, [userId, db]),
  );

  return (
    <HomeDashboardView
      colors={colors}
      userId={userId}
      db={db}
      inProgress={inProgress}
      widgets={widgets}
      pickerOpen={pickerOpen}
      onOpenPicker={() => setPickerOpen(true)}
      onClosePicker={() => setPickerOpen(false)}
      onOpenQuickActions={() => setQuickActionsOpen(true)}
      onResumeSession={() => router.push('/(tabs)/workout')}
      onDiscardSession={async () => {
        if (inProgress) await discardSession(inProgress.id);
        setInProgress(null);
      }}
      onBrowseExercises={() => router.push('/exercises')}
    />
  );
}
