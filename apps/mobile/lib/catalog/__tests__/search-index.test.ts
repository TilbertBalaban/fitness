import { buildSearchIndex, normalizeQuery, searchCatalog, type SearchableExercise } from '../search-index';

const EXERCISES: SearchableExercise[] = [
  { id: 'ex-bench', name: 'Bench Press', aliases: ['Flat Bench'] },
  { id: 'ex-ohp', name: 'Overhead Press', aliases: null },
  { id: 'ex-squat', name: 'Bulgarian Split Squat', aliases: ['Rear Foot Elevated Split Squat'] },
  { id: 'ex-row', name: 'Barbell Row', aliases: null },
];

describe('normalizeQuery', () => {
  it('returns the empty string for null, undefined and whitespace-only input', () => {
    expect(normalizeQuery(null)).toBe('');
    expect(normalizeQuery(undefined)).toBe('');
    expect(normalizeQuery('   \t  ')).toBe('');
  });
});

describe('searchCatalog', () => {
  it('returns the full catalog, in stable name-then-id order, for an empty, whitespace-only or null query', () => {
    const index = buildSearchIndex(EXERCISES);
    const expectedIds = ['ex-row', 'ex-bench', 'ex-squat', 'ex-ohp'].sort((a, b) => {
      const nameById: Record<string, string> = {
        'ex-row': 'Barbell Row',
        'ex-bench': 'Bench Press',
        'ex-squat': 'Bulgarian Split Squat',
        'ex-ohp': 'Overhead Press',
      };
      return nameById[a].localeCompare(nameById[b]);
    });

    const emptyResult = searchCatalog(index, '', EXERCISES).map((r) => r.id);
    const whitespaceResult = searchCatalog(index, '   ', EXERCISES).map((r) => r.id);
    const nullResult = searchCatalog(index, null, EXERCISES).map((r) => r.id);

    expect(emptyResult).toEqual(expectedIds);
    expect(whitespaceResult).toEqual(expectedIds);
    expect(nullResult).toEqual(expectedIds);
  });

  it('matches PRESS, press, prèss and the NFD-decomposed form of prèss to the same result ids', () => {
    const index = buildSearchIndex(EXERCISES);
    const decomposed = 'prèss'.normalize('NFD'); // explicit e + combining grave accent form

    const upper = searchCatalog(index, 'PRESS', EXERCISES).map((r) => r.id).sort();
    const lower = searchCatalog(index, 'press', EXERCISES).map((r) => r.id).sort();
    const accented = searchCatalog(index, 'prèss', EXERCISES).map((r) => r.id).sort();
    const nfdAccented = searchCatalog(index, decomposed, EXERCISES).map((r) => r.id).sort();

    expect(upper.length).toBeGreaterThan(0);
    expect(lower).toEqual(upper);
    expect(accented).toEqual(upper);
    expect(nfdAccented).toEqual(upper);
  });

  it('matches an alias but not the name', () => {
    const index = buildSearchIndex(EXERCISES);
    const results = searchCatalog(index, 'rear foot elevated', EXERCISES);
    expect(results.map((r) => r.id)).toContain('ex-squat');
  });

  it('matches a prefix query against a longer name', () => {
    const index = buildSearchIndex(EXERCISES);
    const results = searchCatalog(index, 'bulg', EXERCISES);
    expect(results.map((r) => r.id)).toContain('ex-squat');
  });

  it('returns an empty array for a query matching nothing', () => {
    const index = buildSearchIndex(EXERCISES);
    const results = searchCatalog(index, 'zzzznonexistentqueryzzzz', EXERCISES);
    expect(results).toEqual([]);
  });
});
