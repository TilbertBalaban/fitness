import type {
  EquipmentDumbbell,
  EquipmentMachine,
  EquipmentPlate,
  EquipmentType,
  UnavailableEquipmentRef,
  WeightUnit,
} from '@fitness/api-contracts';

export interface EquipmentProfileLike {
  nativeUnit: WeightUnit;
  barbellWeightKg: string | null;
  plates: EquipmentPlate[];
  dumbbells: EquipmentDumbbell[];
  machines: EquipmentMachine[];
}

export interface ResolvedInventory {
  nativeUnit: WeightUnit;
  barbellWeightKg: string | null;
  plates: EquipmentPlate[];
  dumbbells: EquipmentDumbbell[];
  machines: EquipmentMachine[];
  unavailableEquipmentTypes: EquipmentType[];
}

// Pure: no database handle, no React import, no module-level mutable state, no Date.now(). Takes
// a profile and an unavailable-refs list and returns a new resolved view, neither mutating nor
// reordering its inputs — this is D-21's one named function: the session's resolved availability
// is the snapshotted profile's inventory minus this session's unavailable set, and every consumer
// (achievability, the plate strip, swap candidates) reads this single answer rather than
// recomputing its own.
export function resolveInventory(
  profile: EquipmentProfileLike,
  unavailable: UnavailableEquipmentRef[] = [],
): ResolvedInventory {
  const unavailableMachineIds = new Set(
    unavailable.filter((ref) => ref.kind === 'machine').map((ref) => ref.machineId),
  );
  const unavailableDumbbellWeights = new Set(
    unavailable.filter((ref) => ref.kind === 'dumbbell').map((ref) => ref.weightKg),
  );
  const unavailableEquipmentTypes = unavailable
    .filter((ref) => ref.kind === 'equipment_type')
    .map((ref) => ref.equipmentType);

  const plates = profile.plates.slice().sort((a, b) => Number(b.weightKg) - Number(a.weightKg));
  const dumbbells = profile.dumbbells
    .filter((dumbbell) => !unavailableDumbbellWeights.has(dumbbell.weightKg))
    .sort((a, b) => Number(a.weightKg) - Number(b.weightKg));
  const machines = profile.machines.filter(
    (machine) => machine.available && !unavailableMachineIds.has(machine.id),
  );

  return {
    nativeUnit: profile.nativeUnit,
    barbellWeightKg: profile.barbellWeightKg,
    plates,
    dumbbells,
    machines,
    unavailableEquipmentTypes,
  };
}
