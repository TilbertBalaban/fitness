import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { EXERCISE_THUMBNAIL_WIDTH, ExerciseImageTile } from '@/components/ExerciseImageTile';
import { getLocalCatalogImage } from '@/lib/catalog/catalog-image-map.generated';
import { SWAP_RESULT_CAP, type ScoredCandidate } from '@/lib/catalog/smart-swap';

export interface SwapSuggestionListProps {
  candidates: ScoredCandidate[];
}

// "{n} suggested alternative" / "{n} suggested alternatives" — the exact Copywriting Contract
// pluralization (UI-SPEC E6). n=0 never reaches this — the caller routes to the empty state below.
function pluralizeSuggestionHeader(count: number): string {
  return `${count} suggested alternative${count === 1 ? '' : 's'}`;
}

// Renders the capped, ordered candidates as a plain mapped list — never a nested FlashList or
// ScrollView. The cap (enforced again here, defensively, independent of the scorer already
// capping) is precisely what lets this section live inside the detail screen's own ScrollView
// without needing its own nested scroll region. A candidate whose `why` is blank is dropped rather
// than rendered: an unexplained suggestion is exactly what choosing a deterministic scorer over a
// similarity model was meant to avoid (UI-SPEC E6 populated/partial rows).
export function SwapSuggestionList({ candidates }: SwapSuggestionListProps) {
  const visible = candidates.filter((candidate) => candidate.why.trim().length > 0).slice(0, SWAP_RESULT_CAP);

  if (visible.length === 0) {
    return (
      <View className="mt-lg gap-xs">
        <Text className="text-heading font-semibold text-foreground">No good alternatives found</Text>
        <Text className="text-body font-normal text-foreground-muted">Try browsing the full catalog instead.</Text>
        <Link href="/exercises" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Browse Catalog"
            style={{ minHeight: 48 }}
            className="items-center justify-start"
          >
            <Text className="text-body font-normal text-accent">Browse Catalog</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  return (
    <View className="mt-lg gap-xs">
      <Text className="text-body font-semibold text-foreground">{pluralizeSuggestionHeader(visible.length)}</Text>
      <View className="gap-sm">
        {visible.map((candidate) => (
          <Link key={candidate.id} href={{ pathname: '/exercises/[id]', params: { id: candidate.id } }} asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={candidate.name}
              className="flex-row items-center gap-sm rounded-md bg-surface px-md py-sm"
              style={{ minHeight: 48 }}
            >
              <ExerciseImageTile localSource={getLocalCatalogImage(candidate.id)} width={EXERCISE_THUMBNAIL_WIDTH} />
              <View className="flex-1 gap-xs">
                <Text className="text-body font-normal text-foreground" numberOfLines={1}>
                  {candidate.name}
                </Text>
                <Text className="text-label font-normal text-foreground-muted" numberOfLines={2}>
                  {candidate.why}
                </Text>
              </View>
            </Pressable>
          </Link>
        ))}
      </View>
    </View>
  );
}
