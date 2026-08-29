import { EQUIPMENT_TYPES, type EquipmentType } from '@fitness/api-contracts';
import type { ResolvedInventory } from './inventory';

// D-08's own equipment types — the five this phase models an inventory for. The other seven
// EQUIPMENT_TYPES members (kettlebell, bodyweight, band, medicine_ball, exercise_ball,
// foam_roller, other) have no inventory model at all and are never gated by this function.
export const MODEL_EQUIPMENT_TYPES: EquipmentType[] = ['barbell', 'ez_bar', 'dumbbell', 'machine', 'cable'];
// Every EQUIPMENT_TYPES member this phase does NOT model an inventory for — derived, not
// hand-copied, so appending a new EQUIPMENT_TYPES member can never silently drop it from an
// allowEquipment list below and wrongly exclude every candidate requiring it.
export const NON_MODEL_EQUIPMENT_TYPES: EquipmentType[] = EQUIPMENT_TYPES.filter(
  (type) => !MODEL_EQUIPMENT_TYPES.includes(type),
);

// Promoted out of apps/mobile/lib/db/session-equipment.ts (11-01, D-08): this is the one
// workspace-wide answer to "can this gym produce this equipment type", now importable by
// @fitness/program-generator, which apps/api also depends on and which apps/mobile cannot own.
export function canEquip(type: EquipmentType, inventory: ResolvedInventory): boolean {
  if (inventory.unavailableEquipmentTypes.includes(type)) return false;
  if (type === 'barbell' || type === 'ez_bar') return inventory.barbellWeightKg !== null;
  if (type === 'dumbbell') return inventory.dumbbells.length > 0;
  return inventory.machines.some((machine) => machine.equipmentType === type);
}
