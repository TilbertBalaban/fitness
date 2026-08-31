import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { BodyMetricKind } from '@fitness/api-contracts';
import { DashboardWidgetHost, resolveDashboardWidgets, type KnownWidget } from '@/components/DashboardWidgetHost';
import { DashboardWidgetPicker } from '@/components/DashboardWidgetPicker';
import { MetricEntrySheet } from '@/components/MetricEntrySheet';
import { PhotoCaptureConfirmSheet } from '@/components/PhotoCaptureConfirmSheet';
import { PrimaryButton } from '@/components/PrimaryButton';
import { QuickActionSheet, resolveQuickAction, type QuickActionId } from '@/components/QuickActionSheet';
import { WorkoutInProgressBanner } from '@/components/WorkoutInProgressBanner';
import { authClient } from '@/lib/auth-client';
import { loadTrackedKinds } from '@/lib/db/body-metrics';
import { loadOrMaterializeDashboardWidgets } from '@/lib/db/dashboard-widgets';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { discardSession, loadInProgressSessionSummary, type InProgressSessionSummary } from '@/lib/db/session-lifecycle';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';
import { capturePhoto } from '@/lib/photos/capture';
import { downscalePhoto } from '@/lib/photos/downscale';

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

export type DashboardState = 'error' | 'loading' | 'empty' | 'ready';

export interface DashboardStateInput {
  failed: boolean;
  widgets: KnownWidget[] | null;
}

// The widget-list-area's own state machine (12-UI-SPEC S1 States), shaped like the retired
// deriveHomeScreenState (design decision 2) but scoped to the dashboard_widget row read alone —
// it never gates on, and is never gated by, the pinned chrome above it. `empty` covers only a
// genuine zero-enabled-widget result (D-24); `loadOrMaterializeDashboardWidgets` (D-26) means a
// first-run user never actually reaches this branch, since it always returns real default rows.
export function deriveDashboardState({ failed, widgets }: DashboardStateInput): DashboardState {
  if (failed) return 'error';
  if (widgets === null) return 'loading';
  if (widgets.length === 0) return 'empty';
  return 'ready';
}

export interface QuickActionHandlers {
  dismiss: () => void;
  navigate: (route: string) => void;
  openMetricEntry: (kind: BodyMetricKind) => void;
  openMeasurementPicker: () => void;
  openPhotoCapture: () => void;
}

// The whole dispatch decision, extracted so R30's dismiss-before-navigate ordering is exercised
// without a renderer — same technique as readInProgressSession/deriveDashboardState above. dismiss
// fires unconditionally, before either branch, which is what makes "a pure-navigation destination
// dismisses the sheet before navigating" true by construction rather than by call-site discipline.
export function dispatchQuickAction(id: QuickActionId, handlers: QuickActionHandlers): void {
  const destination = resolveQuickAction(id);
  handlers.dismiss();
  if (destination.kind === 'navigate') {
    handlers.navigate(destination.route);
    return;
  }
  if (id === 'quick_weigh_in') {
    handlers.openMetricEntry('bodyweight');
    return;
  }
  if (id === 'quick_measurement') {
    handlers.openMeasurementPicker();
    return;
  }
  handlers.openPhotoCapture();
}

export interface HomeDashboardViewProps {
  colors: ThemeColors;
  userId: string | null;
  db?: WriteDb;
  inProgress: InProgressSessionSummary | null;
  widgetsFailed: boolean;
  widgets: KnownWidget[] | null;
  pickerOpen: boolean;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  quickActionsOpen: boolean;
  onOpenQuickActions: () => void;
  onCloseQuickActions: () => void;
  onSelectQuickAction: (id: QuickActionId) => void;
  // null closed; { kind: null } opens on the Quick Measurement kind picker; { kind: 'bodyweight' }
  // (or another named kind) opens straight to the value field, skipping the picker step entirely.
  metricEntry: { kind: BodyMetricKind | null } | null;
  trackedKinds: ReadonlySet<BodyMetricKind>;
  onCancelMetricEntry: () => void;
  onMetricLogged: () => void;
  // Present once capturePhoto()+downscalePhoto() have both resolved — this sheet never shows the
  // raw, unbounded original (D-17, matching progress-photos.tsx's own handleAddPhoto shape).
  pendingPhotoCapture: { photoUri: string; bytes: Uint8Array } | null;
  onSavedPhotoCapture: () => void;
  onDiscardPhotoCapture: () => void;
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
  widgetsFailed,
  widgets,
  pickerOpen,
  onOpenPicker,
  onClosePicker,
  quickActionsOpen,
  onOpenQuickActions,
  onCloseQuickActions,
  onSelectQuickAction,
  metricEntry,
  trackedKinds,
  onCancelMetricEntry,
  onMetricLogged,
  pendingPhotoCapture,
  onSavedPhotoCapture,
  onDiscardPhotoCapture,
  onResumeSession,
  onDiscardSession,
  onBrowseExercises,
}: HomeDashboardViewProps) {
  const dashboardState = deriveDashboardState({ failed: widgetsFailed, widgets });
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
          {/* R6 — a local SQLite read renders no spinner; only the very first paint shows the
              skeleton pattern already shipped on the Programs tab. */}
          {dashboardState === 'loading' ? (
            Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
              <View key={index} className="rounded-md bg-surface" style={{ height: 64 }} />
            ))
          ) : null}

          {dashboardState === 'error' ? (
            <View className="gap-sm">
              <Text className="text-heading font-semibold text-foreground">{"Dashboard couldn't load"}</Text>
              <Text className="text-body font-normal text-foreground-muted">
                Restart the app to try again. Your programs and history are safe.
              </Text>
            </View>
          ) : null}

          {dashboardState === 'empty' ? (
            <View className="items-center gap-sm">
              <Text className="text-heading font-semibold text-foreground">No widgets on your dashboard</Text>
              <Text className="text-body font-normal text-foreground-muted">
                Add a widget to see your progress at a glance.
              </Text>
              <PrimaryButton label="Add Widgets" onPress={onOpenPicker} />
            </View>
          ) : null}

          {dashboardState === 'ready' && widgets ? <DashboardWidgetHost widgets={widgets} userId={userId} db={db} /> : null}
        </View>

        <View className="items-center">
          <PrimaryButton label="Browse exercises" onPress={onBrowseExercises} />
        </View>
      </View>

      {pickerOpen ? (
        <DashboardWidgetPicker userId={userId} db={db} widgets={widgets} onDone={onClosePicker} />
      ) : null}

      {quickActionsOpen ? <QuickActionSheet onSelect={onSelectQuickAction} onCancel={onCloseQuickActions} /> : null}

      {metricEntry && userId ? (
        <MetricEntrySheet
          userId={userId}
          kind={metricEntry.kind}
          trackedKinds={trackedKinds}
          db={db}
          onCancel={onCancelMetricEntry}
          onLogged={onMetricLogged}
        />
      ) : null}

      {pendingPhotoCapture && userId ? (
        <PhotoCaptureConfirmSheet
          userId={userId}
          photoUri={pendingPhotoCapture.photoUri}
          bytes={pendingPhotoCapture.bytes}
          db={db}
          onSaved={onSavedPhotoCapture}
          onDiscard={onDiscardPhotoCapture}
        />
      ) : null}
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
  const [widgetsFailed, setWidgetsFailed] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  // null closed; { kind: null } opens on the Quick Measurement kind picker; a named kind (Quick
  // Weigh-In's 'bodyweight') opens straight to the value field (D-29).
  const [metricEntry, setMetricEntry] = useState<{ kind: BodyMetricKind | null } | null>(null);
  const [trackedKinds, setTrackedKinds] = useState<ReadonlySet<BodyMetricKind>>(new Set());
  const [pendingPhotoCapture, setPendingPhotoCapture] = useState<{ photoUri: string; bytes: Uint8Array } | null>(null);

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

  // Guards every setWidgets*/setWidgetsFailed call below against a late-arriving response after
  // this screen has unmounted — the same race the original per-effect `active` flag closed, kept
  // as a ref rather than a per-call local so onClosePicker's own reload (outside useFocusEffect)
  // gets the identical protection.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadWidgets = useCallback(async () => {
    if (!userId) {
      if (mountedRef.current) setWidgets([]);
      return;
    }
    try {
      const rows = await loadOrMaterializeDashboardWidgets(userId, db ?? getPowerSync());
      if (!mountedRef.current) return;
      setWidgets(resolveDashboardWidgets(rows));
      setWidgetsFailed(false);
    } catch (error) {
      console.error('dashboard widgets load failed', error);
      if (mountedRef.current) setWidgetsFailed(true);
    }
  }, [userId, db]);

  useFocusEffect(
    useCallback(() => {
      void loadWidgets();
    }, [loadWidgets]),
  );

  // Quick Measurement's own kind-picker chip set — loaded lazily right before the sheet opens,
  // matching body-metrics.tsx's own reload-then-open shape, rather than kept live on every focus.
  async function handleOpenMeasurementPicker() {
    if (!userId) return;
    try {
      const tracked = await loadTrackedKinds(userId, db ?? getPowerSync());
      setTrackedKinds(tracked);
    } catch (error) {
      console.error('tracked kinds load failed', error);
    }
    setMetricEntry({ kind: null });
  }

  // Opens capture directly — native picker / web file input, then the same downscale step
  // progress-photos.tsx's own handleAddPhoto runs — rather than routing to the gallery (D-28's
  // "Progress Photo" row, UI-SPEC S3 destination table).
  async function handleOpenPhotoCapture() {
    const captured = await capturePhoto();
    if (!captured) return;
    const downscaled = await downscalePhoto(captured);
    setPendingPhotoCapture({ photoUri: downscaled.uri, bytes: downscaled.bytes });
  }

  function handleSelectQuickAction(id: QuickActionId) {
    dispatchQuickAction(id, {
      dismiss: () => setQuickActionsOpen(false),
      navigate: (route) => router.push(route),
      openMetricEntry: (kind) => setMetricEntry({ kind }),
      openMeasurementPicker: () => void handleOpenMeasurementPicker(),
      openPhotoCapture: () => void handleOpenPhotoCapture(),
    });
  }

  return (
    <HomeDashboardView
      colors={colors}
      userId={userId}
      db={db}
      inProgress={inProgress}
      widgetsFailed={widgetsFailed}
      widgets={widgets}
      pickerOpen={pickerOpen}
      onOpenPicker={() => setPickerOpen(true)}
      onClosePicker={() => {
        setPickerOpen(false);
        void loadWidgets();
      }}
      quickActionsOpen={quickActionsOpen}
      onOpenQuickActions={() => setQuickActionsOpen(true)}
      onCloseQuickActions={() => setQuickActionsOpen(false)}
      onSelectQuickAction={handleSelectQuickAction}
      metricEntry={metricEntry}
      trackedKinds={trackedKinds}
      onCancelMetricEntry={() => setMetricEntry(null)}
      onMetricLogged={() => setMetricEntry(null)}
      pendingPhotoCapture={pendingPhotoCapture}
      onSavedPhotoCapture={() => setPendingPhotoCapture(null)}
      onDiscardPhotoCapture={() => setPendingPhotoCapture(null)}
      onResumeSession={() => router.push('/(tabs)/workout')}
      onDiscardSession={async () => {
        if (inProgress) await discardSession(inProgress.id);
        setInProgress(null);
      }}
      onBrowseExercises={() => router.push('/exercises')}
    />
  );
}
