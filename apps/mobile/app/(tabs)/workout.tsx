import { fromCanonicalKg, toCanonicalKg, WORKING_SET_TYPE, type EquipmentType, type WeightUnit } from '@fitness/api-contracts';
import { eq, inArray } from 'drizzle-orm';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import {
  applyKeypadPress,
  nextKeypadField,
  NumericKeypadView,
  type KeypadField,
  type KeypadPress,
  type PlateStripBandData,
} from '@/components/NumericKeypad';
import { type SetRowValues } from '@/components/SetRow';
import { countCompletedWorkingSets, ExerciseStripView, type ExerciseStripExercise } from '@/components/ExerciseStrip';
import { clampPagerIndex, ExercisePagerView } from '@/components/ExercisePager';
import { ExercisePage } from '@/components/ExercisePage';
import { ExercisePickerModal, type PickerCatalogRow } from '@/components/ExercisePickerModal';
import { EditingWorkoutRoute } from '@/components/EditingWorkoutScreen';
import { NoteSheet } from '@/components/NoteSheet';
import { BackgroundAlertsOffNote, NotificationPermissionPromptView } from '@/components/NotificationPermissionPrompt';
import { RestTimerBar } from '@/components/RestTimerBar';
import { DiscardWorkoutDialog } from '@/components/WorkoutInProgressBanner';
import { authClient } from '@/lib/auth-client';
import {
  achievableBarbellLoads,
  achievableDumbbellLoads,
  resolveEquipmentBand,
  roundToAchievable,
  type EquipmentBandState,
  type ResolvedInventory,
} from '@fitness/plate-math';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { logSet, startWorkoutFromProgram, updateLoggedSet } from '@/lib/db/log-set';
import { loadNextUp, type NextUpData } from '@/lib/db/programs/next-up-query';
import type { ProgramCycle, ProgramDay } from '@/lib/db/programs/load-program';
import { loadWorkoutPreferences } from '@/lib/db/preferences';
import { addExerciseToSession } from '@/lib/db/session-mutations';
import { discardSession, pauseSession, resumeSession, startOneOffSession } from '@/lib/db/session-lifecycle';
import { loadSessionInventory, restampSessionGym } from '@/lib/db/session-equipment';
import { SwitchGymSheet } from '@/components/SwitchGymSheet';
import {
  loadLiveSession,
  previousSetReferencesForSession,
  referenceKey,
  type LiveSessionData,
  type LoggedSetRow,
  type PreviousSetReferenceMap,
} from '@/lib/db/session-query';
// exerciseTable/seededExerciseTable, not the bare schema names — this file already uses `exercise`
// as a loop/parameter identifier for SessionExerciseRow throughout, and a bare import would shadow
// (or be shadowed by) every one of those bindings.
import { exercise as exerciseTable, loggedSet, seededExercise as seededExerciseTable, userPreference, workoutSession } from '@/lib/db/schema';
import { finishSession } from '@/lib/session/finish-session';
import { shouldAutoAdvance } from '@/lib/session/auto-advance';
import { isFinalGroupMember, nextSupersetMemberIndex, type SupersetMemberInput } from '@/lib/session/superset';
import { resolveNextUp, type NextUp } from '@/lib/programs/next-up';
import {
  cancelRestAlert,
  getAlertPermission,
  openAlertSettings,
  requestAlertPermission,
  scheduleRestAlert,
  type AlertPermission,
} from '@/lib/rest-alert';
import { restTargetFrom } from '@/lib/rest-timer';
import { SessionModeProvider, type SessionScreenMode } from '@/lib/session/session-mode';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';
import { formatTimeOffRemaining, nextUpHeading as formatNextUpHeading } from './index';

const DEFAULT_WEIGHT_UNIT: WeightUnit = 'kg';
const LIVE_MODE: SessionScreenMode = 'live';

// Six distinct no-session-through-ready states, not a single 'no-session' collapsing every
// resolveNextUp kind into one — the Workout tab needs its own line for time-off and program-complete
// (Task 1), not the "No active program" fallback those two are not.
export type WorkoutScreenState =
  | 'error'
  | 'loading'
  | 'no-program'
  | 'time-off'
  | 'program-complete'
  | 'workout-available'
  | 'ready';

export interface WorkoutScreenStateInput {
  failed: boolean;
  session: LiveSessionData | null;
  nextUp: NextUp<ProgramDay, ProgramCycle> | null;
}

// In the exact shape of deriveHomeScreenState (index.tsx): failed beats everything, `session`
// staying null with `nextUp` still unresolved means the read has not landed yet, and `nextUp`'s own
// kind resolves to the state that renders its own line — only once loadLiveSession has confirmed
// there is no session to show instead.
export function deriveWorkoutScreenState({ failed, session, nextUp }: WorkoutScreenStateInput): WorkoutScreenState {
  if (failed) return 'error';
  if (session !== null) return 'ready';
  if (nextUp === null) return 'loading';
  switch (nextUp.kind) {
    case 'workout':
      return 'workout-available';
    case 'time-off':
      return 'time-off';
    case 'program-complete':
      return 'program-complete';
    default:
      return 'no-program';
  }
}

// Every no-session-ish state (Task 1: "the one-off start action is available from BOTH no-session
// states"/"keep the one-off start action available in both" the two resolveNextUp additions get).
const ONE_OFF_ELIGIBLE_STATES: readonly WorkoutScreenState[] = ['no-program', 'time-off', 'program-complete', 'workout-available'];

async function loadWeightUnit(userId: string, db = getPowerSync()): Promise<WeightUnit> {
  const [row] = await db
    .select({ weightUnit: userPreference.weightUnit })
    .from(userPreference)
    .where(eq(userPreference.id, userId));
  return (row?.weightUnit as WeightUnit | undefined) ?? DEFAULT_WEIGHT_UNIT;
}

// D-14's per-exercise equipment_type, keyed by catalog exercise id (SessionExerciseRow.exerciseId)
// — the one piece the band and tap-to-autofill rounding both need that no existing read in this
// file carries yet. Unions seeded/custom exactly like loadExerciseNameMap does, but this file's own
// scope (Task 3) is band/rounding wiring, not a change to session-query.ts/load-program.ts, so this
// stays a local, additive helper rather than a change to either shared module.
async function loadExerciseEquipmentTypeMap(
  exerciseIds: string[],
  db: WriteDb = getPowerSync(),
): Promise<Map<string, EquipmentType | null>> {
  if (exerciseIds.length === 0) return new Map();

  const seededRows = await db
    .select({ id: seededExerciseTable.id, equipmentRequired: seededExerciseTable.equipmentRequired })
    .from(seededExerciseTable)
    .where(inArray(seededExerciseTable.id, exerciseIds));
  const customRows = await db
    .select({ id: exerciseTable.id, equipmentRequired: exerciseTable.equipmentRequired })
    .from(exerciseTable)
    .where(inArray(exerciseTable.id, exerciseIds));

  const map = new Map<string, EquipmentType | null>();
  for (const row of seededRows) map.set(row.id, (row.equipmentRequired as EquipmentType | null) ?? null);
  for (const row of customRows) map.set(row.id, (row.equipmentRequired as EquipmentType | null) ?? null);
  return map;
}

// D-09's tap-to-autofill rounding needs the achievable set matching the CURRENT exercise's
// equipment type. Barbell/dumbbell resolve directly against the whole inventory (achievability.ts's
// own single-argument builders); machine/cable selection additionally depends on band.ts's
// name-then-id machine ordering (06-02's GYM-03 decision), which stays that file's one observable
// point per its own SUMMARY — duplicating it here would create the exact second-order-of-truth risk
// that decision was written to avoid, so machine/cable resolves to no achievable set and the
// autofill falls through to "write the logged value unchanged" (the same null-rounder behaviour
// D-09 already specifies for "nothing achievable").
function achievableLoadsForEquipmentType(equipmentType: EquipmentType | null, inventory: ResolvedInventory | null): string[] {
  if (equipmentType === null || inventory === null) return [];
  if (equipmentType === 'barbell' || equipmentType === 'ez_bar') return achievableBarbellLoads(inventory);
  if (equipmentType === 'dumbbell') return achievableDumbbellLoads(inventory);
  return [];
}

export interface WorkoutScreenRead {
  session: LiveSessionData | null;
  nextUp: NextUp<ProgramDay, ProgramCycle> | null;
  weightUnit: WeightUnit;
}

export type WorkoutScreenReadResult = WorkoutScreenRead | { failed: true };

export interface WorkoutScreenLoaders {
  loadSession?: (userId: string | null) => Promise<LiveSessionData | null>;
  loadNextUpData?: (userId: string | null) => Promise<NextUpData>;
  loadUnit?: (userId: string) => Promise<WeightUnit>;
}

// The whole body of the screen's read, extracted so the read/failure/resolve sequence is
// exercised without a renderer — same technique as index.tsx's readNextUp.
export async function readWorkoutScreenData(
  userId: string | null,
  loaders: WorkoutScreenLoaders = {},
): Promise<WorkoutScreenReadResult> {
  const loadSession = loaders.loadSession ?? ((id: string | null) => loadLiveSession(id, getPowerSync()));
  const loadNextUpData = loaders.loadNextUpData ?? ((id: string | null) => loadNextUp(id, getPowerSync()));
  const loadUnit = loaders.loadUnit ?? ((id: string) => loadWeightUnit(id, getPowerSync()));

  try {
    const session = await loadSession(userId);
    if (session) {
      const weightUnit = userId ? await loadUnit(userId) : DEFAULT_WEIGHT_UNIT;
      return { session, nextUp: null, weightUnit };
    }

    const nextUpData = await loadNextUpData(userId);
    const nextUp = resolveNextUp<ProgramDay, ProgramCycle>({
      routine: nextUpData.routine,
      days: nextUpData.days,
      cycles: nextUpData.cycles,
      history: nextUpData.history,
      today: nextUpData.today,
    });
    return { session: null, nextUp, weightUnit: DEFAULT_WEIGHT_UNIT };
  } catch (error) {
    console.error('workout screen load failed', error);
    return { failed: true };
  }
}

// The pure set-row-building logic (defaultDraftValues, buildSetRows, stepAmountFor,
// ExercisePageData/EMPTY_PAGE_DATA, and their supporting types) lives in set-row-builders.ts —
// shared with EditingWorkoutScreen.tsx's editing subtree (05-10) without either file importing
// the other. Re-exported here so this file's own existing test imports (`from '../workout'`) keep
// working unchanged.
export {
  buildSetRows,
  defaultDraftValues,
  EMPTY_PAGE_DATA,
  stepAmountFor,
  type ActiveFieldState,
  type BuildSetRowsReferenceContext,
  type ExercisePageData,
  type ResolvedSetRow,
  type RowOverride,
} from '@/lib/session/set-row-builders';
import {
  buildSetRows,
  defaultDraftValues,
  EMPTY_PAGE_DATA,
  stepAmountFor,
  type ActiveFieldState,
  type ExercisePageData,
  type ResolvedSetRow,
  type RowOverride,
} from '@/lib/session/set-row-builders';

// The set that currently "owns" the session's one outstanding rest target (D-26: rest is
// one-per-session, never per-exercise) — the most recently completed working or warm-up set
// across every exercise, honoring any not-yet-reloaded rowOverrides toggle. Null when no set has
// completed yet, which is also the correct answer for "nothing to attribute rest_taken_seconds to".
function findMostRecentCompletedSet(
  liveSession: LiveSessionData | null,
  rowOverrides: Record<string, RowOverride>,
): LoggedSetRow | null {
  if (!liveSession) return null;
  let best: LoggedSetRow | null = null;
  for (const rows of Object.values(liveSession.setsByExerciseId)) {
    for (const row of rows) {
      const completed = rowOverrides[row.id]?.completed ?? row.completed;
      if (!completed) continue;
      if (!best || row.loggedAt > best.loggedAt) best = row;
    }
  }
  return best;
}

export interface HeaderTimerBarData {
  sessionId: string;
  startedAtMs: number;
  accumulatedPausedSeconds: number;
  pausedAtMs: number | null;
  restTargetAtMs: number | null;
}

export interface WorkoutScreenViewProps {
  screenState: WorkoutScreenState;
  colors: ThemeColors;
  // The same handle useWorkoutScreen resolved its own writes against (db ?? getPowerSync()) —
  // threaded down to ExercisePage/TargetsSheet so a write-back reaches the same database the
  // screen is actually reading from, rather than TargetsSheet's own default silently resolving
  // getPowerSync() again and diverging whenever a caller (the durability harness, a future
  // multi-instance scenario) supplied a different db (05-12).
  db: WriteDb;
  // The signed-in user's id, threaded straight from useWorkoutScreen's own hook option — the
  // Switch Gym sheet needs it to load the caller's own gym list (T-06-04); no other existing prop
  // carries it at this top level (only per-exercise ExercisePageData does).
  userId: string | null;
  // The gym id currently stamped on the live session (D-17's snapshot) — the Switch Gym sheet's
  // own "which row is active" comparison, not the live default pointer.
  activeGymId: string | null;
  exercises: ExerciseStripExercise[];
  // The same live members list Task 1 built for handleCheckmarkPress's own D-13/D-14 use —
  // threaded here so ExercisePage's Superset/Detach rows and partner chip answer every
  // group-membership question from this one already-loaded list too.
  supersetGroupMembers: SupersetMemberInput[];
  currentExerciseId: string | null;
  currentIndex: number;
  pagerWidth: number;
  rowsByExercise: Record<string, ResolvedSetRow[]>;
  pageDataByExercise: Record<string, ExercisePageData>;
  activeField: ActiveFieldState | null;
  // The already-resolved, already-memoised equipment band state for the currently focused weight
  // field (T-06-04) — this view performs no computation and runs no solver of its own; the hook
  // resolves and memoises it once, against the session's snapshotted inventory and the in-flight
  // target, exactly as D-15's live-typing constraint requires.
  bandState: EquipmentBandState;
  onBandNeighbourPress: (valueKg: string) => void;
  onBandRecoveryPress: () => void;
  // Threaded to ExercisePage/SessionActionSheet so the Equipment row's presence and the
  // Equipment Availability Sheet's own resolution both read the session's already-loaded
  // equipment-type map and resolved inventory (06-05) rather than either component running a
  // second, independently-computed query of its own (R11, T-06-06).
  equipmentTypeByExerciseId: Map<string, EquipmentType | null>;
  resolvedInventory: ResolvedInventory | null;
  equipmentProfileId: string | null;
  starting: boolean;
  // Replaces the old canStartWorkout/nextUpHeading pair (Task 1): the view derives every
  // no-session-ish state's heading/body itself from the same NextUp value the screen already
  // resolved, rather than the hook pre-flattening it into two loosely-typed strings/booleans.
  nextUp: NextUp<ProgramDay, ProgramCycle> | null;
  weightUnit: WeightUnit;
  headerTimer: HeaderTimerBarData | null;
  paused: boolean;
  showNotificationPrompt: boolean;
  showBackgroundAlertsOffNote: boolean;
  showOneOffPicker: boolean;
  showAddExercisePicker: boolean;
  showSessionMenu: boolean;
  showDiscardConfirm: boolean;
  // T-06-04: the Switch Gym sheet's own visibility, gated behind the session menu exactly like
  // showSessionNoteSheet/showDiscardConfirm — Menu closes itself the instant this opens (no
  // confirmation step, D-18).
  showSwitchGymSheet: boolean;
  // The session-level note (LOG-16, 05-UI-SPEC Amendment A.2) — live-mode-only chrome, since the
  // Menu itself only renders in live mode (D-32/R10). hasSessionNote/sessionNoteText mirror the
  // existing pageData.hasNote/noteText split used for the exercise level.
  hasSessionNote: boolean;
  sessionNoteText: string | null;
  showSessionNoteSheet: boolean;
  onStartWorkout: () => void;
  onStartOneOff: () => void;
  onGoToPrograms: () => void;
  onAddOneOffExercises: (rows: PickerCatalogRow[]) => void;
  onCancelOneOffPicker: () => void;
  onSelectExercise: (exerciseId: string) => void;
  onIndexChange: (index: number) => void;
  onAddExercise: () => void;
  onConfirmAddExercise: (rows: PickerCatalogRow[]) => void;
  onCancelAddExercisePicker: () => void;
  onExerciseChanged: () => void;
  onFieldPress: (exerciseId: string, setId: string | null, field: KeypadField, currentValue: string | null) => void;
  onReferenceTap: (exerciseId: string, setId: string | null, field: 'weight' | 'reps') => void;
  onKeypadPress: (press: KeypadPress) => void;
  onSubmitField: () => void;
  onCheckmarkPress: (exerciseId: string, setId: string | null) => void;
  onOpenRestTimer: () => void;
  onAllowNotifications: () => void;
  onDismissNotificationPrompt: () => void;
  onTurnOnNotifications: () => void;
  onDismissBackgroundAlertsOffNote: () => void;
  onToggleSessionMenu: () => void;
  onPauseResume: () => void;
  onRequestDiscard: () => void;
  onConfirmDiscard: () => void;
  onCancelDiscard: () => void;
  // T-06-04: closes the menu and opens the Switch Gym sheet — no confirmation step.
  onOpenSwitchGym: () => void;
  // Fires with the tapped gym's id; the caller (useWorkoutScreen) is the one that calls
  // restampSessionGym and reloads — the sheet itself performs no write (SwitchGymSheet.tsx).
  onSelectGym: (gymId: string) => void;
  onManageGyms: () => void;
  onCancelSwitchGym: () => void;
  onOpenSessionNote: () => void;
  onSessionNoteSaved: () => void;
  onCancelSessionNote: () => void;
  onFinishWorkout: () => void;
}

// Hook-free — direct-invocable by Jest with no renderer, matching CycleStripView/DayDeckView.
// `colors` arrives as a prop; SessionModeProvider is mounted by the default export below, not
// here, so this component's own output is identical whether or not a mode provider wraps it.
// ExerciseStripView/ExercisePagerView/ExercisePageView/NumericKeypadView are all separate,
// independently-tested component boundaries composed here as real JSX — a test that needs to see
// inside one of them calls it directly with the props this view handed it, the same technique
// established for SetRowView/NumericKeypadView/PrimaryButton in the tracer task.
// Task 1's no-session-ish states each render one heading/body pair, then — per the plan text
// ("the one-off start action is available from BOTH no-session states"/"keep the one-off start
// action available in both") — the shared one-off action beneath every one of them. A plain
// function call embedded directly in the parent's JSX, not a nested <NoSessionBody /> element —
// this workspace's no-renderer test walker only sees a props.children tree, never invokes a
// component boundary, so a second component here would be invisible to WorkoutScreenView.test's
// direct-invocation assertions (the same "SetField" -> "renderSetField" fix 05-01 established).
function renderNoSessionBody(screenState: WorkoutScreenState, nextUp: NextUp<ProgramDay, ProgramCycle> | null) {
  if (screenState === 'workout-available' && nextUp?.kind === 'workout') {
    return <Text className="text-heading font-semibold text-foreground">{formatNextUpHeading(nextUp)}</Text>;
  }
  if (screenState === 'time-off' && nextUp?.kind === 'time-off') {
    return (
      <>
        <Text className="text-heading font-semibold text-foreground">{formatNextUpHeading(nextUp)}</Text>
        <Text className="text-body font-normal text-foreground-muted">{formatTimeOffRemaining(nextUp.daysRemaining)}</Text>
      </>
    );
  }
  if (screenState === 'program-complete') {
    return (
      <>
        <Text className="text-heading font-semibold text-foreground">Block complete</Text>
        <Text className="text-body font-normal text-foreground-muted">
          You have finished every cycle in this program. Start it again or build a new one.
        </Text>
      </>
    );
  }
  return (
    <>
      <Text className="text-heading font-semibold text-foreground">No active program</Text>
      <Text className="text-body font-normal text-foreground-muted">
        Build or activate a program, or start a one-off workout.
      </Text>
    </>
  );
}

export function WorkoutScreenView({
  screenState,
  colors,
  db,
  userId,
  activeGymId,
  exercises,
  supersetGroupMembers,
  currentExerciseId,
  currentIndex,
  pagerWidth,
  rowsByExercise,
  pageDataByExercise,
  activeField,
  bandState,
  onBandNeighbourPress,
  onBandRecoveryPress,
  equipmentTypeByExerciseId,
  resolvedInventory,
  equipmentProfileId,
  starting,
  nextUp,
  weightUnit,
  headerTimer,
  paused,
  showNotificationPrompt,
  showBackgroundAlertsOffNote,
  showOneOffPicker,
  showAddExercisePicker,
  showSessionMenu,
  showDiscardConfirm,
  showSwitchGymSheet,
  hasSessionNote,
  sessionNoteText,
  showSessionNoteSheet,
  onStartWorkout,
  onStartOneOff,
  onGoToPrograms,
  onAddOneOffExercises,
  onCancelOneOffPicker,
  onSelectExercise,
  onIndexChange,
  onAddExercise,
  onConfirmAddExercise,
  onCancelAddExercisePicker,
  onExerciseChanged,
  onFieldPress,
  onReferenceTap,
  onKeypadPress,
  onSubmitField,
  onCheckmarkPress,
  onOpenRestTimer,
  onAllowNotifications,
  onDismissNotificationPrompt,
  onTurnOnNotifications,
  onDismissBackgroundAlertsOffNote,
  onToggleSessionMenu,
  onPauseResume,
  onRequestDiscard,
  onConfirmDiscard,
  onCancelDiscard,
  onOpenSwitchGym,
  onSelectGym,
  onManageGyms,
  onCancelSwitchGym,
  onOpenSessionNote,
  onSessionNoteSaved,
  onCancelSessionNote,
  onFinishWorkout,
}: WorkoutScreenViewProps) {
  if (showOneOffPicker) {
    return <ExercisePickerModal dayName="this workout" onAdd={onAddOneOffExercises} onCancel={onCancelOneOffPicker} />;
  }

  if (screenState === 'error') {
    return (
      <View className="mt-xl gap-sm px-lg">
        <Text className="text-heading font-semibold text-foreground">Workout couldn&apos;t load</Text>
        <Text className="text-body font-normal text-foreground-muted">
          Restart the app to try again. Your programs and history are safe.
        </Text>
      </View>
    );
  }

  if (screenState === 'loading') {
    return (
      <View className="mt-xl gap-sm px-lg">
        <View className="rounded-md bg-surface" style={{ height: 64 }} />
      </View>
    );
  }

  if (screenState !== 'ready') {
    return (
      <View className="mt-xl gap-md px-lg">
        {renderNoSessionBody(screenState, nextUp)}
        {screenState === 'workout-available' ? (
          <PrimaryButton label="Start Workout" onPress={onStartWorkout} submitting={starting} />
        ) : null}
        {screenState === 'no-program' ? (
          <Pressable
            onPress={onGoToPrograms}
            accessibilityRole="button"
            accessibilityLabel="Browse Programs"
            style={{ minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' }}
          >
            <Text className="text-body font-normal text-accent">Browse Programs</Text>
          </Pressable>
        ) : null}
        {ONE_OFF_ELIGIBLE_STATES.includes(screenState) ? (
          <Pressable
            onPress={onStartOneOff}
            accessibilityRole="button"
            accessibilityLabel="Start a one-off workout"
            style={{ minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' }}
          >
            <Text className="text-body font-normal text-accent">Start a one-off workout</Text>
          </Pressable>
        ) : null}
        {showNotificationPrompt ? (
          <NotificationPermissionPromptView onAllow={onAllowNotifications} onDismiss={onDismissNotificationPrompt} />
        ) : null}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {headerTimer ? (
        <RestTimerBar
          startedAtMs={headerTimer.startedAtMs}
          accumulatedPausedSeconds={headerTimer.accumulatedPausedSeconds}
          pausedAtMs={headerTimer.pausedAtMs}
          restTargetAtMs={headerTimer.restTargetAtMs}
          onPressRest={onOpenRestTimer}
        />
      ) : null}
      {headerTimer ? (
        <View className="flex-row items-center justify-between px-md py-sm">
          <View>
            <Pressable
              onPress={onToggleSessionMenu}
              accessibilityRole="button"
              accessibilityLabel="Session menu"
              style={{ minHeight: 48, minWidth: 48, justifyContent: 'center' }}
            >
              <Text className="text-body font-normal text-foreground">Menu</Text>
            </Pressable>
            {showSessionMenu ? (
              <View className="mt-sm gap-sm rounded-md border border-foreground-muted bg-surface p-sm">
                <Pressable
                  onPress={onPauseResume}
                  accessibilityRole="button"
                  accessibilityLabel={paused ? 'Resume' : 'Pause'}
                  style={{ minHeight: 48, justifyContent: 'center' }}
                >
                  <Text className="text-body font-normal text-foreground">{paused ? 'Resume' : 'Pause'}</Text>
                </Pressable>
                <Pressable
                  onPress={onOpenSessionNote}
                  accessibilityRole="button"
                  accessibilityLabel="Session Note"
                  style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center' }}
                >
                  <Text className="text-body font-normal text-foreground">Session Note</Text>
                  {hasSessionNote ? (
                    <View accessibilityLabel="Note exists" className="rounded-full bg-accent" style={{ width: 6, height: 6, marginLeft: 8 }} />
                  ) : null}
                </Pressable>
                <Pressable
                  onPress={onOpenSwitchGym}
                  accessibilityRole="button"
                  accessibilityLabel="Switch Gym"
                  style={{ minHeight: 48, justifyContent: 'center' }}
                >
                  <Text className="text-body font-normal text-foreground">Switch Gym</Text>
                </Pressable>
                <Pressable
                  onPress={onRequestDiscard}
                  accessibilityRole="button"
                  accessibilityLabel="Discard"
                  style={{ minHeight: 48, justifyContent: 'center' }}
                >
                  <Text className="text-body font-normal text-destructive">Discard</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          <PrimaryButton label="Finish Workout" onPress={onFinishWorkout} />
        </View>
      ) : null}
      {showBackgroundAlertsOffNote ? (
        <View className="px-md pt-sm">
          <BackgroundAlertsOffNote key={headerTimer?.sessionId} onTurnOn={onTurnOnNotifications} onDismiss={onDismissBackgroundAlertsOffNote} />
        </View>
      ) : null}
      <ExerciseStripView
        exercises={exercises}
        currentExerciseId={currentExerciseId}
        colors={colors}
        onSelectExercise={onSelectExercise}
        onAddExercise={onAddExercise}
      />
      <ExercisePagerView
        exercises={exercises}
        index={currentIndex}
        onIndexChange={onIndexChange}
        width={pagerWidth}
        renderExercise={(exercise) => {
          const pageData = pageDataByExercise[exercise.id] ?? EMPTY_PAGE_DATA;
          return (
            <ExercisePage
              exerciseName={exercise.name}
              rows={rowsByExercise[exercise.id] ?? []}
              activeField={activeField && activeField.exerciseId === exercise.id ? { setId: activeField.setId, field: activeField.field } : null}
              sessionExerciseId={pageData.sessionExerciseId}
              exerciseId={pageData.exerciseId}
              sessionId={pageData.sessionId}
              userId={pageData.userId}
              weightUnit={weightUnit}
              targets={pageData.targets}
              routineExerciseId={pageData.routineExerciseId}
              cycleId={pageData.cycleId}
              sessionExercises={exercises}
              sessionExerciseRows={supersetGroupMembers}
              onSelectExercise={onSelectExercise}
              db={db}
              hasNote={pageData.hasNote}
              noteText={pageData.noteText}
              equipmentType={equipmentTypeByExerciseId.get(pageData.exerciseId) ?? null}
              resolvedInventory={resolvedInventory}
              equipmentProfileId={equipmentProfileId}
              onExerciseChanged={onExerciseChanged}
              onFieldPress={(setId, field, currentValue) => onFieldPress(exercise.id, setId, field, currentValue)}
              onReferenceTap={(setId, field) => onReferenceTap(exercise.id, setId, field)}
              onCheckmarkPress={(setId) => onCheckmarkPress(exercise.id, setId)}
            />
          );
        }}
      />

      {activeField ? (
        <NumericKeypadView
          field={activeField.field}
          stepAmount={stepAmountFor(activeField.field, weightUnit)}
          colors={colors}
          onPress={onKeypadPress}
          onSubmit={onSubmitField}
          band={
            activeField.field === 'weight'
              ? ({
                  state: bandState,
                  unit: weightUnit,
                  onNeighbourPress: onBandNeighbourPress,
                  onRecoveryPress: onBandRecoveryPress,
                } satisfies PlateStripBandData)
              : undefined
          }
        />
      ) : null}

      {showDiscardConfirm ? (
        <Modal transparent animationType="fade" onRequestClose={onCancelDiscard}>
          <DiscardWorkoutDialog onConfirm={onConfirmDiscard} onCancel={onCancelDiscard} />
        </Modal>
      ) : null}

      {showSessionNoteSheet && headerTimer ? (
        <NoteSheet
          level="session"
          id={headerTimer.sessionId}
          initialText={sessionNoteText}
          db={db}
          onSaved={onSessionNoteSaved}
          onCancel={onCancelSessionNote}
        />
      ) : null}

      {showSwitchGymSheet && userId ? (
        <SwitchGymSheet
          userId={userId}
          activeGymId={activeGymId}
          db={db}
          onSelectGym={onSelectGym}
          onManageGyms={onManageGyms}
          onDismiss={onCancelSwitchGym}
        />
      ) : null}

      {showAddExercisePicker ? (
        <Modal animationType="slide" onRequestClose={onCancelAddExercisePicker}>
          <ExercisePickerModal dayName="this workout" onAdd={onConfirmAddExercise} onCancel={onCancelAddExercisePicker} />
        </Modal>
      ) : null}
    </View>
  );
}

export interface UseWorkoutScreenOptions {
  userId: string | null;
  // Present only for the __durability harness (workout-screen.spec.ts): routes every read/write
  // this hook makes at the harness's isolated test database instead of the production singleton,
  // the same seam every db-accepting helper in this file already exposes.
  db?: WriteDb;
  // Threaded explicitly rather than read through useSessionMode(): this hook's render happens in
  // the WorkoutScreen component that CREATES the SessionModeProvider, not inside it, so the
  // context is structurally unreachable from here. Every timer-scheduling call site below gates
  // on this single typed value — never on session.status (D-32/R10) — exactly as if it had been
  // read from context; only the plumbing differs.
  mode?: SessionScreenMode;
}

export type WorkoutScreenViewModel = Omit<WorkoutScreenViewProps, 'colors'>;

// The whole screen's state machine, extracted so __durability.web.tsx's workout-screen harness
// mode can mount the exact same behaviour against its own database — the real WorkoutScreenView,
// driven by real DOM clicks in a real browser, is what workout-screen.spec.ts proves (D-01).
export function useWorkoutScreen({ userId, db, mode = LIVE_MODE }: UseWorkoutScreenOptions): WorkoutScreenViewModel {
  // Resolved once, here, for the raw workout_session/logged_set updates this hook makes directly
  // (rest-target and rest-taken-seconds writes) — every other write in this file goes through a
  // db.ts helper that already defaults its own `db` parameter to getPowerSync(), so this is the
  // one spot that needs its own resolved handle.
  const writeDb = db ?? getPowerSync();
  const [read, setRead] = useState<WorkoutScreenReadResult | null>(null);
  const [activeField, setActiveField] = useState<ActiveFieldState | null>(null);
  // Resolved once per session load, through loadSessionInventory's own snapshot read (D-17) —
  // never the live default pointer, so mid-workout the plate band keeps answering against the gym
  // this session actually started at.
  const [resolvedInventory, setResolvedInventory] = useState<ResolvedInventory | null>(null);
  // D-14's per-exercise equipment type, loaded alongside the inventory — the band needs both to
  // decide what an exercise's own band content is (Task 3).
  const [equipmentTypeByExerciseId, setEquipmentTypeByExerciseId] = useState<Map<string, EquipmentType | null>>(new Map());
  const [draftValuesByExercise, setDraftValuesByExercise] = useState<Record<string, SetRowValues>>({});
  const [rowOverrides, setRowOverrides] = useState<Record<string, RowOverride>>({});
  const [starting, setStarting] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [referenceMap, setReferenceMap] = useState<PreviousSetReferenceMap>({});
  const [notificationPermission, setNotificationPermission] = useState<AlertPermission>('undetermined');
  const [notificationPromptDismissed, setNotificationPromptDismissed] = useState(false);
  const [offNoteDismissedForSessionId, setOffNoteDismissedForSessionId] = useState<string | null>(null);
  const [oneOffPickerOpen, setOneOffPickerOpen] = useState(false);
  const [addExercisePickerOpen, setAddExercisePickerOpen] = useState(false);
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [switchGymSheetOpen, setSwitchGymSheetOpen] = useState(false);
  const [sessionNoteSheetOpen, setSessionNoteSheetOpen] = useState(false);
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(true);
  const { width: pagerWidth } = useWindowDimensions();
  const router = useRouter();
  const lastSessionIdRef = useRef<string | null>(null);

  // A read, never a prompt (getAlertPermission never calls requestPermissionsAsync) — safe to
  // re-check on every focus, including after the user changes the OS-level answer in Settings.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void getAlertPermission().then((permission) => {
        if (active) setNotificationPermission(permission);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  // Task 3 (LOG-13): the auto-advance toggle, read on every focus like the permission above — a
  // change made in Profile's workout settings must take effect the next time this tab regains
  // focus, not only on a fresh mount.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!userId) return undefined;
      void loadWorkoutPreferences(userId, db).then((preferences) => {
        if (active) setAutoAdvanceEnabled(preferences.autoAdvanceEnabled);
      });
      return () => {
        active = false;
      };
    }, [userId, db]),
  );

  // Resets the pager back to the first exercise only when the open session's identity actually
  // changes (a fresh start, or a different device's session synced in) — not on every reload, or
  // completing a set on exercise 3 would yank the pager back to exercise 1 the instant the
  // checkmark landed.
  const applyReadResult = useCallback(
    (result: WorkoutScreenReadResult) => {
      const nextSessionId = !('failed' in result) ? (result.session?.session.id ?? null) : null;
      if (lastSessionIdRef.current !== nextSessionId) {
        lastSessionIdRef.current = nextSessionId;
        setCurrentIndex(0);
      }

      setRead(result);
      setRowOverrides({});
      if (!('failed' in result) && result.session) {
        const session = result.session;
        setDraftValuesByExercise((current) => {
          const drafts = { ...current };
          for (const exercise of session.exercises) {
            if (!(exercise.id in drafts)) drafts[exercise.id] = defaultDraftValues(exercise);
          }
          return drafts;
        });
        void previousSetReferencesForSession(session.session.id, db).then(setReferenceMap);
        void loadSessionInventory(session.session.id, db).then(setResolvedInventory);
        void loadExerciseEquipmentTypeMap(
          session.exercises.map((sessionExercise) => sessionExercise.exerciseId),
          db,
        ).then(setEquipmentTypeByExerciseId);
      } else {
        setReferenceMap({});
        setResolvedInventory(null);
        setEquipmentTypeByExerciseId(new Map());
      }
    },
    [db],
  );

  const loadersFor = useCallback(
    (): WorkoutScreenLoaders =>
      db
        ? {
            loadSession: (id) => loadLiveSession(id, db),
            loadNextUpData: (id) => loadNextUp(id, db),
            loadUnit: (id) => loadWeightUnit(id, db),
          }
        : {},
    [db],
  );

  const reload = useCallback(async (): Promise<WorkoutScreenReadResult> => {
    const result = await readWorkoutScreenData(userId, loadersFor());
    applyReadResult(result);
    return result;
  }, [userId, applyReadResult, loadersFor]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const result = await readWorkoutScreenData(userId, loadersFor());
        if (!active) return;
        applyReadResult(result);
      })();
      return () => {
        active = false;
      };
    }, [userId, applyReadResult, loadersFor]),
  );

  const failed = read !== null && 'failed' in read;
  const liveSession = read !== null && !('failed' in read) ? read.session : null;
  const nextUp = read !== null && !('failed' in read) ? read.nextUp : null;
  const weightUnit = read !== null && !('failed' in read) ? read.weightUnit : DEFAULT_WEIGHT_UNIT;
  const screenState = deriveWorkoutScreenState({ failed, session: liveSession, nextUp });

  const sessionRow = liveSession?.session ?? null;
  // Every timer surface below is gated on `mode === LIVE_MODE`, never on session.status (R10) —
  // in `editing`/`summary-correction` modes headerTimer is structurally null, so no scheduling
  // call site in this hook is even reachable, matching D-32's "unreachable, not merely inactive"
  // requirement for the live-session machinery.
  const headerTimer: HeaderTimerBarData | null =
    mode === LIVE_MODE && sessionRow
      ? {
          sessionId: sessionRow.id,
          startedAtMs: new Date(sessionRow.startedAt).getTime(),
          accumulatedPausedSeconds: sessionRow.accumulatedPausedSeconds,
          pausedAtMs: sessionRow.pausedAt ? new Date(sessionRow.pausedAt).getTime() : null,
          restTargetAtMs: sessionRow.restTargetAt ? new Date(sessionRow.restTargetAt).getTime() : null,
        }
      : null;
  const showNotificationPrompt =
    mode === LIVE_MODE &&
    ONE_OFF_ELIGIBLE_STATES.includes(screenState) &&
    notificationPermission === 'undetermined' &&
    !notificationPromptDismissed;
  const showBackgroundAlertsOffNote =
    mode === LIVE_MODE &&
    sessionRow !== null &&
    (notificationPermission === 'denied' || notificationPermission === 'unsupported') &&
    offNoteDismissedForSessionId !== sessionRow.id;

  const sessionExercises = liveSession?.exercises ?? [];
  const safeIndex = clampPagerIndex(currentIndex, sessionExercises.length);
  const currentExercise = sessionExercises[safeIndex] ?? null;

  // The focused field's own exercise, not necessarily the pager's current one — activeField is
  // always inside the currently displayed page in practice, but this reads its own exerciseId
  // directly rather than assuming that invariant holds.
  const activeEquipmentType = useMemo<EquipmentType | null>(() => {
    if (!activeField) return null;
    const exercise = sessionExercises.find((candidate) => candidate.id === activeField.exerciseId);
    if (!exercise) return null;
    return equipmentTypeByExerciseId.get(exercise.exerciseId) ?? null;
  }, [activeField, sessionExercises, equipmentTypeByExerciseId]);

  // T-06-04: the band's whole state, computed once here and memoised on the inventory and the
  // in-flight target — the view itself (WorkoutScreenView) performs no computation and runs no
  // solver. Reps/rir fields never carry a band (the band answers a question only a weight field
  // asks), so this collapses outside the 'weight' branch rather than resolving anything.
  const bandState = useMemo<EquipmentBandState>(() => {
    if (!activeField || activeField.field !== 'weight') return { kind: 'collapsed' };
    return resolveEquipmentBand({
      equipmentType: activeEquipmentType,
      targetKg: toCanonicalKg(activeField.value, weightUnit),
      inventory: resolvedInventory,
    });
  }, [activeField, activeEquipmentType, resolvedInventory, weightUnit]);

  const exercises: ExerciseStripExercise[] = sessionExercises.map((exercise) => {
    const existingSets = liveSession?.setsByExerciseId[exercise.id] ?? [];
    const completedWorkingSets = countCompletedWorkingSets(
      existingSets.map((row) => ({
        setType: row.setType,
        completed: rowOverrides[row.id]?.completed ?? row.completed,
        parentSetId: row.parentSetId ?? null,
      })),
    );
    return {
      id: exercise.id,
      name: exercise.exerciseName,
      completedWorkingSets,
      targetSets: exercise.targetSets ?? 0,
      supersetGroupId: exercise.supersetGroupId,
    };
  });

  // D-13/D-14: loadSessionTree already filters removed_at IS NULL, so this is exactly the
  // live-members list isFinalGroupMember/nextSupersetMemberIndex require (D-24), built once
  // beside the strip's own exercises map rather than re-derived at each call site.
  const supersetGroupMembers: SupersetMemberInput[] = sessionExercises.map((exercise) => ({
    id: exercise.id,
    orderIndex: exercise.orderIndex,
    supersetGroupId: exercise.supersetGroupId,
    exerciseName: exercise.exerciseName,
  }));

  const rowsByExercise: Record<string, ResolvedSetRow[]> = {};
  const pageDataByExercise: Record<string, ExercisePageData> = {};
  for (const exercise of sessionExercises) {
    const existingSets = liveSession?.setsByExerciseId[exercise.id] ?? [];
    const draftValues = draftValuesByExercise[exercise.id] ?? defaultDraftValues(exercise);
    const activeFieldForExercise = activeField && activeField.exerciseId === exercise.id ? activeField : null;
    rowsByExercise[exercise.id] = buildSetRows(existingSets, rowOverrides, draftValues, weightUnit, activeFieldForExercise, {
      sessionExerciseId: exercise.id,
      referenceMap,
    });
    pageDataByExercise[exercise.id] = {
      sessionExerciseId: exercise.id,
      exerciseId: exercise.exerciseId,
      sessionId: sessionRow?.id ?? '',
      userId,
      targets: {
        targetSets: exercise.targetSets,
        targetRepMin: exercise.targetRepMin,
        targetRepMax: exercise.targetRepMax,
        targetRir: exercise.targetRir,
        targetRestSeconds: exercise.targetRestSeconds,
      },
      routineExerciseId: exercise.routineExerciseId,
      cycleId: sessionRow?.cycleId ?? null,
      hasNote: exercise.notes !== null,
      noteText: exercise.notes,
    };
  }

  async function handleStartWorkout() {
    if (!nextUp || nextUp.kind !== 'workout' || starting) return;
    setStarting(true);
    try {
      await startWorkoutFromProgram(
        {
          routineDayId: nextUp.day.id,
          cycleId: nextUp.cycle?.id ?? null,
          slots: nextUp.day.slots.map((slot) => ({
            routineExerciseId: slot.id,
            exerciseId: slot.exerciseId,
            orderIndex: slot.orderIndex,
          })),
          userId,
        },
        db,
      );
      await reload();
    } finally {
      setStarting(false);
    }
  }

  // LOG-02/D-33: opens the unmodified ExercisePickerModal in multi-select, from every no-session
  // state (a user with an active program may still want an unplanned session).
  function handleStartOneOff() {
    setOneOffPickerOpen(true);
  }

  function handleCancelOneOffPicker() {
    setOneOffPickerOpen(false);
  }

  async function handleAddOneOffExercises(rows: PickerCatalogRow[]) {
    if (rows.length === 0) {
      setOneOffPickerOpen(false);
      return;
    }
    await startOneOffSession({ exerciseIds: rows.map((row) => row.id), userId }, db);
    setOneOffPickerOpen(false);
    await reload();
  }

  function handleGoToPrograms() {
    router.push('/programs/library');
  }

  function handleSelectExercise(exerciseId: string) {
    const index = sessionExercises.findIndex((exercise) => exercise.id === exerciseId);
    if (index === -1) return;
    setActiveField(null);
    setCurrentIndex(index);
  }

  function handleIndexChange(index: number) {
    setActiveField(null);
    setCurrentIndex(clampPagerIndex(index, sessionExercises.length));
  }

  // LOG-14: opens the same unmodified Phase 4 ExercisePickerModal the strip's trailing add chip
  // and the overflow sheet's Swap action both reuse, in multi-select mode.
  function handleAddExercise() {
    setAddExercisePickerOpen(true);
  }

  function handleCancelAddExercisePicker() {
    setAddExercisePickerOpen(false);
  }

  async function handleConfirmAddExercise(rows: PickerCatalogRow[]) {
    if (!liveSession || rows.length === 0) {
      setAddExercisePickerOpen(false);
      return;
    }
    await addExerciseToSession({ sessionId: liveSession.session.id, exerciseIds: rows.map((row) => row.id) }, db);
    setAddExercisePickerOpen(false);
    await reload();
  }

  // Shared by every ExercisePage instance's action-bar sheets (targets/note/warmup/swap/remove) —
  // each already closes its own sheet before calling this; a single reload picks up whichever
  // session-scoped write just landed.
  function handleExerciseChanged() {
    void reload();
  }

  function handleFieldPress(exerciseId: string, setId: string | null, field: KeypadField, currentValue: string | null) {
    setActiveField({ exerciseId, setId, field, value: currentValue, touched: false });
  }

  // D-09/D-10's achievable-autofill: a weight taken from the reference row is rounded to nearest
  // against the session's own inventory before it is written into the field — the reference row's
  // own displayed figure (referenceMap) is never touched by this function, so it keeps reading
  // exactly as logged no matter what this rounds to.
  function achievableReferenceWeightKg(exerciseId: string, loggedWeightKg: string | null): string | null {
    if (loggedWeightKg === null) return loggedWeightKg;
    const equipmentType = equipmentTypeByExerciseId.get(exerciseId) ?? null;
    const achievableKg = achievableLoadsForEquipmentType(equipmentType, resolvedInventory);
    return roundToAchievable(loggedWeightKg, achievableKg, 'nearest') ?? loggedWeightKg;
  }

  // Writes a reference's number straight into the field it sits under, leaving the other two
  // untouched (D-17) — the same write path handleSubmitField uses for a manually typed value, just
  // sourced from the history lookup instead of the keypad, and applied in one step with no
  // intermediate "active field" state.
  async function handleReferenceTap(exerciseId: string, setId: string | null, field: 'weight' | 'reps') {
    const exercise = sessionExercises.find((candidate) => candidate.id === exerciseId);
    if (!exercise) return;
    const existingSets = liveSession?.setsByExerciseId[exercise.id] ?? [];
    const setIndex = setId === null ? existingSets.length + 1 : existingSets.find((row) => row.id === setId)?.setIndex;
    if (setIndex === undefined) return;

    const ref = referenceMap[referenceKey(exercise.id, setIndex)];
    if (!ref) return;

    if (setId === null) {
      const draftValues = draftValuesByExercise[exercise.id] ?? defaultDraftValues(exercise);
      const value =
        field === 'weight'
          ? fromCanonicalKg(achievableReferenceWeightKg(exercise.exerciseId, ref.weightKg), weightUnit)
          : String(ref.reps);
      setDraftValuesByExercise((current) => ({ ...current, [exercise.id]: { ...draftValues, [field]: value } }));
      return;
    }

    if (field === 'weight') {
      const roundedKg = achievableReferenceWeightKg(exercise.exerciseId, ref.weightKg);
      const value = fromCanonicalKg(roundedKg, weightUnit);
      await updateLoggedSet({ id: setId, weight: { value, unit: weightUnit } }, db);
      setRowOverrides((current) => ({ ...current, [setId]: { ...current[setId], weightKg: roundedKg } }));
    } else {
      await updateLoggedSet({ id: setId, reps: ref.reps }, db);
      setRowOverrides((current) => ({ ...current, [setId]: { ...current[setId], reps: ref.reps } }));
    }
  }

  function handleKeypadPress(press: KeypadPress) {
    setActiveField((current) =>
      current ? { ...current, value: applyKeypadPress(current.value, press), touched: true } : current,
    );
  }

  // A neighbour tap routes through the exact field-write path a typed digit uses (D-09): it writes
  // the whole value into the in-flight field, exactly as if typed, and nothing else — no set is
  // completed, no other field changes.
  function handleBandNeighbourPress(valueKg: string) {
    setActiveField((current) =>
      current && current.field === 'weight' ? { ...current, value: fromCanonicalKg(valueKg, weightUnit), touched: true } : current,
    );
  }

  // Routes to the active gym's editor — the gym this session is actually scoped to (D-17's
  // snapshot), not whichever gym happens to be the live default right now.
  function handleBandRecoveryPress() {
    const equipmentProfileId = liveSession?.session.equipmentProfileId ?? null;
    if (!equipmentProfileId) return;
    router.push(`/gym-profiles/edit/${equipmentProfileId}`);
  }

  async function handleSubmitField() {
    if (!activeField) return;
    const exercise = sessionExercises.find((candidate) => candidate.id === activeField.exerciseId);
    if (!exercise) return;
    const existingSets = liveSession?.setsByExerciseId[exercise.id] ?? [];
    const draftValues = draftValuesByExercise[exercise.id] ?? defaultDraftValues(exercise);

    let updatedDraft = draftValues;
    let updatedOverride: RowOverride | undefined;

    if (activeField.touched) {
      if (activeField.setId === null) {
        updatedDraft = { ...draftValues, [activeField.field]: activeField.value };
        setDraftValuesByExercise((current) => ({ ...current, [exercise.id]: updatedDraft }));
      } else {
        const setId = activeField.setId;
        if (activeField.field === 'weight') {
          await updateLoggedSet({ id: setId, weight: { value: activeField.value, unit: weightUnit } }, db);
          updatedOverride = { weightKg: toCanonicalKg(activeField.value, weightUnit) };
        } else if (activeField.field === 'reps') {
          const reps = activeField.value === null ? 0 : Number(activeField.value);
          await updateLoggedSet({ id: setId, reps }, db);
          updatedOverride = { reps };
        } else {
          const rir = activeField.value === null ? null : Number(activeField.value);
          await updateLoggedSet({ id: setId, rir }, db);
          updatedOverride = { rir };
        }
        setRowOverrides((current) => ({ ...current, [setId]: { ...current[setId], ...updatedOverride } }));
      }
    }

    const next = nextKeypadField(activeField.field);
    if (next === null) {
      setActiveField(null);
      return;
    }

    const row = activeField.setId ? existingSets.find((r) => r.id === activeField.setId) ?? null : null;
    let nextValue: string | null;
    if (activeField.setId === null) {
      nextValue = updatedDraft[next];
    } else if (row) {
      const merged = { ...rowOverrides[row.id], ...updatedOverride };
      const weightKg = merged.weightKg !== undefined ? merged.weightKg : row.weightKg;
      const reps = merged.reps !== undefined ? merged.reps : row.reps;
      const rir = merged.rir !== undefined ? merged.rir : row.rir;
      nextValue =
        next === 'weight' ? fromCanonicalKg(weightKg, weightUnit) : next === 'reps' ? String(reps) : rir === null ? null : String(rir);
    } else {
      nextValue = null;
    }

    setActiveField({ exerciseId: exercise.id, setId: activeField.setId, field: next, value: nextValue, touched: false });
  }

  async function handleCheckmarkPress(exerciseId: string, setId: string | null) {
    const exercise = sessionExercises.find((candidate) => candidate.id === exerciseId);
    if (!exercise) return;
    const existingSets = liveSession?.setsByExerciseId[exercise.id] ?? [];

    if (setId === null) {
      const draftValues = draftValuesByExercise[exercise.id] ?? defaultDraftValues(exercise);
      // LOG-07: reps must hold a value to reach completed=true — rejected without writing.
      if (draftValues.reps === null || draftValues.reps === '') return;

      const now = new Date();
      const nowMs = now.getTime();
      // D-26: the outstanding rest belongs to whichever set most recently completed, session-wide
      // — a rest is one-per-session, never per-exercise, so this is not scoped to `exercise`.
      const outstandingTargetAt = liveSession?.session.restTargetAt ?? null;
      const previousCompletedSet = outstandingTargetAt !== null ? findMostRecentCompletedSet(liveSession, rowOverrides) : null;

      await logSet(
        {
          sessionExerciseId: exercise.id,
          weight: { value: draftValues.weight, unit: weightUnit },
          reps: Number(draftValues.reps),
          rir: draftValues.rir === null ? null : Number(draftValues.rir),
          completed: true,
          now,
        },
        db,
      );

      // The column already exists and, before this plan, was never written (D-26) — records the
      // seconds actually elapsed between the previous set's completion and this one, independent
      // of whatever the prescribed target was.
      if (previousCompletedSet) {
        const restTakenSeconds = Math.max(0, Math.round((nowMs - new Date(previousCompletedSet.loggedAt).getTime()) / 1000));
        await writeDb.update(loggedSet).set({ restTakenSeconds }).where(eq(loggedSet.id, previousCompletedSet.id));
      }

      // D-13: rest starts only after the group's final live member — a non-final member's
      // completion leaves rest_target_at untouched and schedules no alert, so the header bar
      // simply stays dormant. An ungrouped exercise's isFinalGroupMember call always returns
      // true, so this needs no separate branch for the ungrouped case.
      if (mode === LIVE_MODE && liveSession && isFinalGroupMember(supersetGroupMembers, exercise.id)) {
        const newTargetMs = restTargetFrom(nowMs, exercise.targetRestSeconds);
        await writeDb
          .update(workoutSession)
          .set({ restTargetAt: newTargetMs === null ? null : new Date(newTargetMs).toISOString() })
          .where(eq(workoutSession.id, liveSession.session.id));
        if (newTargetMs !== null) {
          await scheduleRestAlert(newTargetMs);
        } else {
          await cancelRestAlert();
        }
      }

      // LOG-13: the draft's own completion is always a WORKING set (a warm-up is created by a
      // different flow entirely, never through the trailing draft row) — gated on the typed
      // SessionScreenMode value, never session.status (D-32/R10).
      if (mode === LIVE_MODE) {
        const exerciseIndex = sessionExercises.findIndex((candidate) => candidate.id === exercise.id);
        // D-14: evaluated BEFORE shouldAutoAdvance, and skips it entirely when it fires — a
        // non-final member's completion advances the pager through the group regardless of
        // that exercise's own prescription, which shouldAutoAdvance itself is never told about
        // (Pitfall 5, the two triggers stay separate functions).
        const memberAdvanceIndex = nextSupersetMemberIndex(supersetGroupMembers, exerciseIndex);
        if (memberAdvanceIndex !== null && autoAdvanceEnabled) {
          setCurrentIndex(memberAdvanceIndex);
        } else {
          const setsAfter = [...existingSets, { setType: WORKING_SET_TYPE, completed: true, parentSetId: null }];
          const nextIndex = shouldAutoAdvance({
            sets: setsAfter.map((row) => ({ setType: row.setType, completed: row.completed, parentSetId: row.parentSetId ?? null })),
            enabled: autoAdvanceEnabled,
            currentIndex: exerciseIndex,
            exerciseCount: sessionExercises.length,
            completedSetType: WORKING_SET_TYPE,
            targetWorkingSets: exercise.targetSets,
          });
          if (nextIndex !== null) setCurrentIndex(nextIndex);
        }
      }

      // The row that was just the draft is now a real, existing logged_set — its own trailing
      // replacement draft must start blank again (D-16), not keep showing the value that was just
      // submitted. draftValuesByExercise is otherwise sticky by design (typing survives a reload,
      // reload()'s own drafts-seeding only fills entries that don't exist yet), so this exercise's
      // entry needs an explicit reset here or every draft after the first would echo its predecessor.
      setDraftValuesByExercise((current) => ({ ...current, [exercise.id]: defaultDraftValues(exercise) }));
      setActiveField(null);
      await reload();
      return;
    }

    const row = existingSets.find((r) => r.id === setId);
    if (!row) return;
    const currentCompleted = rowOverrides[setId]?.completed ?? row.completed;
    const nextCompleted = !currentCompleted;
    await updateLoggedSet({ id: setId, completed: nextCompleted }, db);
    setRowOverrides((current) => ({ ...current, [setId]: { ...current[setId], completed: nextCompleted } }));

    // LOG-13: only a transition INTO completed can trigger auto-advance — unchecking a row never
    // moves the pager.
    if (mode === LIVE_MODE && nextCompleted) {
      const exerciseIndex = sessionExercises.findIndex((candidate) => candidate.id === exercise.id);
      const memberAdvanceIndex = nextSupersetMemberIndex(supersetGroupMembers, exerciseIndex);
      if (memberAdvanceIndex !== null && autoAdvanceEnabled) {
        setCurrentIndex(memberAdvanceIndex);
      } else {
        const setsAfter = existingSets.map((candidate) => ({
          setType: candidate.setType,
          completed: candidate.id === setId ? true : (rowOverrides[candidate.id]?.completed ?? candidate.completed),
          parentSetId: candidate.parentSetId ?? null,
        }));
        const nextIndex = shouldAutoAdvance({
          sets: setsAfter,
          enabled: autoAdvanceEnabled,
          currentIndex: exerciseIndex,
          exerciseCount: sessionExercises.length,
          completedSetType: row.setType,
          targetWorkingSets: exercise.targetSets,
        });
        if (nextIndex !== null) setCurrentIndex(nextIndex);
      }
    }

    // D-27: undoing a completed set while its own timer is still running cancels the scheduled
    // alert — only when this set is the one that currently owns the outstanding rest, not any
    // arbitrary undo elsewhere in the session.
    if (mode === LIVE_MODE && !nextCompleted && liveSession?.session.restTargetAt) {
      const owner = findMostRecentCompletedSet(liveSession, rowOverrides);
      if (owner?.id === setId) {
        await writeDb.update(workoutSession).set({ restTargetAt: null }).where(eq(workoutSession.id, liveSession.session.id));
        await cancelRestAlert();
      }
    }
  }

  function handleOpenRestTimer() {
    if (!headerTimer) return;
    router.push({
      pathname: '/rest-timer',
      params: {
        sessionId: headerTimer.sessionId,
        restTargetAtMs: headerTimer.restTargetAtMs !== null ? String(headerTimer.restTargetAtMs) : '',
      },
    });
  }

  async function handleAllowNotifications() {
    await requestAlertPermission();
    setNotificationPermission(await getAlertPermission());
  }

  function handleDismissNotificationPrompt() {
    setNotificationPromptDismissed(true);
  }

  async function handleTurnOnNotifications() {
    await openAlertSettings();
  }

  function handleDismissBackgroundAlertsOffNote() {
    if (sessionRow) setOffNoteDismissedForSessionId(sessionRow.id);
  }

  function handleToggleSessionMenu() {
    setSessionMenuOpen((current) => !current);
  }

  function handleOpenSessionNote() {
    setSessionMenuOpen(false);
    setSessionNoteSheetOpen(true);
  }

  async function handleSessionNoteSaved() {
    setSessionNoteSheetOpen(false);
    await reload();
  }

  function handleCancelSessionNote() {
    setSessionNoteSheetOpen(false);
  }

  // D-29: pause/resume live on this menu, not the action bar — a deliberate act, distinct from and
  // sharing no state with force-quit recovery.
  async function handlePauseResume() {
    if (!liveSession) return;
    setSessionMenuOpen(false);
    if (liveSession.session.pausedAt !== null) {
      await resumeSession(liveSession.session.id, new Date(), db);
    } else {
      await pauseSession(liveSession.session.id, new Date(), db);
    }
    await reload();
  }

  function handleRequestDiscard() {
    setSessionMenuOpen(false);
    setDiscardConfirmOpen(true);
  }

  // T-06-04: closes the menu and opens the sheet — no confirmation step (D-18 already establishes
  // the switch as reversible and harmless to anything logged).
  function handleOpenSwitchGym() {
    setSessionMenuOpen(false);
    setSwitchGymSheetOpen(true);
  }

  // On selection, restamp the session's gym column, then re-run the existing session read so the
  // resolved inventory the band uses comes from the newly-stamped gym (D-17/D-18) — no logged set
  // is touched, and no historical weight is re-derived; the write is exactly the session's one
  // gym column, nothing else.
  async function handleSelectGym(gymId: string) {
    if (!liveSession) return;
    await restampSessionGym(liveSession.session.id, gymId, db);
    setSwitchGymSheetOpen(false);
    await reload();
  }

  function handleManageGyms() {
    setSwitchGymSheetOpen(false);
    router.push('/gym-profiles');
  }

  function handleCancelSwitchGym() {
    setSwitchGymSheetOpen(false);
  }

  function handleCancelDiscard() {
    setDiscardConfirmOpen(false);
  }

  // D-28: discard is a status transition behind an explicit destructive confirmation, never a row
  // delete — everything already logged stays exactly where it is.
  async function handleConfirmDiscard() {
    if (!liveSession) return;
    setDiscardConfirmOpen(false);
    await discardSession(liveSession.session.id, db);
    router.push('/(tabs)');
  }

  async function handleFinishWorkout() {
    if (!liveSession) return;
    await finishSession(liveSession.session.id, router, db);
  }

  return {
    screenState,
    db: writeDb,
    userId,
    activeGymId: sessionRow?.equipmentProfileId ?? null,
    exercises,
    supersetGroupMembers,
    currentExerciseId: currentExercise?.id ?? null,
    currentIndex: safeIndex,
    pagerWidth,
    rowsByExercise,
    pageDataByExercise,
    activeField,
    bandState,
    onBandNeighbourPress: handleBandNeighbourPress,
    onBandRecoveryPress: handleBandRecoveryPress,
    equipmentTypeByExerciseId,
    resolvedInventory,
    equipmentProfileId: liveSession?.session.equipmentProfileId ?? null,
    starting,
    nextUp,
    weightUnit,
    headerTimer,
    paused: sessionRow !== null && sessionRow.pausedAt !== null,
    showNotificationPrompt,
    showBackgroundAlertsOffNote,
    showOneOffPicker: oneOffPickerOpen,
    showAddExercisePicker: addExercisePickerOpen,
    showSessionMenu: sessionMenuOpen,
    showDiscardConfirm: discardConfirmOpen,
    showSwitchGymSheet: switchGymSheetOpen,
    hasSessionNote: sessionRow !== null && sessionRow.notes !== null,
    sessionNoteText: sessionRow?.notes ?? null,
    showSessionNoteSheet: sessionNoteSheetOpen,
    onStartWorkout: () => void handleStartWorkout(),
    onStartOneOff: handleStartOneOff,
    onGoToPrograms: handleGoToPrograms,
    onAddOneOffExercises: (rows) => void handleAddOneOffExercises(rows),
    onCancelOneOffPicker: handleCancelOneOffPicker,
    onSelectExercise: handleSelectExercise,
    onIndexChange: handleIndexChange,
    onAddExercise: handleAddExercise,
    onConfirmAddExercise: (rows) => void handleConfirmAddExercise(rows),
    onCancelAddExercisePicker: handleCancelAddExercisePicker,
    onExerciseChanged: handleExerciseChanged,
    onFieldPress: handleFieldPress,
    onReferenceTap: (exerciseId, setId, field) => void handleReferenceTap(exerciseId, setId, field),
    onKeypadPress: handleKeypadPress,
    onSubmitField: () => void handleSubmitField(),
    onCheckmarkPress: (exerciseId, setId) => void handleCheckmarkPress(exerciseId, setId),
    onOpenRestTimer: handleOpenRestTimer,
    onAllowNotifications: () => void handleAllowNotifications(),
    onDismissNotificationPrompt: handleDismissNotificationPrompt,
    onTurnOnNotifications: () => void handleTurnOnNotifications(),
    onDismissBackgroundAlertsOffNote: handleDismissBackgroundAlertsOffNote,
    onToggleSessionMenu: handleToggleSessionMenu,
    onPauseResume: () => void handlePauseResume(),
    onRequestDiscard: handleRequestDiscard,
    onConfirmDiscard: () => void handleConfirmDiscard(),
    onCancelDiscard: handleCancelDiscard,
    onOpenSwitchGym: handleOpenSwitchGym,
    onSelectGym: (gymId) => void handleSelectGym(gymId),
    onManageGyms: handleManageGyms,
    onCancelSwitchGym: handleCancelSwitchGym,
    onOpenSessionNote: handleOpenSessionNote,
    onSessionNoteSaved: () => void handleSessionNoteSaved(),
    onCancelSessionNote: handleCancelSessionNote,
    onFinishWorkout: () => void handleFinishWorkout(),
  };
}

// The 'live' subtree: the exact screen that shipped before 05-10, unchanged. A distinct component
// so it mounts its own hooks unconditionally (rules of hooks) — the root below selects between
// this and EditingWorkoutRoute once, never calls both hooks from one function body.
function LiveWorkoutRoute({ colors, userId }: { colors: ThemeColors; userId: string | null }) {
  const vm = useWorkoutScreen({ userId });

  return (
    <SessionModeProvider mode="live">
      <WorkoutScreenView {...vm} colors={colors} />
    </SessionModeProvider>
  );
}

// The ONE place the workout screen decides which subtree to mount (D-32, UI-SPEC R10): a sessionId
// route param names a specific session — History's Edit action, or the add-a-past-workout entry
// point (05-10) — which always resolves to EditingWorkoutRoute's own 'editing' mode in practice,
// since History only ever surfaces Edit for a completed session. This file inspects no field of
// the loaded session data itself to reach that decision (no inline comparison against the session
// row's own lifecycle-state or finish-timestamp columns) — the mode decision lives inside
// EditingWorkoutScreen.tsx, behind resolveSessionScreenMode.
export default function WorkoutScreen() {
  const colors = useThemeColors();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const routeSessionId = params.sessionId ?? null;

  if (routeSessionId) {
    return <EditingWorkoutRoute sessionId={routeSessionId} userId={userId} colors={colors} />;
  }

  return <LiveWorkoutRoute colors={colors} userId={userId} />;
}
