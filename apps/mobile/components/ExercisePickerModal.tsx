import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ExerciseListRow } from '@/components/ExerciseListRow';
import { FilterChipRow } from '@/components/FilterChipRow';
import { SearchField } from '@/components/SearchField';
import { loadCatalogRows } from '@/app/exercises';
import { authClient } from '@/lib/auth-client';
import { getLocalCatalogImage } from '@/lib/catalog/catalog-image-map.generated';
import {
  applyCatalogFilters,
  deriveFacets,
  formatFacetLabel,
  hasActiveFilters,
  sortCatalogResults,
  type CatalogFilters,
} from '@/lib/catalog/catalog-filter';
import { formatSelectionCount, orderedSelection, toggleSelection } from '@/lib/catalog/picker-selection';
import { buildSearchIndex, searchCatalog } from '@/lib/catalog/search-index';
import { getPowerSync } from '@/lib/db/powersync';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

type CatalogData = Awaited<ReturnType<typeof loadCatalogRows>>;
export type PickerCatalogRow = CatalogData['rows'][number];

const EMPTY_FILTERS: CatalogFilters = { muscleGroupIds: [], equipment: [], movementPatterns: [] };
const SKELETON_ROW_COUNT = 6;

export type PickerScreenState = 'loading' | 'error' | 'empty' | 'populated';

interface FilterOption {
  id: string;
  label: string;
}

export interface ExercisePickerModalViewProps {
  dayName: string;
  screenState: PickerScreenState;
  catalogRows: PickerCatalogRow[];
  results: PickerCatalogRow[];
  tagsByExerciseId: Map<string, string[]>;
  query: string;
  filters: CatalogFilters;
  muscleGroupOptions: FilterOption[];
  equipmentOptions: FilterOption[];
  movementPatternOptions: FilterOption[];
  selectedIds: string[];
  colors: ThemeColors;
  onQueryChange: (query: string) => void;
  onToggleFilter: (dimension: keyof CatalogFilters, id: string) => void;
  onClearFilters: () => void;
  onToggle: (id: string) => void;
  onAdd: (rows: PickerCatalogRow[]) => void;
  onCancel: () => void;
}

// Hook-free — direct-invocable by a test, matching the ExerciseImageTile/SwapSuggestionList split.
// All derived state (search/filter results, facet option lists, theme colors) is computed by the
// stateful ExercisePickerModal wrapper and passed in as props, so this function calls no hook.
export function ExercisePickerModalView({
  dayName,
  screenState,
  catalogRows,
  results,
  tagsByExerciseId,
  query,
  filters,
  muscleGroupOptions,
  equipmentOptions,
  movementPatternOptions,
  selectedIds,
  colors,
  onQueryChange,
  onToggleFilter,
  onClearFilters,
  onToggle,
  onAdd,
  onCancel,
}: ExercisePickerModalViewProps) {
  const addDisabled = selectedIds.length === 0;

  const handleAdd = () => {
    if (addDisabled) return;
    onAdd(orderedSelection(selectedIds, catalogRows));
  };

  return (
    <View className="flex-1 bg-background">
      <View className="mt-xl gap-md px-lg">
        <View className="flex-row items-center justify-between gap-sm">
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={{ minHeight: 48, justifyContent: 'center' }}
          >
            <Text className="text-body font-normal text-accent">Cancel</Text>
          </Pressable>

          <Pressable
            onPress={handleAdd}
            disabled={addDisabled}
            accessibilityRole="button"
            accessibilityLabel="Add exercises to day"
            accessibilityState={{ disabled: addDisabled }}
            className={`items-center justify-center rounded-md px-md py-sm ${addDisabled ? 'bg-surface opacity-60' : 'bg-accent'}`}
            style={{ minHeight: 48 }}
          >
            <Text className={`text-body font-semibold ${addDisabled ? 'text-foreground-muted' : 'text-white'}`}>
              {formatSelectionCount(selectedIds.length)}
            </Text>
          </Pressable>
        </View>

        <Text className="text-heading font-semibold text-foreground">{`Add exercises to ${dayName}`}</Text>

        <SearchField onDebouncedChange={onQueryChange} />

        <FilterChipRow
          title="Muscle Group"
          options={muscleGroupOptions}
          selectedIds={filters.muscleGroupIds}
          onToggle={(id) => onToggleFilter('muscleGroupIds', id)}
        />
        <FilterChipRow
          title="Equipment"
          options={equipmentOptions}
          selectedIds={filters.equipment}
          onToggle={(id) => onToggleFilter('equipment', id)}
        />
        <FilterChipRow
          title="Movement Pattern"
          options={movementPatternOptions}
          selectedIds={filters.movementPatterns}
          onToggle={(id) => onToggleFilter('movementPatterns', id)}
        />
      </View>

      {screenState === 'error' ? (
        <View className="mt-xl items-center gap-sm px-lg">
          <Text className="text-center text-heading font-semibold text-foreground">
            {"Exercise catalog couldn't load"}
          </Text>
          <Text className="mt-sm text-center text-body font-normal text-foreground-muted">
            Restart the app to try again. Your saved exercises and history are safe.
          </Text>
        </View>
      ) : screenState === 'loading' ? (
        <View className="mt-xl gap-sm px-lg">
          {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
            <View key={index} className="rounded-md bg-surface" style={{ height: 64 }} />
          ))}
        </View>
      ) : screenState === 'empty' ? (
        <View className="mt-xl items-center gap-sm px-lg">
          <Text className="text-center text-heading font-semibold text-foreground">No exercises found</Text>
          <Text className="text-center text-body font-normal text-foreground-muted">
            Try a different search term or clear your filters.
          </Text>
          {hasActiveFilters(filters) ? (
            <Pressable
              onPress={onClearFilters}
              accessibilityRole="button"
              accessibilityLabel="Clear Filters"
              className="items-center justify-center px-md"
              style={{ minHeight: 48 }}
            >
              <Text className="text-body font-normal text-foreground">Clear Filters</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <FlashList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 }}
          renderItem={({ item }: { item: PickerCatalogRow }) => {
            const selected = selectedIds.includes(item.id);
            return (
              <View className="mb-sm">
                <Pressable
                  onPress={() => onToggle(item.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`flex-row items-center gap-sm rounded-md border ${
                    selected ? 'border-accent' : 'border-transparent'
                  }`}
                  style={{ minHeight: 48 }}
                >
                  <View className="flex-1">
                    <ExerciseListRow
                      name={item.name}
                      imageUri={item.imageUri}
                      localSource={getLocalCatalogImage(item.id)}
                      tags={tagsByExerciseId.get(item.id) ?? []}
                      onPress={() => onToggle(item.id)}
                    />
                  </View>
                  {selected ? <Ionicons name="checkmark-circle" size={24} color={colors.accent} /> : null}
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

export interface ExercisePickerModalProps {
  dayName: string;
  onAdd: (rows: PickerCatalogRow[]) => void;
  onCancel: () => void;
}

// Thin stateful wrapper: owns the catalog load, the query string, the filter state and the
// selection array. Derives its results with the same imported catalog functions the Phase 3
// screen uses — buildSearchIndex/searchCatalog/applyCatalogFilters/sortCatalogResults/deriveFacets
// — never a second search or filter implementation.
export function ExercisePickerModal({ dayName, onAdd, onCancel }: ExercisePickerModalProps) {
  const colors = useThemeColors();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_FILTERS);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const db = getPowerSync();
        const loaded = await loadCatalogRows(db);
        if (mounted) setCatalog(loaded);
      } catch (error) {
        console.error('picker catalog load failed', error);
        if (mounted) setFailed(true);
      }
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

  const screenState: PickerScreenState = failed ? 'error' : catalog === null ? 'loading' : results.length === 0 ? 'empty' : 'populated';

  const toggleFilterValue = useCallback((dimension: keyof CatalogFilters, id: string) => {
    setFilters((current) => {
      const values = current[dimension];
      const next = values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
      return { ...current, [dimension]: next };
    });
  }, []);

  const muscleGroupOptions = facets.muscleGroupIds.map((id) => ({
    id,
    label: catalog?.muscleGroupNames.get(id) ?? formatFacetLabel(id),
  }));
  const equipmentOptions = facets.equipment.map((id) => ({ id, label: formatFacetLabel(id) }));
  const movementPatternOptions = facets.movementPatterns.map((id) => ({ id, label: formatFacetLabel(id) }));

  return (
    <ExercisePickerModalView
      dayName={dayName}
      screenState={screenState}
      catalogRows={catalog?.rows ?? []}
      results={results}
      tagsByExerciseId={tagsByExerciseId}
      query={query}
      filters={filters}
      muscleGroupOptions={muscleGroupOptions}
      equipmentOptions={equipmentOptions}
      movementPatternOptions={movementPatternOptions}
      selectedIds={selectedIds}
      colors={colors}
      onQueryChange={setQuery}
      onToggleFilter={toggleFilterValue}
      onClearFilters={() => setFilters(EMPTY_FILTERS)}
      onToggle={(id) => setSelectedIds((current) => toggleSelection(current, id))}
      onAdd={onAdd}
      onCancel={onCancel}
    />
  );
}
