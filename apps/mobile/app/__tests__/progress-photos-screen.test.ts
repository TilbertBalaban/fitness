// The shipped body-metrics-screen.test.ts / records.test.ts convention: both @powersync and
// better-auth reach ESM dists Jest cannot parse (WINDOWS #22/#33), so both are mocked before the
// screen module is imported.
jest.mock('../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../lib/auth-client', () => ({ authClient: { useSession: jest.fn(() => ({ data: null })) } }));

import { FlashList } from '@shopify/flash-list';
import type { ReactNode } from 'react';
import { ProgressPhotosScreenView, type ProgressPhotoCell, type ProgressPhotosScreenViewProps } from '../progress-photos';
import { ProgressPhotoTile } from '@/components/ProgressPhotoTile';
import { ProgressPhotoPlaceholder } from '@/components/ProgressPhotoPlaceholder';
import { PrimaryButton } from '@/components/PrimaryButton';
import type { ProgressPhotoRow } from '@/lib/db/progress-photos';

function findText(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) findText(child, out);
    return out;
  }
  const element = node as { props?: { children?: unknown } };
  if (element.props?.children !== undefined) findText(element.props.children, out);
  return out;
}

// element.type identity survives a no-renderer walk even where a child component is an unexpanded
// JSX element — the same technique records.test.ts already carries.
function findByType(node: ReactNode, type: unknown, found: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return found;
  }
  if (Array.isArray(node)) {
    for (const child of node) findByType(child, type, found);
    return found;
  }
  const element = node as { type?: unknown; props?: Record<string, unknown> };
  if (element.type === type && element.props) found.push(element.props);
  const children = element.props?.children as ReactNode;
  if (children !== undefined) findByType(children, type, found);
  return found;
}

function row(overrides: Partial<ProgressPhotoRow> = {}): ProgressPhotoRow {
  return {
    id: 'pp-1',
    takenAt: '2026-08-20T09:00:00.000Z',
    timezone: 'UTC',
    localDate: '2026-08-20',
    storageKey: 'progress-photo/pp-1.jpg',
    note: null,
    ...overrides,
  };
}

function cell(overrides: Partial<ProgressPhotoCell> = {}): ProgressPhotoCell {
  return { row: row(), present: true, photoUri: 'file:///pp-1.jpg', ...overrides };
}

function renderView(overrides: Partial<ProgressPhotosScreenViewProps> = {}) {
  return ProgressPhotosScreenView({
    state: 'ready',
    cells: [cell()],
    tileSize: 140,
    canComposite: false,
    onAddPhoto: jest.fn(),
    onCompositePress: jest.fn(),
    onTilePress: jest.fn(),
    ...overrides,
  });
}

type RenderItem = (info: { item: ProgressPhotoCell }) => ReactNode;

function renderedCellChildren(view: ReactNode, cells: ProgressPhotoCell[]) {
  const [list] = findByType(view, FlashList);
  const renderItem = list.renderItem as RenderItem;
  return cells.map((c) => renderItem({ item: c }));
}

describe('ProgressPhotosScreenView — loading', () => {
  it('renders a PHOTO_GRID_COLUMNS-wide grid of skeleton tiles, SKELETON_ROW_COUNT rows worth, at the resolved tile size', () => {
    const view = renderView({ state: 'loading', cells: [] });

    const text = findText(view).join(' ');
    expect(text).not.toContain('No progress photos yet');
    expect(text).not.toContain("couldn't load");

    expect((findByType(view, FlashList)[0].data as unknown[]).length).toBe(0);
  });
});

describe('ProgressPhotosScreenView — error', () => {
  it('renders the shipped error pattern with this screen’s own subject', () => {
    const text = findText(renderView({ state: 'error', cells: [] })).join(' ');

    expect(text).toContain("Progress Photos couldn't load");
    expect(text).toContain('Restart the app to try again. Your programs and history are safe.');
  });

  it('the Add Photo link stays reachable beneath an error', () => {
    const view = renderView({ state: 'error', cells: [] });
    expect(findText(view).join(' ')).toContain('Add Photo');
  });
});

describe('ProgressPhotosScreenView — empty', () => {
  it('renders the shipped empty copy with the Add Photo link still reachable', () => {
    const view = renderView({ state: 'empty', cells: [] });

    const text = findText(view).join(' ');
    expect(text).toContain('No progress photos yet');
    expect(text).toContain('Add your first photo to start tracking.');
    expect(text).toContain('Add Photo');
  });

  it('renders no Create Before & After control below two present cells', () => {
    const view = renderView({ state: 'empty', cells: [], canComposite: false });

    expect(findByType(view, PrimaryButton)).toHaveLength(0);
  });
});

describe('ProgressPhotosScreenView — populated', () => {
  it('hands the list exactly the cells it was given, most-recent-first order preserved', () => {
    const cells = [cell({ row: row({ id: 'pp-1' }) }), cell({ row: row({ id: 'pp-2' }) })];
    const view = renderView({ cells });

    expect((findByType(view, FlashList)[0].data as ProgressPhotoCell[]).map((c) => c.row.id)).toEqual(['pp-1', 'pp-2']);
  });

  it('renders a present cell as ProgressPhotoTile and an absent cell as ProgressPhotoPlaceholder, interleaved in the given order', () => {
    const cells = [
      cell({ row: row({ id: 'pp-1' }), present: true, photoUri: 'file:///pp-1.jpg' }),
      cell({ row: row({ id: 'pp-2' }), present: false, photoUri: null }),
      cell({ row: row({ id: 'pp-3' }), present: true, photoUri: 'file:///pp-3.jpg' }),
    ];
    const view = renderView({ cells });

    const children = renderedCellChildren(view, cells);
    expect(findByType(children[0], ProgressPhotoTile)).toHaveLength(1);
    expect(findByType(children[0], ProgressPhotoPlaceholder)).toHaveLength(0);
    expect(findByType(children[1], ProgressPhotoPlaceholder)).toHaveLength(1);
    expect(findByType(children[1], ProgressPhotoTile)).toHaveLength(0);
    expect(findByType(children[2], ProgressPhotoTile)).toHaveLength(1);
  });

  it('pressing a present tile asks for that row', () => {
    const onTilePress = jest.fn();
    const cells = [cell({ row: row({ id: 'pp-1' }) })];
    const view = renderView({ cells, onTilePress });

    const [tileProps] = findByType(renderedCellChildren(view, cells)[0], ProgressPhotoTile);
    (tileProps.onPress as () => void)();

    expect(onTilePress).toHaveBeenCalledWith(cells[0].row);
  });

  it('shows Create Before & After when canComposite is true, not merely disabled when false', () => {
    const withComposite = renderView({ canComposite: true });
    const withoutComposite = renderView({ canComposite: false });

    expect(findByType(withComposite, PrimaryButton)).toHaveLength(1);
    expect(findByType(withoutComposite, PrimaryButton)).toHaveLength(0);
  });
});
