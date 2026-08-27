import type { EquipmentMachine, EquipmentType } from '@fitness/api-contracts';
import {
  achievableBarbellLoads,
  achievableDumbbellLoads,
  achievableMachineLoads,
  isAchievable,
  nearestLoadable,
} from './achievability';
import type { ResolvedInventory } from './inventory';
import { solvePlateBreakdown } from './solver';

// D-14/D-21's single answer to "what can this gym produce for this exercise" — a discriminated
// union of data only, no display strings, no unit conversion. Formatting is PlateStrip's job
// (D-03's display boundary); putting it here would make this module unusable by any non-React
// consumer, and Phase 8 is one.
export type EquipmentBandState =
  | { kind: 'plates'; barKg: string; perSidePlatesKg: string[] }
  | { kind: 'pair'; weightKg: string }
  | { kind: 'stack'; minKg: string; maxKg: string; incrementKg: string | null; baseResistanceKg: string | null }
  | { kind: 'not_loadable'; lowerKg: string | null; higherKg: string | null }
  | { kind: 'no_plates' }
  | { kind: 'collapsed' };

function resolveBarbellBand(effectiveTargetKg: string | null, inventory: ResolvedInventory): EquipmentBandState {
  if (inventory.barbellWeightKg === null) {
    return { kind: 'not_loadable', lowerKg: null, higherKg: null };
  }

  // No target typed yet: show the bar alone (D-12's "bar weight as a quiet prefix" holds even at
  // zero plates), rather than fabricating a state that has no target to describe.
  const targetKg = effectiveTargetKg ?? inventory.barbellWeightKg;
  const breakdown = solvePlateBreakdown(targetKg, inventory);

  if (breakdown.kind === 'loadable') {
    return { kind: 'plates', barKg: breakdown.barKg, perSidePlatesKg: breakdown.perSidePlatesKg };
  }
  if (breakdown.kind === 'no_plates') {
    return { kind: 'no_plates' };
  }
  if (breakdown.kind === 'not_loadable') {
    return { kind: 'not_loadable', lowerKg: breakdown.lowerKg, higherKg: breakdown.higherKg };
  }

  // 'unsupported' — a target below the bar weight (reachable mid-entry, e.g. typing "1" toward
  // "120"). The bar itself is always the lowest achievable load, so this is just another
  // not-loadable neighbour lookup, not a fourth code path.
  const { lower, higher } = nearestLoadable(targetKg, achievableBarbellLoads(inventory));
  return { kind: 'not_loadable', lowerKg: lower, higherKg: higher };
}

function resolveDumbbellBand(effectiveTargetKg: string | null, inventory: ResolvedInventory): EquipmentBandState {
  const loads = achievableDumbbellLoads(inventory);
  // No target typed yet is treated as a target below every real dumbbell weight (D-15's own
  // degenerate-inventory discipline extended here): it lands on the same not_loadable path an
  // empty dumbbell list already takes, rather than fabricating a "recommended" weight nobody
  // asked for.
  const targetKg = effectiveTargetKg ?? '0';

  if (isAchievable(targetKg, loads)) {
    return { kind: 'pair', weightKg: targetKg };
  }

  const { lower, higher } = nearestLoadable(targetKg, loads);
  return { kind: 'not_loadable', lowerKg: lower, higherKg: higher };
}

function resolveStackBand(
  equipmentType: EquipmentType,
  effectiveTargetKg: string | null,
  inventory: ResolvedInventory,
): EquipmentBandState {
  // GYM-03 ordering: machines sorted by name then id gives a total, stable order at the one point
  // this module observes them — the first match is deterministic across repeated calls.
  const machine: EquipmentMachine | undefined = inventory.machines
    .filter((candidate) => candidate.equipmentType === equipmentType)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))[0];

  if (!machine || machine.stackMinKg === null || machine.stackMaxKg === null) {
    return { kind: 'not_loadable', lowerKg: null, higherKg: null };
  }

  const stackState: EquipmentBandState = {
    kind: 'stack',
    minKg: machine.stackMinKg,
    maxKg: machine.stackMaxKg,
    incrementKg: machine.stackIncrementKg,
    baseResistanceKg: machine.baseResistanceKg,
  };

  // No target typed yet: the stack's range is informational and target-independent, so it is
  // always shown rather than withheld pending a number.
  if (effectiveTargetKg === null) return stackState;

  const loads = achievableMachineLoads(machine);
  if (isAchievable(effectiveTargetKg, loads)) return stackState;

  const { lower, higher } = nearestLoadable(effectiveTargetKg, loads);
  return { kind: 'not_loadable', lowerKg: lower, higherKg: higher };
}

// R11: the one function that answers "does this exercise have resolvable equipment" — PlateStrip
// decides whether to render from the state it already has, and the Equipment action row decides
// whether to appear from hasResolvableEquipment(state) below, never from a second,
// independently-computed check.
export function resolveEquipmentBand({
  equipmentType,
  targetKg,
  inventory,
}: {
  equipmentType: EquipmentType | null;
  targetKg: string | null;
  inventory: ResolvedInventory | null;
}): EquipmentBandState {
  if (equipmentType === null || inventory === null) return { kind: 'collapsed' };
  if (inventory.unavailableEquipmentTypes.includes(equipmentType)) return { kind: 'collapsed' };

  const effectiveTargetKg = targetKg !== null && targetKg.trim() !== '' ? targetKg : null;

  switch (equipmentType) {
    case 'barbell':
    case 'ez_bar':
      return resolveBarbellBand(effectiveTargetKg, inventory);
    case 'dumbbell':
      return resolveDumbbellBand(effectiveTargetKg, inventory);
    case 'machine':
    case 'cable':
      return resolveStackBand(equipmentType, effectiveTargetKg, inventory);
    case 'kettlebell':
    case 'bodyweight':
    case 'band':
    case 'medicine_ball':
    case 'exercise_ball':
    case 'foam_roller':
    case 'other':
      return { kind: 'collapsed' };
    default: {
      // Exhaustiveness guard (D-07): appending a member to EQUIPMENT_TYPES without a case above
      // is a compile error here, never a silent fall-through to collapsed.
      const exhaustive: never = equipmentType;
      return exhaustive;
    }
  }
}

export function hasResolvableEquipment(state: EquipmentBandState): boolean {
  return state.kind !== 'collapsed';
}
