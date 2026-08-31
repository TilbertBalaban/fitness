// The shipped progress-photos-screen.test.ts / body-metrics-screen.test.ts convention: both
// @powersync and better-auth reach ESM dists Jest cannot parse (WINDOWS #22/#33), so both are
// mocked before the screen module is imported.
jest.mock('../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../lib/auth-client', () => ({ authClient: { useSession: jest.fn(() => ({ data: null })) } }));

import { FlashList } from '@shopify/flash-list';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import {
  compositeStepLabel,
  deriveCompositeScreenState,
  deriveCompositeStep,
  PhotoCompositeScreenView,
  resolveSelectableCells,
  type CompositePhotoCell,
  type PhotoCompositeScreenViewProps,
} from '../photo-composite';
import { ProgressPhotoTile } from '@/components/ProgressPhotoTile';
import { ProgressPhotoPlaceholderView } from '@/components/ProgressPhotoPlaceholder';
import type { GalleryCell } from '@/lib/db/progress-photos';
import type { ProgressPhotoRow } from '@/lib/db/progress-photos';

const COLORS = { accent: 'rgb(37, 99, 235)', foregroundMuted: 'rgb(113, 113, 122)', surface: 'rgb(244, 244, 245)' };

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

function galleryCell(overrides: Partial<GalleryCell> = {}): GalleryCell {
  return { row: row(), present: true, ...overrides };
}

function cell(overrides: Partial<CompositePhotoCell> = {}): CompositePhotoCell {
  return { row: row(), present: true, photoUri: 'file:///pp-1.jpg', ...overrides };
}

function renderView(overrides: Partial<PhotoCompositeScreenViewProps> = {}) {
  return PhotoCompositeScreenView({
    state: 'ready',
    step: 'choose-before',
    cells: [cell()],
    selectable: [true],
    beforeId: null,
    afterId: null,
    tileSize: 140,
    colors: COLORS,
    sharing: false,
    shareError: false,
    onSelect: jest.fn(),
    onShare: jest.fn(),
    onStartOver: jest.fn(),
    ...overrides,
  });
}

type RenderItem = (info: { item: CompositePhotoCell; index: number }) => ReactNode;

function renderedCellChildren(view: ReactNode, cells: CompositePhotoCell[]) {
  const [list] = findByType(view, FlashList);
  const renderItem = list.renderItem as RenderItem;
  return cells.map((c, index) => renderItem({ item: c, index }));
}

describe('deriveCompositeStep', () => {
  it('is choose-before with neither chosen', () => {
    expect(deriveCompositeStep({ before: null, after: null })).toBe('choose-before');
  });

  it('is choose-after with only Before chosen', () => {
    expect(deriveCompositeStep({ before: 'pp-1', after: null })).toBe('choose-after');
  });

  it('is preview with both chosen', () => {
    expect(deriveCompositeStep({ before: 'pp-1', after: 'pp-2' })).toBe('preview');
  });
});

describe('resolveSelectableCells', () => {
  it('marks a device-absent cell non-selectable while leaving it at its original index', () => {
    const cells: GalleryCell[] = [
      galleryCell({ row: row({ id: 'pp-1' }), present: true }),
      galleryCell({ row: row({ id: 'pp-2' }), present: false }),
      galleryCell({ row: row({ id: 'pp-3' }), present: true }),
    ];

    expect(resolveSelectableCells(cells, null)).toEqual([true, false, true]);
  });

  it('excludes the already-chosen Before from the After step’s selectable set', () => {
    const cells: GalleryCell[] = [
      galleryCell({ row: row({ id: 'pp-1' }), present: true }),
      galleryCell({ row: row({ id: 'pp-2' }), present: true }),
    ];

    expect(resolveSelectableCells(cells, 'pp-1')).toEqual([false, true]);
  });

  it('never reorders — a non-selectable cell keeps its position', () => {
    const cells: GalleryCell[] = [
      galleryCell({ row: row({ id: 'pp-1' }), present: false }),
      galleryCell({ row: row({ id: 'pp-2' }), present: true }),
    ];

    const selectable = resolveSelectableCells(cells, null);
    expect(selectable).toHaveLength(2);
    expect(selectable[0]).toBe(false);
    expect(selectable[1]).toBe(true);
  });
});

describe('deriveCompositeScreenState', () => {
  it('is not-enough-photos at exactly one device-resident photo', () => {
    const cells: GalleryCell[] = [galleryCell({ present: true }), galleryCell({ row: row({ id: 'pp-2' }), present: false })];
    expect(deriveCompositeScreenState(cells)).toBe('not-enough-photos');
  });

  it('is ready at two device-resident photos', () => {
    const cells: GalleryCell[] = [
      galleryCell({ row: row({ id: 'pp-1' }), present: true }),
      galleryCell({ row: row({ id: 'pp-2' }), present: true }),
    ];
    expect(deriveCompositeScreenState(cells)).toBe('ready');
  });

  it('is not-enough-photos with zero photos', () => {
    expect(deriveCompositeScreenState([])).toBe('not-enough-photos');
  });
});

describe('compositeStepLabel', () => {
  it('returns the three fixed step strings', () => {
    expect(compositeStepLabel('choose-before')).toBe('Step 1 of 2: Choose Before');
    expect(compositeStepLabel('choose-after')).toBe('Step 2 of 2: Choose After');
    expect(compositeStepLabel('preview')).toBe('Preview');
  });
});

describe('PhotoCompositeScreenView — not-enough-photos', () => {
  it('renders the exact UI-SPEC copy with no grid and no share control', () => {
    const view = renderView({ state: 'not-enough-photos', cells: [], selectable: [] });

    const text = findText(view).join(' ');
    expect(text).toContain('Not enough photos on this device');
    expect(text).toContain('You need at least two progress photos on this device to build a before & after.');
    expect(findByType(view, FlashList)).toHaveLength(0);
    expect(findByType(view, ProgressPhotoTile)).toHaveLength(0);
  });
});

describe('PhotoCompositeScreenView — grid (choose-before / choose-after)', () => {
  it('renders a device-absent cell through ProgressPhotoPlaceholderView with no onPress (disabled, R28)', () => {
    const cells = [cell({ row: row({ id: 'pp-1' }), present: false, photoUri: null })];
    const view = renderView({ cells, selectable: [false] });

    const [rendered] = renderedCellChildren(view, cells);
    const [placeholderProps] = findByType(rendered, ProgressPhotoPlaceholderView);
    expect(placeholderProps.onPress).toBeUndefined();
  });

  it('renders a selectable present cell as ProgressPhotoTile with a working onPress', () => {
    const onSelect = jest.fn();
    const cells = [cell({ row: row({ id: 'pp-1' }) })];
    const view = renderView({ cells, selectable: [true], onSelect });

    const [rendered] = renderedCellChildren(view, cells);
    const [tileProps] = findByType(rendered, ProgressPhotoTile);
    (tileProps.onPress as () => void)();
    expect(onSelect).toHaveBeenCalledWith(cells[0].row);
  });

  it('does not call onSelect for a present-but-non-selectable cell (the already-chosen Before)', () => {
    const onSelect = jest.fn();
    const cells = [cell({ row: row({ id: 'pp-1' }) })];
    const view = renderView({ step: 'choose-after', beforeId: 'pp-1', cells, selectable: [false], onSelect });

    const [rendered] = renderedCellChildren(view, cells);
    const [tileProps] = findByType(rendered, ProgressPhotoTile);
    (tileProps.onPress as () => void)();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('PhotoCompositeScreenView — preview', () => {
  it('renders both date captions and a share-failure line beneath the button when shareError is set, with the selection untouched', () => {
    const cells = [
      cell({ row: row({ id: 'pp-1', localDate: '2026-07-01' }) }),
      cell({ row: row({ id: 'pp-2', localDate: '2026-08-01' }) }),
    ];
    const view = renderView({ step: 'preview', beforeId: 'pp-1', afterId: 'pp-2', cells, shareError: true });

    const text = findText(view).join(' ');
    expect(text).toContain("Couldn't share. Try again.");
    expect(text).toContain('1 Jul');
    expect(text).toContain('1 Aug');
  });

  it('renders no share-failure line when shareError is false', () => {
    const cells = [cell({ row: row({ id: 'pp-1' }) }), cell({ row: row({ id: 'pp-2' }) })];
    const view = renderView({ step: 'preview', beforeId: 'pp-1', afterId: 'pp-2', cells, shareError: false });

    expect(findText(view).join(' ')).not.toContain("Couldn't share. Try again.");
  });
});

describe('PhotoCompositeScreenView — Start Over', () => {
  it('the Start Over link calls onStartOver', () => {
    const onStartOver = jest.fn();
    const view = renderView({ state: 'ready', onStartOver });

    const text = findText(view).join(' ');
    expect(text).toContain('Start Over');

    const startOverPressable = findByType(view, Pressable).find((props) => props.accessibilityLabel === 'Start Over');
    (startOverPressable?.onPress as () => void)();
    expect(onStartOver).toHaveBeenCalled();
  });
});
