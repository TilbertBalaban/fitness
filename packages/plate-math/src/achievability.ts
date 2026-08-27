import { CANONICAL_KG_SCALE, type EquipmentMachine } from '@fitness/api-contracts';
import type { ResolvedInventory } from './inventory';

export type RoundDirection = 'nearest' | 'down' | 'up';

const SCALE_MULTIPLIER = 10n ** BigInt(CANONICAL_KG_SCALE);

// Duplicated from solver.ts rather than imported, matching that file's own precedent of
// reimplementing units.ts's private bigint helpers locally per module (solver.ts's comment on
// toMilliKg) — keeps this module importable with zero dependency on solver.ts, which is what lets
// solver.ts import achievableBarbellLoads/nearestLoadable from here without a cycle.
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

function sortedMilli(loads: string[]): bigint[] {
  return loads.map(toMilliKg).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

// The phase's single rounding authority (D-10): direction has no default, ever — a caller that
// wants "nearest" must say so, the same way a caller that wants "down" must say so. Ties resolve
// down, which deliberately differs from roundToIncrement's ties-toward-positive-infinity rule in
// packages/pr-rules/src/warmup.ts; that function keeps its own rule for its own existing callers.
export function roundToAchievable(targetKg: string, loads: string[], direction: RoundDirection): string | null {
  if (loads.length === 0) return null;

  const targetMilli = toMilliKg(targetKg);
  const ascending = sortedMilli(loads);

  let lower: bigint | null = null;
  let upper: bigint | null = null;
  for (const milli of ascending) {
    if (milli <= targetMilli) lower = milli;
    if (milli >= targetMilli && upper === null) upper = milli;
  }

  if (direction === 'down') {
    return lower === null ? null : fromMilliKg(lower);
  }
  if (direction === 'up') {
    return upper === null ? null : fromMilliKg(upper);
  }

  if (lower === null) return upper === null ? null : fromMilliKg(upper);
  if (upper === null) return fromMilliKg(lower);
  if (lower === upper) return fromMilliKg(lower);

  const distanceToLower = targetMilli - lower;
  const distanceToUpper = upper - targetMilli;
  // Ties (equal distance) resolve down — the halfway case is where D-10 is load-bearing.
  return distanceToUpper < distanceToLower ? fromMilliKg(upper) : fromMilliKg(lower);
}

// D-13's "not loadable · {lower} ← → {higher}" neighbours. Strict inequalities so a target that
// happens to already be loadable never appears as its own neighbour; callers only reach this for
// a target already established as not loadable.
export function nearestLoadable(targetKg: string, loads: string[]): { lower: string | null; higher: string | null } {
  if (loads.length === 0) return { lower: null, higher: null };

  const targetMilli = toMilliKg(targetKg);
  const ascending = sortedMilli(loads);

  let lower: bigint | null = null;
  let higher: bigint | null = null;
  for (const milli of ascending) {
    if (milli < targetMilli) lower = milli;
    if (milli > targetMilli && higher === null) higher = milli;
  }

  return {
    lower: lower === null ? null : fromMilliKg(lower),
    higher: higher === null ? null : fromMilliKg(higher),
  };
}

export function isAchievable(targetKg: string, loads: string[]): boolean {
  const targetMilli = toMilliKg(targetKg);
  return loads.some((load) => toMilliKg(load) === targetMilli);
}

function dedupedAscending(millis: Iterable<bigint>): string[] {
  return Array.from(new Set(millis))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map(fromMilliKg);
}

// Every subset of the recorded pairs, one side of the bar at a time — the same shape
// solvePerSide's search explores, just enumerated in full rather than pruned toward a single
// target, since here we want every reachable total rather than one exact match. The inventory
// arriving here already passed isEquipmentProfilePlates's length bound (max 24 denominations,
// T-06-06), so this is bounded once per inventory rather than per keystroke.
function achievablePerSideSumsMilli(plates: ResolvedInventory['plates']): bigint[] {
  let sums = new Set<bigint>([0n]);
  for (const plate of plates) {
    const denomMilli = toMilliKg(plate.weightKg);
    const next = new Set<bigint>(sums);
    for (const base of sums) {
      for (let count = 1; count <= plate.pairCount; count++) {
        next.add(base + denomMilli * BigInt(count));
      }
    }
    sums = next;
  }
  return Array.from(sums);
}

export function achievableBarbellLoads(inventory: ResolvedInventory): string[] {
  if (inventory.barbellWeightKg === null) return [];
  const barMilli = toMilliKg(inventory.barbellWeightKg);
  const perSideSums = achievablePerSideSumsMilli(inventory.plates);
  return dedupedAscending(perSideSums.map((sum) => barMilli + sum * 2n));
}

export function achievableDumbbellLoads(inventory: ResolvedInventory): string[] {
  return dedupedAscending(inventory.dumbbells.map((dumbbell) => toMilliKg(dumbbell.weightKg)));
}

// A zero or negative increment, or a range wide enough to exceed the step cap, yields the
// endpoints only rather than looping (T-06-07) — a machine record with a nonsensical increment
// must still resolve to something, never spin.
const MAX_MACHINE_STEPS = 10_000;

export function achievableMachineLoads(machine: EquipmentMachine): string[] {
  if (machine.stackMinKg === null || machine.stackMaxKg === null) return [];

  const minMilli = toMilliKg(machine.stackMinKg);
  const maxMilli = toMilliKg(machine.stackMaxKg);
  const baseMilli = machine.baseResistanceKg !== null ? toMilliKg(machine.baseResistanceKg) : 0n;
  const incrementMilli = machine.stackIncrementKg !== null ? toMilliKg(machine.stackIncrementKg) : 0n;

  const endpointsOnly = (): string[] =>
    dedupedAscending(minMilli === maxMilli ? [minMilli + baseMilli] : [minMilli + baseMilli, maxMilli + baseMilli]);

  if (incrementMilli <= 0n) return endpointsOnly();

  const stepCount = (maxMilli - minMilli) / incrementMilli;
  if (stepCount < 0n || stepCount > BigInt(MAX_MACHINE_STEPS)) return endpointsOnly();

  const loads: bigint[] = [];
  for (let current = minMilli; current <= maxMilli; current += incrementMilli) {
    loads.push(current + baseMilli);
  }
  return dedupedAscending(loads);
}
