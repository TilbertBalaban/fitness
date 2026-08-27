import { EQUIPMENT_PROFILE_LIMITS, fromCanonicalKg, toCanonicalKg } from '@fitness/api-contracts';
import type { EquipmentProfileRow } from '../../db/equipment-profiles';
import {
  BAR_PRESETS,
  emptyGymProfileDraft,
  draftFromProfile,
  isGymProfileSaveable,
  removeDumbbellWeight,
  removeMachine,
  removePlateDenomination,
  setDraftUnit,
  setPlatePairCount,
  toEquipmentProfileDraft,
  updateMachine,
  upsertDumbbellWeight,
  upsertMachine,
  upsertPlateDenomination,
  type GymProfileDraft,
} from '../profile-draft';

function baseRow(overrides: Partial<EquipmentProfileRow> = {}): EquipmentProfileRow {
  return {
    id: 'row-1',
    name: 'My Gym',
    isDefault: false,
    barbellWeightKg: null,
    plates: [],
    dumbbells: [],
    machines: [],
    nativeUnit: 'kg',
    archivedAt: null,
    ...overrides,
  };
}

describe('emptyGymProfileDraft', () => {
  it('returns a draft with an empty name, the given unit, a null bar weight, and three empty lists', () => {
    const draft = emptyGymProfileDraft('lb');
    expect(draft).toEqual<GymProfileDraft>({
      name: '',
      nativeUnit: 'lb',
      barWeight: '',
      plates: [],
      dumbbells: [],
      machines: [],
    });
  });
});

describe('draftFromProfile / toEquipmentProfileDraft round trip', () => {
  it('preserves canonical values through a full draft-to-profile-to-draft round trip', () => {
    const row = baseRow({
      name: 'Home Gym',
      barbellWeightKg: toCanonicalKg('20', 'kg'),
      plates: [
        { weightKg: toCanonicalKg('20', 'kg') as string, pairCount: 2 },
        { weightKg: toCanonicalKg('10', 'kg') as string, pairCount: 1 },
      ],
      dumbbells: [{ weightKg: toCanonicalKg('5', 'kg') as string }, { weightKg: toCanonicalKg('12.5', 'kg') as string }],
      machines: [
        {
          id: 'm1',
          name: 'Leg Press',
          equipmentType: 'machine',
          available: true,
          stackMinKg: toCanonicalKg('20', 'kg'),
          stackMaxKg: toCanonicalKg('200', 'kg'),
          stackIncrementKg: toCanonicalKg('10', 'kg'),
          baseResistanceKg: null,
        },
      ],
    });

    const firstOutput = toEquipmentProfileDraft(draftFromProfile(row));

    const roundTrippedRow = baseRow({
      name: firstOutput.name,
      barbellWeightKg: firstOutput.barbellWeightKg,
      plates: firstOutput.plates,
      dumbbells: firstOutput.dumbbells,
      machines: firstOutput.machines,
      nativeUnit: firstOutput.nativeUnit,
    });
    const secondOutput = toEquipmentProfileDraft(draftFromProfile(roundTrippedRow));

    expect(secondOutput).toEqual(firstOutput);
    expect(secondOutput.barbellWeightKg).toBe(toCanonicalKg('20', 'kg'));
    expect(secondOutput.plates).toEqual([
      { weightKg: toCanonicalKg('20', 'kg'), pairCount: 2 },
      { weightKg: toCanonicalKg('10', 'kg'), pairCount: 1 },
    ]);
    expect(secondOutput.dumbbells).toEqual([
      { weightKg: toCanonicalKg('5', 'kg') },
      { weightKg: toCanonicalKg('12.5', 'kg') },
    ]);
  });

  it('converts a stored profile at its own unit (lb) into display strings and back to the same canonical kg', () => {
    const row = baseRow({
      nativeUnit: 'lb',
      barbellWeightKg: toCanonicalKg('45', 'lb'),
      plates: [{ weightKg: toCanonicalKg('45', 'lb') as string, pairCount: 4 }],
    });

    const draft = draftFromProfile(row);
    expect(draft.nativeUnit).toBe('lb');
    expect(draft.barWeight).toBe(fromCanonicalKg(row.barbellWeightKg, 'lb'));

    const output = toEquipmentProfileDraft(draft);
    expect(output.barbellWeightKg).toBe(row.barbellWeightKg);
    expect(output.plates[0]?.weightKg).toBe(row.plates[0]?.weightKg);
  });
});

describe('upsertPlateDenomination', () => {
  it('adds a new denomination with a starting pair count', () => {
    const draft = emptyGymProfileDraft('kg');
    const next = upsertPlateDenomination(draft, '20');
    expect(next.plates).toHaveLength(1);
    expect(next.plates[0]?.weight).toBe('20');
  });

  it('does not lengthen the plate list when the same weight is entered again in different notation', () => {
    const draft = upsertPlateDenomination(emptyGymProfileDraft('kg'), '2.5');
    const next = upsertPlateDenomination(draft, '2.50');
    expect(next.plates).toHaveLength(1);
  });

  it('ignores a malformed weight rather than throwing', () => {
    const draft = emptyGymProfileDraft('kg');
    const next = upsertPlateDenomination(draft, '2.');
    expect(next).toBe(draft);
  });
});

describe('removePlateDenomination', () => {
  it('removes the row matching the given weight by canonical value', () => {
    const draft = upsertPlateDenomination(emptyGymProfileDraft('kg'), '20');
    const next = removePlateDenomination(draft, '20.00');
    expect(next.plates).toHaveLength(0);
  });
});

describe('setPlatePairCount', () => {
  it('clamps a negative count at zero', () => {
    const draft = upsertPlateDenomination(emptyGymProfileDraft('kg'), '20');
    const next = setPlatePairCount(draft, '20', -5);
    expect(next.plates[0]?.pairCount).toBe(0);
  });

  it('refuses a non-integer and returns the draft unchanged', () => {
    const draft = upsertPlateDenomination(emptyGymProfileDraft('kg'), '20');
    const next = setPlatePairCount(draft, '20', 1.5);
    expect(next).toBe(draft);
  });

  it('sets a valid non-negative integer count', () => {
    const draft = upsertPlateDenomination(emptyGymProfileDraft('kg'), '20');
    const next = setPlatePairCount(draft, '20', 3);
    expect(next.plates[0]?.pairCount).toBe(3);
  });
});

describe('upsertDumbbellWeight / removeDumbbellWeight', () => {
  it('merges a duplicate weight rather than adding a second row', () => {
    const draft = upsertDumbbellWeight(emptyGymProfileDraft('kg'), '10');
    const next = upsertDumbbellWeight(draft, '10.0');
    expect(next.dumbbells).toHaveLength(1);
  });

  it('removes a dumbbell row by canonical weight match', () => {
    const draft = upsertDumbbellWeight(emptyGymProfileDraft('kg'), '10');
    const next = removeDumbbellWeight(draft, '10');
    expect(next.dumbbells).toHaveLength(0);
  });
});

describe('upsertMachine / updateMachine / removeMachine', () => {
  it('appends a machine with a fresh client id, an empty name, availability on, and null stack fields', () => {
    const draft = upsertMachine(emptyGymProfileDraft('kg'));
    expect(draft.machines).toHaveLength(1);
    const machine = draft.machines[0]!;
    expect(machine.id.length).toBeGreaterThan(0);
    expect(machine.name).toBe('');
    expect(machine.available).toBe(true);
    expect(machine.stackMin).toBe('');
    expect(machine.stackMax).toBe('');
    expect(machine.stackIncrement).toBe('');
    expect(machine.baseResistance).toBe('');
  });

  it('appending twice produces two distinct client ids', () => {
    let draft = upsertMachine(emptyGymProfileDraft('kg'));
    draft = upsertMachine(draft);
    expect(draft.machines).toHaveLength(2);
    expect(draft.machines[0]?.id).not.toBe(draft.machines[1]?.id);
  });

  it('updates only the named machine, by id', () => {
    let draft = upsertMachine(emptyGymProfileDraft('kg'));
    draft = upsertMachine(draft);
    const targetId = draft.machines[0]!.id;
    const next = updateMachine(draft, targetId, { name: 'Leg Press' });
    expect(next.machines[0]?.name).toBe('Leg Press');
    expect(next.machines[1]?.name).toBe('');
  });

  it('removes a machine by id', () => {
    const draft = upsertMachine(emptyGymProfileDraft('kg'));
    const targetId = draft.machines[0]!.id;
    const next = removeMachine(draft, targetId);
    expect(next.machines).toHaveLength(0);
  });
});

describe('setDraftUnit', () => {
  it('reinterprets nothing already entered — the canonical value is held, only the display changes', () => {
    const draft = upsertPlateDenomination(emptyGymProfileDraft('kg'), '20');
    const withBar = { ...draft, barWeight: '20' };

    const converted = setDraftUnit(withBar, 'lb');
    expect(converted.nativeUnit).toBe('lb');
    expect(converted.barWeight).toBe(fromCanonicalKg(toCanonicalKg('20', 'kg'), 'lb'));
    expect(converted.plates[0]?.weight).toBe(fromCanonicalKg(toCanonicalKg('20', 'kg'), 'lb'));

    const backToKg = setDraftUnit(converted, 'kg');
    expect(backToKg.barWeight).toBe('20.00');
    expect(backToKg.plates[0]?.weight).toBe('20.00');
  });

  it('returns the same draft when the unit does not change', () => {
    const draft = emptyGymProfileDraft('kg');
    expect(setDraftUnit(draft, 'kg')).toBe(draft);
  });
});

describe('toEquipmentProfileDraft', () => {
  it('drops plate rows whose pair count is zero and machine rows whose name is blank', () => {
    let draft = upsertPlateDenomination(emptyGymProfileDraft('kg'), '20');
    draft = setPlatePairCount(draft, '20', 0);
    draft = upsertPlateDenomination(draft, '10');
    draft = upsertMachine(draft);
    draft = updateMachine(draft, draft.machines[0]!.id, { name: 'Squat Rack' });
    draft = upsertMachine(draft);

    const output = toEquipmentProfileDraft(draft);
    expect(output.plates).toHaveLength(1);
    expect(output.plates[0]?.weightKg).toBe(toCanonicalKg('10', 'kg'));
    expect(output.machines).toHaveLength(1);
    expect(output.machines[0]?.name).toBe('Squat Rack');
  });

  it('emits the plate list sorted descending and the dumbbell list sorted ascending', () => {
    let draft = upsertPlateDenomination(emptyGymProfileDraft('kg'), '2.5');
    draft = upsertPlateDenomination(draft, '20');
    draft = upsertPlateDenomination(draft, '10');
    draft = upsertDumbbellWeight(draft, '20');
    draft = upsertDumbbellWeight(draft, '2.5');
    draft = upsertDumbbellWeight(draft, '10');

    const output = toEquipmentProfileDraft(draft);
    expect(output.plates.map((p) => p.weightKg)).toEqual([
      toCanonicalKg('20', 'kg'),
      toCanonicalKg('10', 'kg'),
      toCanonicalKg('2.5', 'kg'),
    ]);
    expect(output.dumbbells.map((d) => d.weightKg)).toEqual([
      toCanonicalKg('2.5', 'kg'),
      toCanonicalKg('10', 'kg'),
      toCanonicalKg('20', 'kg'),
    ]);
  });

  it('writes a null barbellWeightKg for a blank bar weight rather than throwing', () => {
    const draft = emptyGymProfileDraft('kg');
    const output = toEquipmentProfileDraft(draft);
    expect(output.barbellWeightKg).toBeNull();
  });
});

describe('isGymProfileSaveable', () => {
  it('is not saveable with a blank name and reports the single name error', () => {
    const draft = emptyGymProfileDraft('kg');
    const result = isGymProfileSaveable(draft);
    expect(result.saveable).toBe(false);
    expect(result.nameError).toBeTruthy();
  });

  it('is saveable with a non-blank name and every list within its limit', () => {
    const draft = { ...emptyGymProfileDraft('kg'), name: 'Home Gym' };
    const result = isGymProfileSaveable(draft);
    expect(result.saveable).toBe(true);
    expect(result.nameError).toBeNull();
  });

  it('is not saveable, without a name error, when a list exceeds EQUIPMENT_PROFILE_LIMITS', () => {
    const plates = Array.from({ length: EQUIPMENT_PROFILE_LIMITS.maxPlateDenominations + 1 }, (_, i) => ({
      weight: String(i + 1),
      pairCount: 1,
    }));
    const draft: GymProfileDraft = { ...emptyGymProfileDraft('kg'), name: 'Home Gym', plates };
    const result = isGymProfileSaveable(draft);
    expect(result.saveable).toBe(false);
    expect(result.nameError).toBeNull();
  });
});

describe('BAR_PRESETS', () => {
  it('carries four presets, the last of which (custom) has no known weight', () => {
    expect(BAR_PRESETS).toHaveLength(4);
    expect(BAR_PRESETS[BAR_PRESETS.length - 1]).toMatchObject({ id: 'custom', weightKg: null });
  });

  it('every non-custom preset carries a canonical kg value produced by toCanonicalKg', () => {
    for (const preset of BAR_PRESETS) {
      if (preset.id === 'custom') continue;
      expect(preset.weightKg).not.toBeNull();
    }
  });
});
