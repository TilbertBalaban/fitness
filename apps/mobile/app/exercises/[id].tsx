import { eq } from 'drizzle-orm';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ExerciseImageTile } from '@/components/ExerciseImageTile';
import { getPowerSync } from '@/lib/db/powersync';
import { exercise, exerciseMuscleMapping, muscleGroup, seededExercise } from '@/lib/db/schema';

interface ExerciseDetail {
  id: string;
  name: string;
  cueText: string | null;
  instructionsText: string | null;
}

interface MuscleRow {
  name: string;
  role: string;
}

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const [muscles, setMuscles] = useState<MuscleRow[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!id) return;
    let mounted = true;

    (async () => {
      try {
        const db = getPowerSync();
        // Seeded rows live in localOnly seededExercise (WINDOWS #32); custom rows stay in the
        // synced `exercise` table. An id is unique across both, so at most one query returns a row.
        const [seededRow] = await db
          .select({
            id: seededExercise.id,
            name: seededExercise.name,
            cueText: seededExercise.cueText,
            instructionsText: seededExercise.instructionsText,
          })
          .from(seededExercise)
          .where(eq(seededExercise.id, id));

        const row =
          seededRow ??
          (
            await db
              .select({
                id: exercise.id,
                name: exercise.name,
                cueText: exercise.cueText,
                instructionsText: exercise.instructionsText,
              })
              .from(exercise)
              .where(eq(exercise.id, id))
          )[0];

        if (!row) {
          if (mounted) setFailed(true);
          return;
        }

        const mappingRows = await db
          .select({ muscleGroupId: exerciseMuscleMapping.muscleGroupId, role: exerciseMuscleMapping.role })
          .from(exerciseMuscleMapping)
          .where(eq(exerciseMuscleMapping.exerciseId, id));

        const muscleRows: MuscleRow[] = [];
        for (const mapping of mappingRows) {
          const [group] = await db
            .select({ name: muscleGroup.name })
            .from(muscleGroup)
            .where(eq(muscleGroup.id, mapping.muscleGroupId));
          if (group) muscleRows.push({ name: group.name, role: mapping.role });
        }

        if (mounted) {
          setDetail(row);
          setMuscles(muscleRows);
        }
      } catch {
        if (mounted) setFailed(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  if (failed) {
    return (
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 }}
      >
        <View className="mt-xl items-center">
          <Text className="text-center text-heading font-semibold text-foreground">
            Exercise catalog couldn&apos;t load
          </Text>
          <Text className="mt-sm text-center text-body font-normal text-foreground-muted">
            Restart the app to try again. Your saved exercises and history are safe.
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (!detail) {
    return null;
  }

  const primaryMuscles = muscles.filter((muscle) => muscle.role === 'primary').map((muscle) => muscle.name);
  const secondaryMuscles = muscles.filter((muscle) => muscle.role === 'secondary').map((muscle) => muscle.name);

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
      <Text className="mt-xl text-heading font-semibold text-foreground">{detail.name}</Text>

      <View className="mt-md">
        <ExerciseImageTile uri={null} />
      </View>

      {muscles.length > 0 ? (
        <View className="mt-lg gap-xs">
          <Text className="text-body font-semibold text-foreground">Target Muscles</Text>
          {primaryMuscles.length > 0 ? (
            <Text className="text-body font-normal text-foreground-muted">Primary: {primaryMuscles.join(', ')}</Text>
          ) : null}
          {secondaryMuscles.length > 0 ? (
            <Text className="text-body font-normal text-foreground-muted">
              Secondary: {secondaryMuscles.join(', ')}
            </Text>
          ) : null}
        </View>
      ) : null}

      {detail.cueText ? (
        <View className="mt-lg gap-xs">
          <Text className="text-body font-semibold text-foreground">Cue</Text>
          <Text className="text-body font-normal text-foreground">{detail.cueText}</Text>
        </View>
      ) : null}

      {detail.instructionsText ? (
        <View className="mt-lg gap-xs">
          <Text className="text-body font-semibold text-foreground">Instructions</Text>
          <Text className="text-body font-normal text-foreground">{detail.instructionsText}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
