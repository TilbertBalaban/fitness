import type { ReactElement, ReactNode } from 'react';
import { Text } from 'react-native';
import { ExerciseImageTile } from '../ExerciseImageTile';
import { SwapSuggestionList } from '../SwapSuggestionList';
import type { ScoredCandidate } from '../../lib/catalog/smart-swap';

// SwapSuggestionList has no hooks, so it is a plain `(props) => ReactElement` function — invoking
// it directly (no renderer) is a faithful exercise of its real body, matching the direct-invocation
// technique already established for DetailSection/MuscleTargetList/ArchiveDialog (03-07/03-09).
// @testing-library/react-native and react-test-renderer are both absent from this worktree's
// lockfile (installing either is out of scope per the package-legitimacy gate).
function collectText(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (typeof node === 'object') {
    const element = node as ReactElement<{ children?: ReactNode }>;
    return element.props?.children !== undefined ? collectText(element.props.children) : [];
  }
  return [];
}

function flatText(node: ReactNode): string {
  return collectText(node).join('').replace(/\s+/g, ' ').trim();
}

type AnyElement = ReactElement<Record<string, unknown>>;

function findByType(node: ReactNode, type: unknown, found: AnyElement[] = []): AnyElement[] {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return found;
  }
  if (Array.isArray(node)) {
    for (const child of node) findByType(child, type, found);
    return found;
  }
  const element = node as AnyElement;
  if (element.type === type) found.push(element);
  const children = element.props?.children as ReactNode;
  if (children !== undefined) findByType(children, type, found);
  return found;
}

function candidate(overrides: Partial<ScoredCandidate> & { id: string; name: string; why: string }): ScoredCandidate {
  return { score: 1, ...overrides };
}

describe('SwapSuggestionList', () => {
  it('renders the empty-state heading, body and Browse Catalog control for zero candidates', () => {
    const result = SwapSuggestionList({ candidates: [] });
    const text = flatText(result);

    expect(text).toContain('No good alternatives found');
    expect(text).toContain('Try browsing the full catalog instead.');
    expect(text).toContain('Browse Catalog');
  });

  it('renders the singular header for exactly one candidate', () => {
    const result = SwapSuggestionList({ candidates: [candidate({ id: 'a', name: 'Incline Bench Press', why: 'Same primary muscle: chest' })] });

    expect(flatText(result)).toContain('1 suggested alternative');
    expect(flatText(result)).not.toContain('1 suggested alternatives');
  });

  it('renders the plural header for two candidates', () => {
    const result = SwapSuggestionList({
      candidates: [
        candidate({ id: 'a', name: 'Incline Bench Press', why: 'Same primary muscle: chest' }),
        candidate({ id: 'b', name: 'Decline Bench Press', why: 'Same primary muscle: chest' }),
      ],
    });

    expect(flatText(result)).toContain('2 suggested alternatives');
  });

  it('renders exactly SWAP_RESULT_CAP rows when given more candidates than the cap', () => {
    const candidates = Array.from({ length: 12 }, (_, i) =>
      candidate({ id: `cand-${i}`, name: `Candidate ${i}`, why: 'Same primary muscle: chest' }),
    );
    const result = SwapSuggestionList({ candidates });

    expect(flatText(result)).toContain('5 suggested alternatives');
    const nameNodes = findByType(result, Text).filter((el) => el.props.numberOfLines === 1);
    expect(nameNodes).toHaveLength(5);
  });

  it('a candidate with no local image still renders its name and why string via the ExerciseImageTile fallback', () => {
    const result = SwapSuggestionList({
      candidates: [candidate({ id: 'not-in-manifest', name: 'Some Exercise', why: 'Same primary muscle: chest' })],
    });
    const text = flatText(result);

    expect(text).toContain('Some Exercise');
    expect(text).toContain('Same primary muscle: chest');
  });

  it('renders the candidate name with numberOfLines={1} and the why string with numberOfLines={2}', () => {
    const result = SwapSuggestionList({
      candidates: [candidate({ id: 'a', name: 'A Very Long Exercise Name That Should Truncate', why: 'Same primary muscle: chest' })],
    });

    const textNodes = findByType(result, Text);
    const nameNode = textNodes.find((el) => flatText(el.props.children as ReactNode) === 'A Very Long Exercise Name That Should Truncate');
    const whyNode = textNodes.find((el) => flatText(el.props.children as ReactNode) === 'Same primary muscle: chest');

    expect(nameNode?.props.numberOfLines).toBe(1);
    expect(whyNode?.props.numberOfLines).toBe(2);
  });

  it('produces exactly one ExerciseImageTile with a non-null vendored localSource for a real seeded id', () => {
    const result = SwapSuggestionList({
      candidates: [candidate({ id: 'seed_90_90_Hamstring', name: '90/90 Hamstring', why: 'Same primary muscle: hamstrings' })],
    });
    const tiles = findByType(result, ExerciseImageTile);

    expect(tiles).toHaveLength(1);
    expect(tiles[0].props.localSource).not.toBeNull();
    expect(tiles[0].props.localSource).not.toBeUndefined();
  });

  it("that tile's width prop is a finite number greater than zero", () => {
    const result = SwapSuggestionList({
      candidates: [candidate({ id: 'seed_90_90_Hamstring', name: '90/90 Hamstring', why: 'Same primary muscle: hamstrings' })],
    });
    const [tile] = findByType(result, ExerciseImageTile);

    expect(typeof tile.props.width).toBe('number');
    expect(Number.isFinite(tile.props.width as number)).toBe(true);
    expect((tile.props.width as number) > 0).toBe(true);
  });

  it('a candidate absent from the vendored manifest still produces a tile with a positive width and a null localSource', () => {
    const result = SwapSuggestionList({
      candidates: [candidate({ id: 'not-in-manifest', name: 'Some Exercise', why: 'Same primary muscle: chest' })],
    });
    const [tile] = findByType(result, ExerciseImageTile);

    expect(tile.props.localSource).toBeNull();
    expect((tile.props.width as number) > 0).toBe(true);
  });

  it('renders exactly five ExerciseImageTile elements for five candidates', () => {
    const candidates = Array.from({ length: 5 }, (_, i) =>
      candidate({ id: `cand-${i}`, name: `Candidate ${i}`, why: 'Same primary muscle: chest' }),
    );
    const result = SwapSuggestionList({ candidates });

    expect(findByType(result, ExerciseImageTile)).toHaveLength(5);
  });

  it('drops any candidate whose why string is blank rather than rendering an unexplained row', () => {
    const result = SwapSuggestionList({
      candidates: [
        candidate({ id: 'a', name: 'Has A Reason', why: 'Same primary muscle: chest' }),
        candidate({ id: 'b', name: 'No Reason', why: '' }),
        candidate({ id: 'c', name: 'Whitespace Reason', why: '   ' }),
      ],
    });
    const text = flatText(result);

    expect(text).toContain('Has A Reason');
    expect(text).not.toContain('No Reason');
    expect(text).not.toContain('Whitespace Reason');
    expect(text).toContain('1 suggested alternative');
  });
});
