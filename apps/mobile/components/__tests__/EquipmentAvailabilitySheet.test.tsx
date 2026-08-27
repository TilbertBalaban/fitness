import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import type { ResolvedInventory } from '@fitness/plate-math';
import { ErrorBanner } from '../ErrorBanner';
import {
  EquipmentAvailabilitySheetView,
  resolveEquipmentAvailabilityTarget,
  type EquipmentAvailabilitySheetViewProps,
} from '../EquipmentAvailabilitySheet';
import { PrimaryButton } from '../PrimaryButton';
import { SwapSuggestionList } from '../SwapSuggestionList';
import type { ScoredCandidate } from '@/lib/catalog/smart-swap';

// EquipmentAvailabilitySheet.tsx imports session-equipment.ts/equipment-profiles.ts/
// session-mutations.ts (for the stateful wrapper this file does not test — see the note below),
// which import log-set.ts and powersync.ts, which import the real @powersync/react-native
// package — a real-module import chain this jest environment cannot parse. Mocking powersync at
// its source, exactly like TargetsSheet.test.tsx/WarmupSheet.test.tsx already do, keeps that
// chain from ever loading.
jest.mock('@/lib/db/powersync', () => ({ getPowerSync: jest.fn() }));

// Same direct-invocation technique as WarmupSheet.test.tsx/TargetsSheet.test.tsx —
// EquipmentAvailabilitySheetView has no hooks, so calling it directly exercises its real body
// with no renderer. The stateful EquipmentAvailabilitySheet wrapper (useState/useEffect/DB calls)
// is, per this codebase's established convention, exercised only through this hook-free view's
// distinct callback props.
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

function flatText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flatText).join('');
  const element = node as ReactElement<{ children?: ReactNode }>;
  return element.props?.children !== undefined ? flatText(element.props.children) : '';
}

function candidate(overrides: Partial<ScoredCandidate> & { id: string; name: string; why: string }): ScoredCandidate {
  return { score: 1, ...overrides };
}

function baseProps(overrides: Partial<EquipmentAvailabilitySheetViewProps> = {}): EquipmentAvailabilitySheetViewProps {
  return {
    screen: 'confirm',
    displayName: 'Leg Press',
    gymName: 'My Gym',
    busy: false,
    error: null,
    candidates: [],
    onMarkUnavailable: jest.fn(),
    onOpenWriteConfirm: jest.fn(),
    onCancelWriteConfirm: jest.fn(),
    onConfirmWriteThrough: jest.fn(),
    onPickCandidate: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  };
}

const BASE_INVENTORY: ResolvedInventory = {
  nativeUnit: 'kg',
  barbellWeightKg: '20.000',
  plates: [],
  dumbbells: [{ weightKg: '10.000' }],
  machines: [
    { id: 'leg-press-1', name: 'Leg Press', equipmentType: 'machine', available: true, stackMinKg: '10.000', stackMaxKg: '100.000', stackIncrementKg: '5.000', baseResistanceKg: null },
    { id: 'ab-crunch-2', name: 'Ab Crunch', equipmentType: 'machine', available: true, stackMinKg: '5.000', stackMaxKg: '50.000', stackIncrementKg: '5.000', baseResistanceKg: null },
  ],
  unavailableEquipmentTypes: [],
};

describe('resolveEquipmentAvailabilityTarget', () => {
  it('names the sorted-first available machine for a machine equipment type', () => {
    const target = resolveEquipmentAvailabilityTarget('machine', BASE_INVENTORY);
    expect(target).toEqual({ ref: { kind: 'machine', machineId: 'ab-crunch-2' }, displayName: 'Ab Crunch' });
  });

  it('resolves the whole bar for barbell', () => {
    const target = resolveEquipmentAvailabilityTarget('barbell', BASE_INVENTORY);
    expect(target).toEqual({ ref: { kind: 'equipment_type', equipmentType: 'barbell' }, displayName: 'Barbell' });
  });

  it('resolves the whole bar for ez_bar', () => {
    const target = resolveEquipmentAvailabilityTarget('ez_bar', BASE_INVENTORY);
    expect(target).toEqual({ ref: { kind: 'equipment_type', equipmentType: 'ez_bar' }, displayName: 'EZ Bar' });
  });

  it('resolves the whole dumbbell bucket for dumbbell', () => {
    const target = resolveEquipmentAvailabilityTarget('dumbbell', BASE_INVENTORY);
    expect(target).toEqual({ ref: { kind: 'equipment_type', equipmentType: 'dumbbell' }, displayName: 'Dumbbells' });
  });

  it('falls back to the whole equipment_type when no machine resolves for a machine/cable type', () => {
    const empty: ResolvedInventory = { ...BASE_INVENTORY, machines: [] };
    const target = resolveEquipmentAvailabilityTarget('cable', empty);
    expect(target).toEqual({ ref: { kind: 'equipment_type', equipmentType: 'cable' }, displayName: 'Cable' });
  });
});

describe('EquipmentAvailabilitySheetView — confirm screen', () => {
  it('renders the heading interpolating the resolved equipment name and the body copy', () => {
    const result = EquipmentAvailabilitySheetView(baseProps({ displayName: 'Leg Press' }));
    const text = flatText(result);
    expect(text).toContain('Leg Press Unavailable?');
    expect(text).toContain("Mark it unavailable just for this workout, or update your gym profile if it's gone for good.");
  });

  it('renders exactly the primary Mark Unavailable button (PrimaryButton), the secondary link, and Cancel', () => {
    const result = EquipmentAvailabilitySheetView(baseProps());
    const [primary] = findByType(result, PrimaryButton);
    expect(primary?.props.label).toBe('Mark Unavailable');
    const labels = findByType(result, Pressable).map((el) => el.props.accessibilityLabel);
    expect(labels).toEqual(["My gym doesn't have this", 'Cancel']);
  });

  it('tapping Mark Unavailable calls onMarkUnavailable', () => {
    const onMarkUnavailable = jest.fn();
    const result = EquipmentAvailabilitySheetView(baseProps({ onMarkUnavailable }));
    const [button] = findByType(result, PrimaryButton);
    (button.props.onPress as () => void)();
    expect(onMarkUnavailable).toHaveBeenCalledTimes(1);
  });

  it('threads busy through to submitting on the PrimaryButton', () => {
    const result = EquipmentAvailabilitySheetView(baseProps({ busy: true }));
    const [button] = findByType(result, PrimaryButton);
    expect(button.props.submitting).toBe(true);
  });

  it('tapping the secondary link calls onOpenWriteConfirm, never onMarkUnavailable', () => {
    const onOpenWriteConfirm = jest.fn();
    const onMarkUnavailable = jest.fn();
    const result = EquipmentAvailabilitySheetView(baseProps({ onOpenWriteConfirm, onMarkUnavailable }));
    const link = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === "My gym doesn't have this");
    (link?.props.onPress as () => void)();
    expect(onOpenWriteConfirm).toHaveBeenCalledTimes(1);
    expect(onMarkUnavailable).not.toHaveBeenCalled();
  });

  it('renders no ErrorBanner when error is null', () => {
    const result = EquipmentAvailabilitySheetView(baseProps({ error: null }));
    expect(findByType(result, ErrorBanner)).toHaveLength(0);
  });

  it("renders the shipped ErrorBanner and stays on the confirm screen's actions when error is set", () => {
    const result = EquipmentAvailabilitySheetView(baseProps({ error: "Couldn't save" }));
    const [banner] = findByType(result, ErrorBanner);
    expect(banner?.props.message).toBe("Couldn't save");
    const [primary] = findByType(result, PrimaryButton);
    expect(primary?.props.label).toBe('Mark Unavailable');
    const labels = findByType(result, Pressable).map((el) => el.props.accessibilityLabel);
    expect(labels).toEqual(["My gym doesn't have this", 'Cancel']);
  });

  it('every row holds the 48-height floor', () => {
    const result = EquipmentAvailabilitySheetView(baseProps());
    for (const pressable of findByType(result, Pressable)) {
      const style = pressable.props.style as { minHeight?: number };
      expect(style?.minHeight).toBe(48);
    }
  });

  it('never renders a destructive-colored control — marking unavailable is not data loss', () => {
    const result = EquipmentAvailabilitySheetView(baseProps());
    for (const text of findByType(result, Text)) {
      const className = (text.props.className as string | undefined) ?? '';
      expect(className).not.toContain('destructive');
    }
  });
});

describe('EquipmentAvailabilitySheetView — write-confirm screen', () => {
  it('renders the gym-name-interpolated heading and the write-through body copy', () => {
    const result = EquipmentAvailabilitySheetView(
      baseProps({ screen: 'write-confirm', gymName: 'Downtown Gym', displayName: 'Leg Press' }),
    );
    const text = flatText(result);
    expect(text).toContain('Remove from Downtown Gym?');
    expect(text).toContain("This updates your gym profile — Leg Press won't be suggested at this gym again. You can add it back anytime.");
  });

  it('confirming calls onConfirmWriteThrough; cancelling calls onCancelWriteConfirm, never the sheet-level onCancel', () => {
    const onConfirmWriteThrough = jest.fn();
    const onCancelWriteConfirm = jest.fn();
    const onCancel = jest.fn();
    const result = EquipmentAvailabilitySheetView(
      baseProps({ screen: 'write-confirm', onConfirmWriteThrough, onCancelWriteConfirm, onCancel }),
    );
    const confirm = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Remove');
    const cancel = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Cancel');

    (confirm?.props.onPress as () => void)();
    (cancel?.props.onPress as () => void)();

    expect(onConfirmWriteThrough).toHaveBeenCalledTimes(1);
    expect(onCancelWriteConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('never renders a destructive-colored confirm — this is a neutral removal, not an archive', () => {
    const result = EquipmentAvailabilitySheetView(baseProps({ screen: 'write-confirm' }));
    for (const pressable of findByType(result, Pressable)) {
      const className = (pressable.props.className as string | undefined) ?? '';
      expect(className).not.toContain('destructive');
    }
  });
});

describe('EquipmentAvailabilitySheetView — alternatives screen', () => {
  it("keeps the original equipment heading and adds 'This exercise is unavailable right now' beneath it", () => {
    const result = EquipmentAvailabilitySheetView(baseProps({ screen: 'alternatives', displayName: 'Leg Press' }));
    const text = flatText(result);
    expect(text).toContain('Leg Press Unavailable?');
    expect(text).toContain('This exercise is unavailable right now');
  });

  it('renders SwapSuggestionList with the given candidates, and Cancel', () => {
    const candidates = [candidate({ id: 'hack-squat', name: 'Hack Squat', why: 'Same primary muscle: quads' })];
    const result = EquipmentAvailabilitySheetView(baseProps({ screen: 'alternatives', candidates }));
    const [list] = findByType(result, SwapSuggestionList);
    expect(list?.props.candidates).toEqual(candidates);
    const cancel = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Cancel');
    expect(cancel).toBeDefined();
  });

  it('passes an empty candidates array through unchanged — SwapSuggestionList.test.tsx owns the empty-state copy assertion', () => {
    const result = EquipmentAvailabilitySheetView(baseProps({ screen: 'alternatives', candidates: [] }));
    const [list] = findByType(result, SwapSuggestionList);
    expect(list?.props.candidates).toEqual([]);
  });

  it('wires SwapSuggestionList.onSelect to onPickCandidate, invoked with the picked candidate', () => {
    const onPickCandidate = jest.fn();
    const picked = candidate({ id: 'hack-squat', name: 'Hack Squat', why: 'Same primary muscle: quads' });
    const result = EquipmentAvailabilitySheetView(baseProps({ screen: 'alternatives', candidates: [picked], onPickCandidate }));
    const [list] = findByType(result, SwapSuggestionList);

    (list.props.onSelect as (c: ScoredCandidate) => void)(picked);

    expect(onPickCandidate).toHaveBeenCalledWith(picked);
  });
});
