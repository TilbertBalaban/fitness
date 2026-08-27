import { CANONICAL_KG_SCALE } from '@fitness/api-contracts';
import { achievableBarbellLoads, nearestLoadable } from './achievability';
import type { ResolvedInventory } from './inventory';

export type PlateBreakdown =
  | { kind: 'loadable'; barKg: string; perSidePlatesKg: string[] }
  | { kind: 'not_loadable'; lowerKg: string | null; higherKg: string | null }
  | { kind: 'no_plates' }
  | { kind: 'unsupported' };

const SCALE_MULTIPLIER = 10n ** BigInt(CANONICAL_KG_SCALE);

// Converts an exact decimal string to an integer at CANONICAL_KG_SCALE, and back — the same
// milligram-scale trick units.ts's roundExactFractionToScale/formatScaledBigInt use, reimplemented
// locally because those helpers are not exported. Working in bigint here is what keeps the search
// below free of any float rounding path.
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

// Both not_loadable exits below (an ungapped diff, and a count-bound solve) fill in the same
// neighbour pair via achievability.ts's nearestLoadable over the same achievable set this solver
// itself would accept — the neighbours can never name a load this solver would then refuse.
function notLoadableWithNeighbours(targetKg: string, inventory: ResolvedInventory): PlateBreakdown {
  const { lower, higher } = nearestLoadable(targetKg, achievableBarbellLoads(inventory));
  return { kind: 'not_loadable', lowerKg: lower, higherKg: higher };
}

interface Denomination {
  milliKg: bigint;
  maxCount: number;
}

// Exact bounded search, not greedy largest-first (D-15): at each denomination (heaviest first),
// tries the largest usable count before smaller counts, so the first exact-sum solution found is
// already both the fewest-plates AND heaviest-leading-plate choice among ties — documented here
// because that ordering IS the tie-break rule, not an incidental side effect of search order,
// mirroring roundToIncrement's own why-comment discipline for a non-obvious tie-break.
function solvePerSide(target: bigint, denominations: Denomination[]): number[] | null {
  const n = denominations.length;
  const suffixMax: bigint[] = new Array(n + 1).fill(0n);
  for (let i = n - 1; i >= 0; i--) {
    suffixMax[i] = suffixMax[i + 1] + denominations[i].milliKg * BigInt(denominations[i].maxCount);
  }

  let best: number[] | null = null;
  let bestCount = Infinity;
  const current: number[] = new Array(n).fill(0);

  function dfs(index: number, remaining: bigint, usedCount: number): void {
    if (usedCount >= bestCount) return;
    if (remaining === 0n) {
      bestCount = usedCount;
      best = current.slice();
      return;
    }
    if (index >= n) return;
    if (remaining > suffixMax[index]) return;

    const denom = denominations[index];
    const maxUsable = denom.milliKg > 0n ? Math.min(denom.maxCount, Number(remaining / denom.milliKg)) : 0;
    for (let count = maxUsable; count >= 0; count--) {
      current[index] = count;
      dfs(index + 1, remaining - denom.milliKg * BigInt(count), usedCount + count);
    }
    current[index] = 0;
  }

  dfs(0, target, 0);
  return best;
}

// The one plate-math entry point (D-15): an exact bounded-knapsack search over denominations AND
// their recorded pairCount, never a greedy largest-first division — a breakdown calling for more
// pairs of a denomination than the profile owns is worse than no breakdown at all. Pure and
// synchronous, safe to call on every keystroke behind a live field; the caller (PlateStrip) is
// responsible for memoising on the (inventory, target) pair.
export function solvePlateBreakdown(targetKg: string, inventory: ResolvedInventory): PlateBreakdown {
  if (inventory.barbellWeightKg === null) return { kind: 'unsupported' };

  const targetMilli = toMilliKg(targetKg);
  const barMilli = toMilliKg(inventory.barbellWeightKg);

  if (targetMilli < barMilli) return { kind: 'unsupported' };

  const diff = targetMilli - barMilli;
  // A per-side split only exists when the bar-to-target gap divides evenly across both sides —
  // plates are always added in matched pairs, so an odd milli-kg gap can never be exactly loaded.
  if (diff % 2n !== 0n) return notLoadableWithNeighbours(targetKg, inventory);
  const perSideTarget = diff / 2n;

  if (perSideTarget === 0n) {
    return { kind: 'loadable', barKg: inventory.barbellWeightKg, perSidePlatesKg: [] };
  }

  if (inventory.plates.length === 0) {
    return { kind: 'no_plates' };
  }

  const denominations: Denomination[] = inventory.plates.map((plate) => ({
    milliKg: toMilliKg(plate.weightKg),
    maxCount: plate.pairCount,
  }));

  const solution = solvePerSide(perSideTarget, denominations);
  if (!solution) return notLoadableWithNeighbours(targetKg, inventory);

  const perSidePlatesKg: string[] = [];
  for (let i = 0; i < denominations.length; i++) {
    for (let count = 0; count < solution[i]; count++) {
      perSidePlatesKg.push(fromMilliKg(denominations[i].milliKg));
    }
  }

  return { kind: 'loadable', barKg: inventory.barbellWeightKg, perSidePlatesKg };
}
