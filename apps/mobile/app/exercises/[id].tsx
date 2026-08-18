import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { DetailSection } from '@/components/DetailSection';
import { ExerciseImageTile } from '@/components/ExerciseImageTile';
import { MuscleTargetList } from '@/components/MuscleTargetList';
import { getLocalCatalogImage } from '@/lib/catalog/catalog-image-map.generated';
import { loadExerciseDetail, type ExerciseDetail } from '@/lib/catalog/exercise-detail';
import { getPowerSync } from '@/lib/db/powersync';

export type DetailScreenState =
  | { status: 'found'; detail: ExerciseDetail }
  | { status: 'not-found' }
  | { status: 'error' };

// Extracted so "an unknown exercise id renders a not-found state rather than throwing or
// rendering a blank screen" is directly testable without invoking the hook-bearing screen
// component itself — this is the exact classification the useEffect below drives its three
// render branches from, not a parallel copy of that logic.
export async function resolveDetailScreenState(
  loader: () => Promise<ExerciseDetail | null>,
): Promise<DetailScreenState> {
  try {
    const result = await loader();
    return result ? { status: 'found', detail: result } : { status: 'not-found' };
  } catch {
    return { status: 'error' };
  }
}

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!id) return;
    let mounted = true;

    (async () => {
      const state = await resolveDetailScreenState(() => loadExerciseDetail(getPowerSync(), id));
      if (!mounted) return;
      if (state.status === 'found') {
        setDetail(state.detail);
      } else if (state.status === 'not-found') {
        setNotFound(true);
      } else {
        setFailed(true);
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

  if (notFound) {
    return (
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 }}
      >
        <View className="mt-xl items-center">
          <Text className="text-center text-heading font-semibold text-foreground">Exercise not found</Text>
          <Text className="mt-sm text-center text-body font-normal text-foreground-muted">
            This exercise may have been removed. Go back and try another.
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (!detail) {
    return null;
  }

  // The offline guarantee this screen exists to keep: never resolve an image over the network.
  // image_urls still points at live raw.githubusercontent.com URLs (WINDOWS #35, unresolved) —
  // this deliberately never reads that field. Only the vendored local bundle (WINDOWS #36) is
  // ever rendered; an exercise absent from the manifest falls back to the placeholder tile, the
  // same tile a load failure or a missing image already falls back to.
  const localImage = getLocalCatalogImage(detail.id);

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
      <Text className="mt-xl text-heading font-semibold text-foreground">{detail.name}</Text>

      <View className="mt-md">
        <ExerciseImageTile localSource={localImage} />
      </View>

      {detail.primaryMuscles.length > 0 ? (
        <View className="mt-lg gap-xs">
          <Text className="text-body font-semibold text-foreground">Target Muscles</Text>
          <MuscleTargetList primaryMuscles={detail.primaryMuscles} secondaryMuscles={detail.secondaryMuscles} />
        </View>
      ) : null}

      <DetailSection heading="Setup">{detail.instructionsText}</DetailSection>

      <DetailSection heading="Cues">{detail.cueText}</DetailSection>

      <View className="mt-lg gap-xs">
        <Text className="text-body font-semibold text-foreground">Suggested Alternatives</Text>
        <Text className="text-body font-normal text-foreground-muted">Coming in this phase.</Text>
      </View>
    </ScrollView>
  );
}
