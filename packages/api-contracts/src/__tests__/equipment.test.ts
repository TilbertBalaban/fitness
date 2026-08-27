import {
  EQUIPMENT_PROFILE_LIMITS,
  isEquipmentDumbbellIncrements,
  isEquipmentMachineAvailability,
  isEquipmentProfilePlates,
  isExactDecimalString,
  isUnavailableEquipmentRefs,
  parseEquipmentJson,
  serializeEquipmentJson,
} from '../equipment';

describe('isExactDecimalString', () => {
  it('accepts a plain integer string', () => {
    expect(isExactDecimalString('20')).toBe(true);
  });

  it('accepts a decimal string', () => {
    expect(isExactDecimalString('20.000')).toBe(true);
  });

  it('rejects a number', () => {
    expect(isExactDecimalString(20)).toBe(false);
  });

  it('rejects a negative-looking string', () => {
    expect(isExactDecimalString('-20')).toBe(false);
  });
});

describe('isEquipmentProfilePlates', () => {
  it('accepts a valid plate array', () => {
    expect(isEquipmentProfilePlates([{ weightKg: '20.000', pairCount: 3 }])).toBe(true);
  });

  it('accepts an empty array', () => {
    expect(isEquipmentProfilePlates([])).toBe(true);
  });

  it('rejects a non-array', () => {
    expect(isEquipmentProfilePlates({ weightKg: '20.000', pairCount: 3 })).toBe(false);
  });

  it('rejects an entry whose weightKg is a number rather than an exact decimal string', () => {
    expect(isEquipmentProfilePlates([{ weightKg: 20, pairCount: 3 }])).toBe(false);
  });

  it('rejects a negative pairCount', () => {
    expect(isEquipmentProfilePlates([{ weightKg: '20.000', pairCount: -1 }])).toBe(false);
  });

  it('rejects a non-integer pairCount', () => {
    expect(isEquipmentProfilePlates([{ weightKg: '20.000', pairCount: 1.5 }])).toBe(false);
  });

  it('rejects an array longer than the declared limit', () => {
    const overLimit = Array.from({ length: EQUIPMENT_PROFILE_LIMITS.maxPlateDenominations + 1 }, (_, i) => ({
      weightKg: `${i + 1}.000`,
      pairCount: 1,
    }));
    expect(isEquipmentProfilePlates(overLimit)).toBe(false);
  });

  it('accepts an array exactly at the declared limit', () => {
    const atLimit = Array.from({ length: EQUIPMENT_PROFILE_LIMITS.maxPlateDenominations }, (_, i) => ({
      weightKg: `${i + 1}.000`,
      pairCount: 1,
    }));
    expect(isEquipmentProfilePlates(atLimit)).toBe(true);
  });
});

describe('isEquipmentDumbbellIncrements', () => {
  it('accepts a valid dumbbell array', () => {
    expect(isEquipmentDumbbellIncrements([{ weightKg: '2.500' }])).toBe(true);
  });

  it('rejects a numeric weightKg', () => {
    expect(isEquipmentDumbbellIncrements([{ weightKg: 2.5 }])).toBe(false);
  });

  it('rejects an array longer than the declared limit', () => {
    const overLimit = Array.from({ length: EQUIPMENT_PROFILE_LIMITS.maxDumbbellWeights + 1 }, (_, i) => ({
      weightKg: `${i + 1}.000`,
    }));
    expect(isEquipmentDumbbellIncrements(overLimit)).toBe(false);
  });
});

describe('isEquipmentMachineAvailability', () => {
  const validMachine = {
    id: 'm-1',
    name: 'Leg Press',
    equipmentType: 'machine',
    available: true,
    stackMinKg: '10.000',
    stackMaxKg: '100.000',
    stackIncrementKg: '5.000',
    baseResistanceKg: null,
  };

  it('accepts a valid machine array', () => {
    expect(isEquipmentMachineAvailability([validMachine])).toBe(true);
  });

  it('rejects an unknown equipmentType', () => {
    expect(isEquipmentMachineAvailability([{ ...validMachine, equipmentType: 'not_a_real_type' }])).toBe(false);
  });

  it('rejects a numeric stack field', () => {
    expect(isEquipmentMachineAvailability([{ ...validMachine, stackMinKg: 10 }])).toBe(false);
  });

  it('rejects an array longer than the declared limit', () => {
    const overLimit = Array.from({ length: EQUIPMENT_PROFILE_LIMITS.maxMachines + 1 }, (_, i) => ({
      ...validMachine,
      id: `m-${i}`,
    }));
    expect(isEquipmentMachineAvailability(overLimit)).toBe(false);
  });
});

describe('isUnavailableEquipmentRefs', () => {
  it('accepts an equipment_type ref', () => {
    expect(isUnavailableEquipmentRefs([{ kind: 'equipment_type', equipmentType: 'machine' }])).toBe(true);
  });

  it('accepts a machine ref', () => {
    expect(isUnavailableEquipmentRefs([{ kind: 'machine', machineId: 'm-1' }])).toBe(true);
  });

  it('accepts a dumbbell ref', () => {
    expect(isUnavailableEquipmentRefs([{ kind: 'dumbbell', weightKg: '10.000' }])).toBe(true);
  });

  it('rejects an unknown kind', () => {
    expect(isUnavailableEquipmentRefs([{ kind: 'barbell' }])).toBe(false);
  });
});

describe('serializeEquipmentJson / parseEquipmentJson', () => {
  it('round-trips a plate array through a string, matching the SQLite text-column path', () => {
    const plates = [{ weightKg: '20.000', pairCount: 3 }];
    const serialized = serializeEquipmentJson(plates);
    expect(typeof serialized).toBe('string');
    expect(parseEquipmentJson(serialized)).toEqual(plates);
  });

  it('passes an already-parsed value through unchanged, matching the Postgres jsonb path', () => {
    const plates = [{ weightKg: '20.000', pairCount: 3 }];
    expect(parseEquipmentJson(plates)).toBe(plates);
  });

  it('parses a null column as an empty array', () => {
    expect(parseEquipmentJson(null)).toEqual([]);
  });
});
