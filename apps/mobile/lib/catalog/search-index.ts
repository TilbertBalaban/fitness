import MiniSearch from 'minisearch';

// The minimum shape searchCatalog needs to index and re-attach a score. Callers pass their own
// richer exercise type (name/aliases plus whatever catalog-filter.ts and the screen also need) —
// this module only ever reads `id`, `name` and `aliases` off it.
export interface SearchableExercise {
  id: string;
  name: string;
  aliases: string[] | null;
}

export type ScoredExercise<T extends SearchableExercise = SearchableExercise> = T & { score: number };

const COMBINING_DIACRITICAL_MARKS = /[\u0300-\u036f]/g;

// The encoding contract both a document field and a query string go through before comparison —
// NFC decode isn't enough to make "prèss" and its NFD-decomposed form compare equal, because NFC
// leaves precomposed characters (e.g. u00e8) as a single code point while NFD splits them into a
// base letter plus a combining mark. Decomposing first is what lets the strip step remove the
// mark from either input form; the final NFC pass then puts every remaining code point back into
// one canonical form so a byte-length or codepoint comparison downstream never sees two shapes of
// the same string. Nothing in this module ever compares raw byte length.
function normalizeText(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(COMBINING_DIACRITICAL_MARKS, '')
    .normalize('NFC')
    .toLowerCase();
}

// The full-query encoding contract: same per-character normalization as normalizeText, plus
// whitespace collapsing so a query of only spaces/tabs is indistinguishable from the empty string.
export function normalizeQuery(raw: unknown): string {
  return normalizeText(raw).trim().replace(/\s+/g, ' ');
}

function compareByNameThenId<T extends SearchableExercise>(a: T, b: T): number {
  const nameCompare = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  if (nameCompare !== 0) return nameCompare;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function joinAliases(aliases: string[] | null): string {
  return aliases ? aliases.join(' ') : '';
}

// Builds the MiniSearch index once per catalog load. `processTerm` is the single normalization
// function every indexed term AND every query term passes through (MiniSearch applies the same
// processTerm to search queries by default) — one function, so query and document can never
// silently drift apart the way two separately-written normalizations would.
export function buildSearchIndex<T extends SearchableExercise>(exercises: T[]): MiniSearch<T> {
  const index = new MiniSearch<T>({
    idField: 'id',
    fields: ['name', 'aliases'],
    extractField: (document, fieldName) => {
      if (fieldName === 'aliases') return joinAliases(document.aliases);
      return String((document as unknown as Record<string, unknown>)[fieldName] ?? '');
    },
    processTerm: (term) => normalizeText(term),
    searchOptions: {
      prefix: true,
      // Low enough to absorb a single transposed/missing letter, not so high that a leg exercise
      // starts matching a chest query — RESEARCH.md's fuzzy-tolerance guidance for this catalog.
      fuzzy: 0.2,
      boost: { name: 2, aliases: 1 },
    },
  });
  index.addAll(exercises);
  return index;
}

// The EXER-01 empty-input contract lives here (not in the screen) so it is unit-testable: an
// empty, whitespace-only or null/undefined query returns the full list, in the same stable
// name-then-id order the non-empty path's tie-break also uses — a re-render over the same data
// can never reorder rows just because the query happened to be blank this time.
export function searchCatalog<T extends SearchableExercise>(
  index: MiniSearch<T>,
  query: string | null | undefined,
  exercises: T[],
): ScoredExercise<T>[] {
  const normalized = normalizeQuery(query);

  if (normalized === '') {
    return [...exercises].sort(compareByNameThenId).map((exercise) => ({ ...exercise, score: 0 }));
  }

  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const hits = index.search(normalized);

  const results: ScoredExercise<T>[] = [];
  for (const hit of hits) {
    const exercise = byId.get(String(hit.id));
    if (exercise) results.push({ ...exercise, score: hit.score });
  }
  return results;
}
