// The shipped records.test.ts convention: @powersync/react-native reaches an ESM dist Jest cannot
// parse (WINDOWS #22/#33), so it is mocked before MetricEntrySheet (which imports getPowerSync) is
// imported.
jest.mock('../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));

import type { ReactNode } from 'react';
import { applyKeypadPress } from '../MetricValueKeypad';
import { MetricEntrySheet, MetricEntrySheetView, type MetricEntrySheetViewProps } from '../MetricEntrySheet';

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

function collect(node: ReactNode, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return out;
  }
  const element = node as { props?: Record<string, unknown> };
  if (element.props) out.push(element.props);
  const children = element.props?.children as ReactNode;
  if (children !== undefined) collect(children, out);
  return out;
}

function renderSheet(overrides: Partial<MetricEntrySheetViewProps> = {}) {
  return MetricEntrySheetView({
    kind: 'bodyweight',
    pickerKinds: [],
    unitLabel: 'kg',
    value: null,
    logEnabled: false,
    writeFailed: false,
    onSelectKind: jest.fn(),
    onKeypadPress: jest.fn(),
    onLog: jest.fn(),
    onCancel: jest.fn(),
    colors: COLORS,
    ...overrides,
  });
}

describe('MetricEntrySheetView — populated (a prior entry exists)', () => {
  it('shows the seeded last value and an enabled Log control', () => {
    const view = renderSheet({ value: '82.4', logEnabled: true });
    const text = findText(view).join(' ');
    const logButton = collect(view).find((props) => props.accessibilityLabel === 'Log');

    expect(text).toContain('82.4');
    expect(text).toContain('Log Weight');
    expect(logButton?.disabled).toBe(false);
    expect((logButton?.accessibilityState as { disabled: boolean }).disabled).toBe(false);
  });
});

describe('MetricEntrySheetView — empty (no prior entry for this kind)', () => {
  it('starts genuinely blank, never 0, and keeps Log disabled', () => {
    const view = renderSheet({ value: null, logEnabled: false });
    const text = findText(view).join(' ');
    const logButton = collect(view).find((props) => props.accessibilityLabel === 'Log');

    expect(text).not.toContain('0');
    expect(logButton?.disabled).toBe(true);
    expect((logButton?.accessibilityState as { disabled: boolean }).disabled).toBe(true);
  });
});

describe('MetricEntrySheetView — keypad reducer', () => {
  it('a digit press routed through applyKeypadPress produces a value that enables Log', () => {
    const next = applyKeypadPress(null, { kind: 'digit', digit: '8' });

    expect(next).toBe('8');

    const view = renderSheet({ value: next, logEnabled: next !== null && next !== '' });
    const text = findText(view).join(' ');
    const logButton = collect(view).find((props) => props.accessibilityLabel === 'Log');

    expect(text).toContain('8');
    expect(logButton?.disabled).toBe(false);
  });
});

describe('MetricEntrySheetView — quick-measurement kind picker (decision 6)', () => {
  it('opened with no named kind, renders a kind picker over the tracked kinds excluding bodyweight', () => {
    const view = renderSheet({ kind: null, pickerKinds: ['waist', 'chest'] });
    const [chipRow] = collect(view).filter((props) => props.groupLabel === 'Measurement kind');

    expect(chipRow).toBeDefined();
    expect((chipRow.options as { id: string }[]).map((option) => option.id)).toEqual(['waist', 'chest']);
    expect((chipRow.options as { id: string }[]).map((option) => option.id)).not.toContain('bodyweight');
  });

  it('opened with a named kind, renders no picker', () => {
    const view = renderSheet({ kind: 'bodyweight', pickerKinds: ['waist', 'chest'] });
    const chipRows = collect(view).filter((props) => props.groupLabel === 'Measurement kind');

    expect(chipRows).toHaveLength(0);
  });

  it('selecting a chip calls onSelectKind with that kind', () => {
    const onSelectKind = jest.fn();
    const view = renderSheet({ kind: null, pickerKinds: ['waist', 'chest'], onSelectKind });
    const [chipRow] = collect(view).filter((props) => props.groupLabel === 'Measurement kind');

    (chipRow.onSelect as (id: string) => void)('waist');

    expect(onSelectKind).toHaveBeenCalledWith('waist');
  });
});

describe('MetricEntrySheetView — write-failed', () => {
  it('renders the inline "Couldn\'t save. Try again." line and keeps Log enabled', () => {
    const view = renderSheet({ value: '82.4', logEnabled: true, writeFailed: true });
    const text = findText(view).join(' ');
    const logButton = collect(view).find((props) => props.accessibilityLabel === 'Log');

    expect(text).toContain("Couldn't save. Try again.");
    expect(logButton?.disabled).toBe(false);
  });

  it('renders no failure line when the write has not failed', () => {
    const view = renderSheet({ writeFailed: false });
    const text = findText(view).join(' ');

    expect(text).not.toContain("Couldn't save. Try again.");
  });
});

// The stateful wrapper's own effect/write logic has no @testing-library/react-native or
// react-test-renderer available in this worktree's lockfile to mount and exercise directly
// (installing either is out of scope per the package-legitimacy gate) — the same constraint
// exercise-detail-screen.test.ts's own "structural invariants" describe block documents. Structural
// assertions over the compiled function's own source are the sanctioned technique here; the
// end-to-end proof that an edit pre-fills the right value and overwrites in place runs in a real
// browser (apps/mobile/e2e/body-metric.spec.ts).
describe('MetricEntrySheet — edit mode pre-fill (D-10, UI-SPEC Confirmations)', () => {
  it('checks editEntry and resolves the pre-fill from its own canonical value BEFORE ever calling loadLatestMetric', () => {
    // Babel's own module-interop rewrite (jest's transform) qualifies every cross-module call as
    // `_module.exportName` rather than the bare identifier the source file itself uses — asserted
    // against that transpiled shape, not the pre-transform source, since .toString() on a jest-run
    // function returns the compiled body.
    const source = MetricEntrySheet.toString();

    expect(source).toContain('editEntry');
    expect(source).toContain('fromCanonicalValue');
    const editEntryCheckIndex = source.indexOf('if (editEntry)');
    const loadLatestCallIndex = source.indexOf('.loadLatestMetric)(userId');
    expect(editEntryCheckIndex).toBeGreaterThan(-1);
    expect(loadLatestCallIndex).toBeGreaterThan(-1);
    expect(editEntryCheckIndex).toBeLessThan(loadLatestCallIndex);
  });

  it('routes the confirm action through updateMetric, not logMetric, when editing', () => {
    const source = MetricEntrySheet.toString();

    expect(source).toContain('.updateMetric)({');
    const editBranchIndex = source.indexOf('if (editEntry)', source.indexOf('handleLog'));
    const updateCallIndex = source.indexOf('.updateMetric)({');
    const logCallIndex = source.indexOf('.logMetric)({');
    expect(editBranchIndex).toBeLessThan(updateCallIndex);
    expect(updateCallIndex).toBeLessThan(logCallIndex);
  });
});
