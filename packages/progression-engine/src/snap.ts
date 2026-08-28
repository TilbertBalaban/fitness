import { CANONICAL_KG_SCALE, type EquipmentType } from '@fitness/api-contracts';
import {
  achievableLoadsForEquipmentType,
  roundToAchievable,
  type ResolvedInventory,
  type RoundDirection,
} from '@fitness/plate-math';

const SCALE_MULTIPLIER = 10n ** BigInt(CANONICAL_KG_SCALE);

// Mirrors achievability.ts's own local bigint milli-kg helpers rather than importing them — this
// monorepo has no decimal library and re-implements this pair per module on purpose, so every
// weight-touching module stays importable on its own with no cross-module coupling on a private
// helper.
function toMilliKg(value: string): bigint {
  const [wholePart, fractionPart = ''] = value.split('.');
  const paddedFraction = fractionPart.padEnd(CANONICAL_KG_SCALE, '0').slice(0, CANONICAL_KG_SCALE);
  return BigInt(wholePart) * SCALE_MULTIPLIER + BigInt(paddedFraction.length > 0 ? paddedFraction : '0');
}

function fromMilliKg(value: bigint): string {
  const digits = value.toString().padStart(CANONICAL_KG_SCALE + 1, '0');
  const wholePart = digits.slice(0, digits.length - CANONICAL_KG_SCALE) || '0';
  const fractionPart = digits.slice(digits.length - CANONICAL_KG_SCALE);
  return `${wholePart}.${fractionPart}`;
}

// D-13: an undershot load surfaces next session as a beaten target, which the rules already
// recover from, whereas an overshot load surfaces as a missed target that then has to be held.
// roundToAchievable deliberately takes no default direction — this constant is this package's
// explicit answer to it.
export const UNACHIEVABLE_ROUNDING_DIRECTION: RoundDirection = 'down';

// The same slope @fitness/pr-rules' estimated1RM already uses for one extra rep (weightKg * (1 +
// reps / 30)), reused here so the two do not disagree about what a rep is worth in load.
export const EPLEY_REPS_PER_LOAD_UNIT = 30;

// Floor division only, in bigint milli-kg — no floating-point multiply anywhere in this path, the
// same asymmetry the engine's determinism requirement (no clock, no locale) exists to protect.
export function idealNextLoadKg(lastWeightKg: string, surplusReps: number): string {
  const lastMilli = toMilliKg(lastWeightKg);
  const surplusMilli = lastMilli * BigInt(Math.trunc(surplusReps));
  const increment = surplusMilli / BigInt(EPLEY_REPS_PER_LOAD_UNIT);
  return fromMilliKg(lastMilli + increment);
}

export interface SnapToAchievableInput {
  targetKg: string;
  equipmentType: EquipmentType | null;
  inventory: ResolvedInventory | null;
}

export function snapToAchievable({ targetKg, equipmentType, inventory }: SnapToAchievableInput): string | null {
  const achievable = achievableLoadsForEquipmentType(equipmentType, inventory);
  if (achievable.length === 0) return targetKg;
  return roundToAchievable(targetKg, achievable, UNACHIEVABLE_ROUNDING_DIRECTION);
}

// recommend.ts's one place to ask "is the snapped weight strictly above the logged one" without
// re-parsing canonical-kg strings a third time (achievability.ts and this module already do).
export function compareCanonicalKg(a: string, b: string): number {
  const diff = toMilliKg(a) - toMilliKg(b);
  return diff > 0n ? 1 : diff < 0n ? -1 : 0;
}
