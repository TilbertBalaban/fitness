import { and, eq } from 'drizzle-orm';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { loadCatalogSnapshot } from '@/lib/catalog/load-snapshot';
import { getPowerSync } from '@/lib/db/powersync';
import { exercise, exerciseMuscleMapping, muscleGroup } from '@/lib/db/schema';

interface ExerciseRow {
  id: string;
  name: string;
  primaryMuscleName: string | null;
}

export default function ExercisesScreen() {
  const [rows, setRows] = useState<ExerciseRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const db = getPowerSync();
        const result = await loadCatalogSnapshot(db);
        if (result.status === 'invalid') {
          if (mounted) setFailed(true);
          return;
        }

        const exerciseRows = await db.select({ id: exercise.id, name: exercise.name }).from(exercise);

        const withMuscles: ExerciseRow[] = [];
        for (const row of exerciseRows) {
          const [mapping] = await db
            .select({ muscleGroupId: exerciseMuscleMapping.muscleGroupId })
            .from(exerciseMuscleMapping)
            .where(and(eq(exerciseMuscleMapping.exerciseId, row.id), eq(exerciseMuscleMapping.role, 'primary')));

          let primaryMuscleName: string | null = null;
          if (mapping) {
            const [group] = await db
              .select({ name: muscleGroup.name })
              .from(muscleGroup)
              .where(eq(muscleGroup.id, mapping.muscleGroupId));
            primaryMuscleName = group?.name ?? null;
          }

          withMuscles.push({ id: row.id, name: row.name, primaryMuscleName });
        }

        if (mounted) setRows(withMuscles);
      } catch {
        if (mounted) setFailed(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

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

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
      <Text className="mt-xl text-heading font-semibold text-foreground">Exercises</Text>

      <View className="mt-md gap-sm">
        {(rows ?? []).map((row) => (
          <Link key={row.id} href={{ pathname: '/exercises/[id]', params: { id: row.id } }} asChild>
            <Pressable
              accessibilityRole="button"
              className="flex-row items-center rounded-md bg-surface px-md"
              style={{ minHeight: 48 }}
            >
              <View className="flex-1 py-sm">
                <Text className="text-body font-normal text-foreground" numberOfLines={1}>
                  {row.name}
                </Text>
                {row.primaryMuscleName ? (
                  <Text className="text-label font-normal text-foreground-muted">{row.primaryMuscleName}</Text>
                ) : null}
              </View>
            </Pressable>
          </Link>
        ))}
      </View>
    </ScrollView>
  );
}
