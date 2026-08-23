import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';
import type { KeypadField } from './NumericKeypad';
import { SetRowView, type SetRowReference, type SetRowValues } from './SetRow';

export interface ExercisePageSetRow {
  setId: string | null;
  setIndex: number;
  values: SetRowValues;
  reference: SetRowReference;
  completed: boolean;
}

export interface ExercisePageActiveField {
  setId: string | null;
  field: KeypadField;
}

export interface ExercisePageViewProps {
  exerciseName: string;
  rows: ExercisePageSetRow[];
  activeField: ExercisePageActiveField | null;
  colors: ThemeColors;
  actionBarSlot?: ReactNode;
  onFieldPress: (setId: string | null, field: KeypadField, currentValue: string | null) => void;
  onReferenceTap: (setId: string | null, field: 'weight' | 'reps') => void;
  onCheckmarkPress: (setId: string | null) => void;
}

// Hook-free — direct-invocable by a test, matching CycleStripView/DayDeckView. `rows` arrives
// pre-ordered by the caller (workout.tsx's buildSetRows sorts warm-ups ahead of working sets
// regardless of raw set_index, per RESEARCH.md Pitfall 2) — this component only renders the order
// it is given. `actionBarSlot` is a render-prop slot 05-06 fills with the Warm-up/Targets/Note
// action bar (D-13); left undefined this task since those actions don't exist yet.
export function ExercisePageView({ exerciseName, rows, activeField, colors, actionBarSlot, onFieldPress, onReferenceTap, onCheckmarkPress }: ExercisePageViewProps) {
  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
        <Text className="mb-md text-heading font-semibold text-foreground">{exerciseName}</Text>
        {actionBarSlot ?? null}
        {rows.map((row) => (
          <SetRowView
            key={row.setId ?? `draft-${row.setIndex}`}
            setIndex={row.setIndex}
            values={row.values}
            reference={row.reference}
            completed={row.completed}
            activeField={activeField && activeField.setId === row.setId ? activeField.field : null}
            colors={colors}
            onFieldPress={(field) => onFieldPress(row.setId, field, row.values[field])}
            onReferenceTap={(field) => onReferenceTap(row.setId, field)}
            onCheckmarkPress={() => onCheckmarkPress(row.setId)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

export interface ExercisePageProps extends Omit<ExercisePageViewProps, 'colors'> {}

export function ExercisePage(props: ExercisePageProps) {
  const colors = useThemeColors();
  return <ExercisePageView {...props} colors={colors} />;
}
