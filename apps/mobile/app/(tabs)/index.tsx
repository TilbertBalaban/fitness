import { resolveTarget, type ResolvedTarget } from '@fitness/api-contracts';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { authClient } from '@/lib/auth-client';
import { getPowerSync } from '@/lib/db/powersync';
import { loadNextUp, type NextUpData } from '@/lib/db/programs/next-up-query';
import type { ProgramCycle, ProgramDay, ProgramSlot } from '@/lib/db/programs/load-program';
import { resolveNextUp, type NextUp } from '@/lib/programs/next-up';

const SKELETON_ROW_COUNT = 3;

export type HomeScreenState = 'error' | 'loading' | 'no-program' | 'ready';

export interface HomeScreenStateInput {
  failed: boolean;
  data: { routine: unknown } | null;
}

export function deriveHomeScreenState({ failed, data }: HomeScreenStateInput): HomeScreenState {
  if (failed) return 'error';
  if (data === null) return 'loading';
  if (data.routine === null) return 'no-program';
  return 'ready';
}

export function formatTimeOffRemaining(daysRemaining: number): string {
  if (daysRemaining <= 0) return 'Back tomorrow';
  return daysRemaining === 1 ? '1 day left' : `${daysRemaining} days left`;
}

export function nextUpHeading(nextUp: NextUp<ProgramDay, ProgramCycle>): string {
  switch (nextUp.kind) {
    case 'workout':
      return nextUp.cycle ? `${nextUp.day.name} · ${nextUp.cycle.name}` : nextUp.day.name;
    case 'time-off':
      return "You're on scheduled time off.";
    case 'program-complete':
      return 'Block complete';
    case 'no-days':
      return 'No days yet';
    default:
      return 'No active program';
  }
}

function displayOrDash(value: number | null): string {
  return value === null ? '—' : `${value}`;
}

function baseOf(slot: ProgramSlot): ResolvedTarget {
  return {
    targetSets: slot.targetSets,
    targetRepMin: slot.targetRepMin,
    targetRepMax: slot.targetRepMax,
    targetRir: slot.targetRir,
    targetRestSeconds: slot.targetRestSeconds,
  };
}

// The Home card's own line format (04-UI-SPEC "Home 'Next Up' Card") — deliberately *not* the slot
// row's compact summary line: this one uses × and @, and omits rest entirely. It shares only the
// em-dash-for-null convention, and it never collapses an equal rep range to one number.
export function formatNextUpExerciseLine(slot: ProgramSlot, cycleId: string | null): string {
  const resolved = resolveTarget(baseOf(slot), cycleId ? (slot.overridesByCycleId[cycleId] ?? null) : null);
  const untargeted =
    resolved.targetSets === null &&
    resolved.targetRepMin === null &&
    resolved.targetRepMax === null &&
    resolved.targetRir === null &&
    resolved.targetRestSeconds === null;
  if (untargeted) return `${slot.exerciseName}: No targets set.`;

  const sets = displayOrDash(resolved.targetSets);
  const reps = `${displayOrDash(resolved.targetRepMin)}–${displayOrDash(resolved.targetRepMax)}`;
  return `${slot.exerciseName}: ${sets} × ${reps} reps @ ${displayOrDash(resolved.targetRir)} RIR`;
}

export function dayTargetMuscles(slots: ProgramSlot[], musclesByExerciseId: Record<string, string[]>): string[] {
  const seen: string[] = [];
  for (const slot of slots) {
    for (const name of musclesByExerciseId[slot.exerciseId] ?? []) {
      if (!seen.includes(name)) seen.push(name);
    }
  }
  return seen;
}

// FilterChipRow's chip shape without its interaction: no Pressable, no accessibilityRole, no
// selected state, and no numberOfLines (R4 — new Phase 4 surfaces wrap and grow).
function MuscleChips({ muscles }: { muscles: string[] }) {
  if (muscles.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-sm">
      {muscles.map((muscle) => (
        <View key={muscle} className="rounded-md border border-foreground-muted bg-surface px-md py-sm">
          <Text className="text-label font-normal text-foreground-muted">{muscle}</Text>
        </View>
      ))}
    </View>
  );
}

function CardHeading({ children }: { children: string }) {
  return <Text className="text-heading font-semibold text-foreground">{children}</Text>;
}

function CardBody({ children }: { children: string }) {
  return <Text className="text-body font-normal text-foreground-muted">{children}</Text>;
}

function NextUpCard({
  nextUp,
  musclesByExerciseId,
}: {
  nextUp: NextUp<ProgramDay, ProgramCycle>;
  musclesByExerciseId: Record<string, string[]>;
}) {
  if (nextUp.kind === 'no-days') {
    return (
      <View className="gap-sm rounded-md bg-surface p-md">
        <CardHeading>{nextUpHeading(nextUp)}</CardHeading>
        <CardBody>Add a training day to this program to see what&apos;s next.</CardBody>
      </View>
    );
  }

  if (nextUp.kind === 'time-off') {
    return (
      <View className="gap-sm rounded-md bg-surface p-md opacity-60">
        <CardHeading>{nextUpHeading(nextUp)}</CardHeading>
        <CardBody>{formatTimeOffRemaining(nextUp.daysRemaining)}</CardBody>
      </View>
    );
  }

  if (nextUp.kind === 'program-complete') {
    return (
      <View className="gap-sm rounded-md bg-surface p-md">
        <CardHeading>{nextUpHeading(nextUp)}</CardHeading>
        <CardBody>You have finished every cycle in this program. Start it again or build a new one.</CardBody>
      </View>
    );
  }

  if (nextUp.kind !== 'workout') return null;

  const muscles = dayTargetMuscles(nextUp.day.slots, musclesByExerciseId);

  return (
    <View className="gap-md rounded-md bg-surface p-md">
      <CardHeading>{nextUpHeading(nextUp)}</CardHeading>
      <MuscleChips muscles={muscles} />
      {nextUp.day.slots.length === 0 ? (
        <CardBody>This day has no exercises yet.</CardBody>
      ) : (
        <View className="gap-sm">
          {nextUp.day.slots.map((slot) => (
            <Text key={slot.id} className="text-body font-normal text-foreground">
              {formatNextUpExerciseLine(slot, nextUp.cycle?.id ?? null)}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

export type NextUpRead = { data: NextUpData } | { failed: true };

// The whole body of the screen's focus effect, extracted so the read/failure sequence is exercised
// without a renderer (there is none in this workspace's lockfile). A success clears a previous
// failure: with the card now re-reading on every focus, a transient error must not outlive the
// read that succeeded after it.
export async function readNextUp(
  userId: string | null,
  load: (id: string | null) => Promise<NextUpData> = (id) => loadNextUp(id, getPowerSync()),
): Promise<NextUpRead> {
  try {
    return { data: await load(userId) };
  } catch (error) {
    console.error('next up load failed', error);
    return { failed: true };
  }
}

export default function HomeScreen() {
  const router = useRouter();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;
  const [data, setData] = useState<NextUpData | null>(null);
  const [failed, setFailed] = useState(false);

  // On focus, not on mount. Both tabs stay mounted in a tab navigator, so a mount-only read meant
  // activating a program on the Programs tab left Home reading "No active program" until the app
  // was killed — and the same staleness covered every day, exercise and target edit.
  //
  // This does not make the card reactive: a change arriving from the other device while Home is
  // already focused still waits for the next focus. Closing that needs a PowerSync watched query
  // over the seven tables the card derives from.
  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        const result = await readNextUp(userId);
        if (!active) return;
        if ('failed' in result) {
          setFailed(true);
          return;
        }
        setData(result.data);
        setFailed(false);
      })();

      return () => {
        active = false;
      };
    }, [userId]),
  );

  const nextUp = useMemo(
    () =>
      data
        ? resolveNextUp<ProgramDay, ProgramCycle>({
            routine: data.routine,
            days: data.days,
            cycles: data.cycles,
            history: data.history,
            today: data.today,
          })
        : null,
    [data],
  );

  const screenState = deriveHomeScreenState({ failed, data });

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 }}
    >
      <View className="mt-xl gap-lg">
        {screenState === 'error' ? (
          <View className="gap-sm">
            <CardHeading>{"Your program couldn't load"}</CardHeading>
            <CardBody>Restart the app to try again. Your programs and history are safe.</CardBody>
          </View>
        ) : null}

        {/* R6 — a local SQLite read renders no spinner; only the very first paint shows the
            skeleton pattern already shipped on the Programs tab. */}
        {screenState === 'loading' ? (
          <View className="gap-sm">
            {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
              <View key={index} className="rounded-md bg-surface" style={{ height: 64 }} />
            ))}
          </View>
        ) : null}

        {screenState === 'no-program' ? (
          <View className="gap-sm">
            <CardHeading>No active program</CardHeading>
            <CardBody>Build or activate one to see what&apos;s next.</CardBody>
            <Pressable
              onPress={() => router.push('/programs/library')}
              accessibilityRole="button"
              accessibilityLabel="Build or activate one"
              style={{ minHeight: 48, justifyContent: 'center' }}
            >
              <Text className="text-body font-normal text-accent">Build or activate one</Text>
            </Pressable>
          </View>
        ) : null}

        {screenState === 'ready' && nextUp ? (
          <NextUpCard nextUp={nextUp} musclesByExerciseId={data?.musclesByExerciseId ?? {}} />
        ) : null}

        {nextUp?.kind === 'program-complete' ? (
          <Pressable
            onPress={() => router.push('/(tabs)/programs')}
            accessibilityRole="button"
            accessibilityLabel="Go to Programs"
            style={{ minHeight: 48, justifyContent: 'center' }}
          >
            <Text className="text-body font-normal text-accent">Go to Programs</Text>
          </Pressable>
        ) : null}

        <View className="items-center">
          <PrimaryButton label="Browse exercises" onPress={() => router.push('/exercises')} />
        </View>
      </View>
    </ScrollView>
  );
}
