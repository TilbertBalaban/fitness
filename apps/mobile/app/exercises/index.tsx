import { FlashList } from '@shopify/flash-list';
import { and, eq, isNull } from 'drizzle-orm';
import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ExerciseListRow } from '@/components/ExerciseListRow';
import { FilterChipRow } from '@/components/FilterChipRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SearchField } from '@/components/SearchField';
import { authClient } from '@/lib/auth-client';
import {
  applyCatalogFilters,
  deriveExerciseListScreenState,
  deriveFacets,
  formatFacetLabel,
  formatResultCount,
  hasActiveFilters,
  sortCatalogResults,
  type CatalogExercise,
  type CatalogFilters,
  type CatalogMuscleMapping,
  type CatalogPreference,
} from '@/lib/catalog/catalog-filter';
import { loadCatalogSnapshot } from '@/lib/catalog/load-snapshot';
import { refreshCatalog } from '@/lib/catalog/refresh-catalog';
import { buildSearchIndex, searchCatalog } from '@/lib/catalog/search-index';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { exercise, exerciseMuscleMapping, muscleGroup, seededExercise, userExercisePreference } from '@/lib/db/schema';

type CatalogRow = CatalogExercise & { imageUri: string | null };

interface CatalogData {
  rows: CatalogRow[];
  mappings: CatalogMuscleMapping[];
  preferences: CatalogPreference[];
  muscleGroupNames: Map<string, string>;
}

const EMPTY_FILTERS: CatalogFilters = { muscleGroupIds: [], equipment: [], movementPatterns: [] };
const SKELETON_ROW_COUNT = 6;

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

// Union of seeded rows (localOnly, WINDOWS #32) and the user's own custom rows (synced
// `exercise`, is_custom=true) — two plain selects rather than a SQL UNION, since a mixed
// plain/localOnly DrizzleAppSchema's query-wrapper support for UNION is unverified in this
// codebase (RESEARCH.md Pattern 1's own caveat). Both content-level archivedAt columns are
// excluded at the read: a seeded row that vanished from a newer catalog artifact, or a custom row
// the drift path archived, must never reach the list — this is a different concept from the
// per-user archive/never-suggest state in user_exercise_preference, which applyCatalogFilters
// handles separately.
async function loadCatalogRows(db: WriteDb): Promise<CatalogData> {
  const seededRows = await db
    .select({
      id: seededExercise.id,
      name: seededExercise.name,
      aliases: seededExercise.aliases,
      movementPattern: seededExercise.movementPattern,
      equipmentRequired: seededExercise.equipmentRequired,
      imageUrls: seededExercise.imageUrls,
    })
    .from(seededExercise)
    .where(isNull(seededExercise.archivedAt));

  const customRows = await db
    .select({
      id: exercise.id,
      name: exercise.name,
      aliases: exercise.aliases,
      movementPattern: exercise.movementPattern,
      equipmentRequired: exercise.equipmentRequired,
      imageUrls: exercise.imageUrls,
    })
    .from(exercise)
    .where(and(eq(exercise.isCustom, true), isNull(exercise.archivedAt)));

  const rows: CatalogRow[] = [...seededRows, ...customRows].map((row) => {
    const imageUrls = parseJsonArray(row.imageUrls);
    return {
      id: row.id,
      name: row.name,
      aliases: row.aliases ? parseJsonArray(row.aliases) : null,
      movementPattern: row.movementPattern,
      equipmentRequired: row.equipmentRequired,
      imageUri: imageUrls[0] ?? null,
    };
  });

  const mappings: CatalogMuscleMapping[] = await db
    .select({ exerciseId: exerciseMuscleMapping.exerciseId, muscleGroupId: exerciseMuscleMapping.muscleGroupId })
    .from(exerciseMuscleMapping);

  const preferences: CatalogPreference[] = await db
    .select({
      userId: userExercisePreference.userId,
      exerciseId: userExercisePreference.exerciseId,
      archivedAt: userExercisePreference.archivedAt,
    })
    .from(userExercisePreference);

  const groups = await db.select({ id: muscleGroup.id, name: muscleGroup.name }).from(muscleGroup);
  const muscleGroupNames = new Map(groups.map((group) => [group.id, group.name]));

  return { rows, mappings, preferences, muscleGroupNames };
}

export default function ExercisesScreen() {
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_FILTERS);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const db = getPowerSync();
      try {
        const loadResult = await loadCatalogSnapshot(db);
        if (loadResult.status === 'invalid') {
          if (mounted) setFailed(true);
          return;
        }
        const loaded = await loadCatalogRows(db);
        if (mounted) setCatalog(loaded);
      } catch {
        if (mounted) setFailed(true);
        return;
      }

      // Fired only after the local read has already populated the screen (03-05 Task 3's own
      // instruction) — an 'offline' outcome is ignored silently, the screen must never block on
      // it and a failure here is not one the user needs to see.
      void refreshCatalog(db);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const searchIndex = useMemo(() => (catalog ? buildSearchIndex(catalog.rows) : null), [catalog]);

  const results = useMemo(() => {
    if (!catalog || !searchIndex) return [];
    const searched = searchCatalog(searchIndex, query, catalog.rows);
    const filtered = applyCatalogFilters(searched, catalog.mappings, catalog.preferences, filters, userId);
    return sortCatalogResults(filtered);
  }, [catalog, searchIndex, query, filters, userId]);

  const facets = useMemo(
    () => (catalog ? deriveFacets(catalog.rows, catalog.mappings) : { muscleGroupIds: [], equipment: [], movementPatterns: [] }),
    [catalog],
  );

  const tagsByExerciseId = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!catalog) return map;
    for (const mapping of catalog.mappings) {
      const label = catalog.muscleGroupNames.get(mapping.muscleGroupId) ?? mapping.muscleGroupId;
      const existing = map.get(mapping.exerciseId);
      if (existing) existing.push(label);
      else map.set(mapping.exerciseId, [label]);
    }
    return map;
  }, [catalog]);

  const screenState = deriveExerciseListScreenState({
    failed,
    rows: catalog ? catalog.rows : null,
    resultCount: results.length,
  });

  const toggleFilterValue = useCallback((dimension: keyof CatalogFilters, id: string) => {
    setFilters((current) => {
      const values = current[dimension];
      const next = values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
      return { ...current, [dimension]: next };
    });
  }, []);

  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  if (screenState === 'error') {
    return (
      <View className="flex-1 items-center justify-center bg-background px-lg">
        <Text className="text-center text-heading font-semibold text-foreground">
          {"Exercise catalog couldn't load"}
        </Text>
        <Text className="mt-sm text-center text-body font-normal text-foreground-muted">
          Restart the app to try again. Your saved exercises and history are safe.
        </Text>
      </View>
    );
  }

  const muscleGroupOptions = facets.muscleGroupIds.map((id) => ({
    id,
    label: catalog?.muscleGroupNames.get(id) ?? formatFacetLabel(id),
  }));
  const equipmentOptions = facets.equipment.map((id) => ({ id, label: formatFacetLabel(id) }));
  const movementPatternOptions = facets.movementPatterns.map((id) => ({ id, label: formatFacetLabel(id) }));

  return (
    <View className="flex-1 bg-background">
      <FlashList
        data={screenState === 'populated' ? results : []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}
        renderItem={({ item }) => (
          <View className="mb-sm">
            <Link href={{ pathname: '/exercises/[id]', params: { id: item.id } }} asChild>
              <ExerciseListRow
                name={item.name}
                imageUri={item.imageUri}
                tags={[
                  ...(tagsByExerciseId.get(item.id) ?? []),
                  ...(item.equipmentRequired ? [formatFacetLabel(item.equipmentRequired)] : []),
                ]}
                onPress={() => {}}
              />
            </Link>
          </View>
        )}
        ListHeaderComponent={
          <View className="mt-xl gap-md">
            <View className="flex-row items-center justify-between gap-sm">
              <Text className="text-heading font-semibold text-foreground">Exercises</Text>
              {/* Routes to /exercises/new, which 03-08 creates — inert until then (no-op onPress,
                  documented in 03-06-SUMMARY.md's Known Stubs rather than left unexplained). */}
              <PrimaryButton label="Add Custom Exercise" onPress={() => {}} />
            </View>

            <SearchField onDebouncedChange={setQuery} />

            <FilterChipRow
              title="Muscle Group"
              options={muscleGroupOptions}
              selectedIds={filters.muscleGroupIds}
              onToggle={(id) => toggleFilterValue('muscleGroupIds', id)}
            />
            <FilterChipRow
              title="Equipment"
              options={equipmentOptions}
              selectedIds={filters.equipment}
              onToggle={(id) => toggleFilterValue('equipment', id)}
            />
            <FilterChipRow
              title="Movement Pattern"
              options={movementPatternOptions}
              selectedIds={filters.movementPatterns}
              onToggle={(id) => toggleFilterValue('movementPatterns', id)}
            />

            {screenState === 'populated' ? (
              <Text className="text-label font-normal text-foreground-muted">{formatResultCount(results.length)}</Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          screenState === 'empty' ? (
            <View className="mt-xl items-center gap-sm">
              <Text className="text-center text-heading font-semibold text-foreground">No exercises found</Text>
              <Text className="text-center text-body font-normal text-foreground-muted">
                Try a different search term or clear your filters.
              </Text>
              {hasActiveFilters(filters) ? (
                <Pressable
                  onPress={clearFilters}
                  accessibilityRole="button"
                  accessibilityLabel="Clear Filters"
                  className="items-center justify-center px-md"
                  style={{ minHeight: 48 }}
                >
                  <Text className="text-body font-normal text-foreground">Clear Filters</Text>
                </Pressable>
              ) : null}
            </View>
          ) : screenState === 'loading' ? (
            <View className="mt-xl gap-sm">
              {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
                <View key={index} className="rounded-md bg-surface" style={{ height: 64 }} />
              ))}
            </View>
          ) : null
        }
      />
    </View>
  );
}
