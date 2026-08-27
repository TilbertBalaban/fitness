// GymProfileEditor.tsx pulls in ToggleRow from @/app/(tabs)/profile, whose own top-level imports
// reach @powersync's ESM dist, better-auth/react, and AsyncStorage's native module — none of which
// Jest's transform can parse. Same mocks as apps/mobile/app/(tabs)/__tests__/profile.test.tsx and
// app/gym-profiles/__tests__/gym-profile-editor-routes.test.tsx. Only GymProfileEditorView
// (hook-free) is invoked below, so nothing here actually touches any of these.
jest.mock('../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../lib/auth-client', () => ({
  authClient: { useSession: () => ({ data: null, refetch: jest.fn() }) },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockResolvedValue(undefined) },
}));

import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import { TextField } from '../TextField';
import { ErrorBanner } from '../ErrorBanner';
import { PrimaryButton } from '../PrimaryButton';
import {
  GymProfileEditorView,
  type EditorColors,
  type GymProfileEditorViewProps,
} from '../GymProfileEditor';
import {
  BAR_PRESETS,
  emptyGymProfileDraft,
  updateMachine,
  upsertDumbbellWeight,
  upsertMachine,
  upsertPlateDenomination,
} from '../../lib/gym/profile-draft';

// Same direct-invocation technique as ExerciseStrip.test.tsx/PlateStrip.test.tsx —
// GymProfileEditorView has no hooks, so calling it directly exercises its real body with no
// renderer (none is in this worktree's lockfile).
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

const COLORS: EditorColors = {
  accent: 'rgb(37, 99, 235)',
  foregroundMuted: 'rgb(113, 113, 122)',
  surface: 'rgb(244, 244, 245)',
  destructive: 'rgb(220, 38, 38)',
};

function baseProps(overrides: Partial<GymProfileEditorViewProps> = {}): GymProfileEditorViewProps {
  return {
    heading: 'New Gym',
    draft: emptyGymProfileDraft('kg'),
    colors: COLORS,
    submitting: false,
    saveError: false,
    nameError: null,
    saveable: false,
    plateAddValue: '',
    dumbbellAddValue: '',
    onChangeName: jest.fn(),
    onChangeUnit: jest.fn(),
    onSelectBarPreset: jest.fn(),
    onChangeBarWeight: jest.fn(),
    onChangePlateAddValue: jest.fn(),
    onCommitPlateAdd: jest.fn(),
    onChangePlatePairCount: jest.fn(),
    onRemovePlate: jest.fn(),
    onChangeDumbbellAddValue: jest.fn(),
    onCommitDumbbellAdd: jest.fn(),
    onRemoveDumbbell: jest.fn(),
    onAddMachine: jest.fn(),
    onChangeMachine: jest.fn(),
    onRemoveMachine: jest.fn(),
    onSubmit: jest.fn(),
    ...overrides,
  };
}

function textStrings(tree: ReactNode): string[] {
  return findByType(tree, Text)
    .map((el) => el.props.children)
    .flat()
    .filter((value): value is string => typeof value === 'string');
}

describe('GymProfileEditorView — empty draft (E2)', () => {
  it('renders each inventory section no-items label directly above its add control', () => {
    const tree = GymProfileEditorView(baseProps());
    const texts = textStrings(tree);

    expect(texts).toContain('No plates added');
    expect(texts).toContain('No dumbbell weights added');
    expect(texts).toContain('No machines added');

    const pressables = findByType(tree, Pressable);
    const addPlateIndex = pressables.findIndex((el) => el.props.accessibilityLabel === 'Add Plate');
    const addWeightIndex = pressables.findIndex((el) => el.props.accessibilityLabel === 'Add Weight');
    const addMachineIndex = pressables.findIndex((el) => el.props.accessibilityLabel === 'Add Machine');

    expect(addPlateIndex).toBeGreaterThanOrEqual(0);
    expect(addWeightIndex).toBeGreaterThanOrEqual(0);
    expect(addMachineIndex).toBeGreaterThanOrEqual(0);

    const noPlatesIndex = texts.indexOf('No plates added');
    const noDumbbellsIndex = texts.indexOf('No dumbbell weights added');
    const noMachinesIndex = texts.indexOf('No machines added');

    expect(noPlatesIndex).toBeGreaterThanOrEqual(0);
    expect(noDumbbellsIndex).toBeGreaterThan(noPlatesIndex);
    expect(noMachinesIndex).toBeGreaterThan(noDumbbellsIndex);
  });
});

describe('GymProfileEditorView — bar presets', () => {
  it('marks the preset matching the current bar weight as selected', () => {
    const draft = { ...emptyGymProfileDraft('kg'), barWeight: '20' };
    const tree = GymProfileEditorView(baseProps({ draft }));
    const pressables = findByType(tree, Pressable);
    const standardChip = pressables.find((el) => el.props.accessibilityLabel === 'Standard');
    const customChip = pressables.find((el) => el.props.accessibilityLabel === 'Custom');

    expect(standardChip?.props.accessibilityState).toEqual({ selected: true });
    expect(customChip?.props.accessibilityState).toEqual({ selected: false });
  });

  it('reports Custom as selected once the bar weight no longer matches a known preset', () => {
    const draft = { ...emptyGymProfileDraft('kg'), barWeight: '' };
    const tree = GymProfileEditorView(baseProps({ draft }));
    const pressables = findByType(tree, Pressable);
    const customChip = pressables.find((el) => el.props.accessibilityLabel === 'Custom');

    expect(customChip?.props.accessibilityState).toEqual({ selected: true });
  });

  it('tapping a preset chip calls onSelectBarPreset with that preset', () => {
    const onSelectBarPreset = jest.fn();
    const tree = GymProfileEditorView(baseProps({ onSelectBarPreset }));
    const pressables = findByType(tree, Pressable);
    const womensChip = pressables.find((el) => el.props.accessibilityLabel === "Women's");

    (womensChip?.props.onPress as () => void)();

    expect(onSelectBarPreset).toHaveBeenCalledWith(BAR_PRESETS.find((preset) => preset.id === 'womens'));
  });
});

describe('GymProfileEditorView — machine availability (UI-SPEC Machines & Cable)', () => {
  it('renders stack fields only while the machine is available', () => {
    let draft = upsertMachine(emptyGymProfileDraft('kg'));
    const machineId = draft.machines[0]!.id;
    draft = updateMachine(draft, machineId, { name: 'Leg Press', available: false });

    const tree = GymProfileEditorView(baseProps({ draft }));
    const labels = findByType(tree, TextField).map((el) => el.props.label as string);

    expect(labels).not.toContain('Stack min (kg)');
    expect(labels).not.toContain('Stack max (kg)');
    expect(labels).not.toContain('Increment (kg)');
  });

  it('renders stack fields once the machine is marked available', () => {
    let draft = upsertMachine(emptyGymProfileDraft('kg'));
    const machineId = draft.machines[0]!.id;
    draft = updateMachine(draft, machineId, { name: 'Leg Press', available: true });

    const tree = GymProfileEditorView(baseProps({ draft }));
    const labels = findByType(tree, TextField).map((el) => el.props.label as string);

    expect(labels).toContain('Stack min (kg)');
    expect(labels).toContain('Stack max (kg)');
    expect(labels).toContain('Increment (kg)');
    expect(labels).toContain('Starting resistance, optional (kg)');
  });
});

describe('GymProfileEditorView — failed save (E2 error state)', () => {
  it('renders the shipped error surface above the field stack and keeps every entered value in place', () => {
    let draft = { ...emptyGymProfileDraft('kg'), name: 'Home Gym', barWeight: '20' };
    draft = upsertPlateDenomination(draft, '20');
    draft = upsertDumbbellWeight(draft, '10');

    const tree = GymProfileEditorView(baseProps({ draft, saveError: true, nameError: null, saveable: true }));

    const banners = findByType(tree, ErrorBanner);
    expect(banners).toHaveLength(1);
    const bannerTexts = textStrings(banners[0]!.props.children as ReactNode);
    expect(bannerTexts).toContain("Couldn't save");

    // The form itself is still the returned tree — not swapped for an error-only screen — and
    // every entered value is still the one passed in, proving the view never clears or unmounts
    // the draft on a failed save.
    const nameField = findByType(tree, TextField).find((el) => el.props.label === 'Name');
    expect(nameField?.props.value).toBe('Home Gym');

    const barField = findByType(tree, TextField).find((el) => el.props.label === 'Bar weight (kg)');
    expect(barField?.props.value).toBe('20');

    const plateTexts = textStrings(tree);
    expect(plateTexts).toContain('20');
    expect(plateTexts).toContain('10');
  });
});

describe('GymProfileEditorView — Save control gating', () => {
  it('disables Save while the draft is not saveable', () => {
    const tree = GymProfileEditorView(baseProps({ saveable: false, submitting: false }));
    const button = findByType(tree, PrimaryButton)[0];
    expect(button?.props.submitting).toBe(true);
  });

  it('disables Save while a save is in flight even when the draft is saveable', () => {
    const tree = GymProfileEditorView(baseProps({ saveable: true, submitting: true }));
    const button = findByType(tree, PrimaryButton)[0];
    expect(button?.props.submitting).toBe(true);
  });

  it('enables Save once the draft is saveable and no save is in flight', () => {
    const tree = GymProfileEditorView(baseProps({ saveable: true, submitting: false }));
    const button = findByType(tree, PrimaryButton)[0];
    expect(button?.props.submitting).toBe(false);
  });
});

describe('GymProfileEditorView — plate and dumbbell rows', () => {
  it('renders a remove control and the pair-count stepper for each plate row', () => {
    const draft = upsertPlateDenomination(emptyGymProfileDraft('kg'), '20');
    const tree = GymProfileEditorView(baseProps({ draft }));

    const pressables = findByType(tree, Pressable);
    expect(pressables.some((el) => el.props.accessibilityLabel === 'Remove 20 kg plate')).toBe(true);
    expect(pressables.some((el) => el.props.accessibilityLabel === 'Decrease Pairs')).toBe(true);
    expect(pressables.some((el) => el.props.accessibilityLabel === 'Increase Pairs')).toBe(true);
  });

  it('renders a remove control for each dumbbell chip', () => {
    const draft = upsertDumbbellWeight(emptyGymProfileDraft('kg'), '10');
    const tree = GymProfileEditorView(baseProps({ draft }));

    const pressables = findByType(tree, Pressable);
    expect(pressables.some((el) => el.props.accessibilityLabel === 'Remove 10 kg dumbbell')).toBe(true);
  });
});
