import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { WeightUnit } from '@fitness/api-contracts';
import type { MuscleContribution } from '@fitness/analytics-engine';
import { pluralizeCount } from '@/lib/analytics/chart-labels';
import { formatMuscleVolumeLabel } from '@/lib/analytics/muscle-map-labels';

// The same separator RecordRow/MuscleVolumeRow already use for "join a few short facts on one
// line" — one middle-dot vocabulary, not a second one invented here.
const MIDDLE_DOT = ' · ';

export type MuscleDrilldownState = 'error' | 'empty' | 'populated';

export interface MuscleDrilldownStateInput {
  failed: boolean;
  contributions: MuscleContribution[] | null;
}

// Three states only — error, empty, populated. There is deliberately no fourth "loading" branch:
// the read behind this sheet is bounded to one muscle group, one already-selected window and one
// local device, and the shipped precedent for this class of read (deriveRecordsScreenState's own
// shape) is to resolve before presenting rather than flash an ActivityIndicator or Spinner (R6).
// The host never mounts this component until the read has settled, so `contributions === null`
// here only ever means "landed with nothing", never "still loading" — say that here so nobody
// later adds a loading branch back in.
export function deriveMuscleDrilldownState({ failed, contributions }: MuscleDrilldownStateInput): MuscleDrilldownState {
  if (failed) return 'error';
  if (contributions === null || contributions.length === 0) return 'empty';
  return 'populated';
}

// The subheader's two branches: a trained muscle joins the window to its volume label; an
// untrained one joins the window to the word Untrained — never a fabricated zero (D-09/D-10).
function drilldownSubheader(windowLabel: string, volumeLabel: string | null): string {
  return volumeLabel === null
    ? `${windowLabel}${MIDDLE_DOT}Untrained`
    : `${windowLabel}${MIDDLE_DOT}${volumeLabel} Training Volume`;
}

// Composed for testability without a renderer, matching muscleVolumeRowLabel's precedent — the
// announced sentence names the exercise, its set count, its contributed volume, and which muscle
// it contributed to.
export function muscleDrilldownRowLabel(contribution: MuscleContribution, muscleName: string, volumeLabel: string): string {
  return `${contribution.exerciseName}, ${pluralizeCount(contribution.setCount, 'set', 'sets')}, ${volumeLabel} contributed to ${muscleName}`;
}

export interface MuscleDrilldownRowProps {
  contribution: MuscleContribution;
  muscleName: string;
  volumeLabel: string;
  onPress: (exerciseId: string) => void;
}

// A plain function, called rather than rendered as a JSX tag — records.tsx's renderStateBlock
// precedent, so a direct-invocation test can see inside the row rather than the row staying an
// opaque, unexpanded custom-element node. Modelled on RecordRow's anatomy — one Pressable, flex-1,
// forty-eight-pixel minimum height. Neither line takes a line clamp (R4): a long exercise name
// wraps and the row grows.
function renderMuscleDrilldownRow({ contribution, muscleName, volumeLabel, onPress }: MuscleDrilldownRowProps) {
  const factLine = `${pluralizeCount(contribution.setCount, 'set', 'sets')}${MIDDLE_DOT}${volumeLabel}`;

  return (
    <Pressable
      key={contribution.exerciseId}
      onPress={() => onPress(contribution.exerciseId)}
      accessibilityRole="button"
      accessibilityLabel={muscleDrilldownRowLabel(contribution, muscleName, volumeLabel)}
      className="flex-row items-center gap-sm rounded-md bg-surface px-md py-sm"
      style={{ minHeight: 48 }}
    >
      <View className="flex-1 justify-center gap-xs">
        <Text className="text-body font-normal text-foreground">{contribution.exerciseName}</Text>
        <Text className="text-label font-normal text-foreground-muted">{factLine}</Text>
      </View>
    </Pressable>
  );
}

// A plain function, called rather than rendered as a JSX tag — records.tsx's renderStateBlock and
// muscle-map.tsx's own precedent: an element stays an opaque, unexpanded node to a test that walks
// the tree by direct invocation with no renderer.
function renderStateBlock(heading: string, body: string) {
  return (
    <View className="gap-xs pt-lg">
      <Text className="text-heading font-semibold text-foreground">{heading}</Text>
      <Text className="text-body font-normal text-foreground-muted">{body}</Text>
    </View>
  );
}

export interface MuscleDrilldownSheetViewProps {
  state: MuscleDrilldownState;
  muscleName: string;
  windowLabel: string;
  // The muscle's own pre-formatted total — the same value MuscleVolumeRow already renders for this
  // muscle. Null means untrained; the subheader never fabricates a "0 kg" (D-09/D-10).
  volumeLabel: string | null;
  weightUnit: WeightUnit;
  contributions: MuscleContribution[];
  onSelectExercise: (exerciseId: string) => void;
  onClose: () => void;
}

// Hook-free — direct invocation with no renderer, matching MuscleMapScreenView's own house shape.
// Presented via the same <Modal transparent animationType="fade" onRequestClose={onClose}> idiom
// HistoryActionSheet/RenameSessionDialog already use, self-contained here (rather than left for the
// host to wrap) since this whole component is the one thing 10-06's seam conditionally mounts.
export function MuscleDrilldownSheetView({
  state,
  muscleName,
  windowLabel,
  volumeLabel,
  weightUnit,
  contributions,
  onSelectExercise,
  onClose,
}: MuscleDrilldownSheetViewProps) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-background/80 px-lg">
        <ScrollView className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg" contentContainerStyle={{ flexGrow: 1 }}>
          <View className="flex-row items-center justify-between gap-sm">
            <Text className="flex-1 text-heading font-semibold text-foreground">{muscleName}</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={{ minWidth: 48, minHeight: 48 }}
              className="items-center justify-center rounded-md px-md py-sm"
            >
              <Text className="text-label font-normal text-foreground-muted">Close</Text>
            </Pressable>
          </View>

          {state === 'error' ? null : (
            <Text className="text-label font-normal text-foreground-muted">{drilldownSubheader(windowLabel, volumeLabel)}</Text>
          )}

          {state === 'error'
            ? renderStateBlock("Couldn't load", 'Restart the app to try again. Your programs and history are safe.')
            : null}

          {state === 'empty'
            ? renderStateBlock(
                `No sets for ${muscleName} in ${windowLabel}`,
                'Widen the time range or log an exercise that trains this muscle.',
              )
            : null}

          {state === 'populated' ? (
            <View className="mt-md gap-sm">
              {contributions.map((contribution) =>
                renderMuscleDrilldownRow({
                  contribution,
                  muscleName,
                  volumeLabel: formatMuscleVolumeLabel(contribution.weightedVolumeKg, weightUnit),
                  onPress: onSelectExercise,
                }),
              )}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

export interface MuscleDrilldownSheetProps {
  muscleName: string;
  windowLabel: string;
  volumeLabel: string | null;
  weightUnit: WeightUnit;
  contributions: MuscleContribution[];
  failed: boolean;
  onSelectExercise: (exerciseId: string) => void;
  onClose: () => void;
}

// Thin themed wrapper, the same split every sibling component uses — MuscleDrilldownSheetView is
// the hook-free, directly-invocable half; this resolves colors and the state classifier and hands
// both down.
export function MuscleDrilldownSheet({
  muscleName,
  windowLabel,
  volumeLabel,
  weightUnit,
  contributions,
  failed,
  onSelectExercise,
  onClose,
}: MuscleDrilldownSheetProps) {
  const state = deriveMuscleDrilldownState({ failed, contributions });

  return (
    <MuscleDrilldownSheetView
      state={state}
      muscleName={muscleName}
      windowLabel={windowLabel}
      volumeLabel={volumeLabel}
      weightUnit={weightUnit}
      contributions={contributions}
      onSelectExercise={onSelectExercise}
      onClose={onClose}
    />
  );
}
