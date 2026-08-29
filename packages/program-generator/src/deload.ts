import type { DeloadPlacement, ResolvedTarget, TargetOverride } from '@fitness/api-contracts';
import type { GeneratedCycle } from './result';

// This project's own numbers, not sourced from MacroFactor (which publishes none of this math
// either) — provenance recorded in docs/volume-rir-landmarks.md.
export const DELOAD_SET_MULTIPLIER = 0.5;
export const DELOAD_RIR_INCREMENT = 2;

// Mirrors apps/mobile/lib/db/programs/order-index.ts's ORDER_INDEX_GAP (1024) — duplicated, not
// imported, for the same reason generate.ts duplicates it: packages/program-generator cannot
// depend on apps/mobile.
const ORDER_INDEX_GAP = 1024;

export interface PlaceCyclesInput {
  trainingCycleCount: number;
  deloadPlacement: DeloadPlacement;
  deloadEveryNCycles: number | null;
}

// D-07: kind is drawn only from CYCLE_KINDS (enforced at the type level via GeneratedCycle.kind:
// CycleKind) — the generator introduces no fourth kind, and a deload's position is its
// order_index, never a new kind. D-20: a deload never removes a day or an exercise, so this
// module returns only cycles and (via deloadOverrideFor) overrides, touching neither
// GeneratedDay nor GeneratedSlot.
export function placeCycles(input: PlaceCyclesInput): GeneratedCycle[] {
  const cycles: GeneratedCycle[] = [];
  let orderIndex = 0;
  let deloadCount = 0;

  function pushTraining(trainingIndex: number): void {
    orderIndex += ORDER_INDEX_GAP;
    cycles.push({
      key: `training-${trainingIndex}`,
      name: `Cycle ${trainingIndex + 1}`,
      kind: 'training',
      orderIndex,
      durationDays: null,
    });
  }

  function pushDeload(): void {
    orderIndex += ORDER_INDEX_GAP;
    deloadCount += 1;
    cycles.push({ key: `deload-${deloadCount}`, name: `Deload ${deloadCount}`, kind: 'deload', orderIndex, durationDays: null });
  }

  if (input.deloadPlacement === 'none') {
    for (let i = 0; i < input.trainingCycleCount; i += 1) pushTraining(i);
    return cycles;
  }

  if (input.deloadPlacement === 'every_n_cycles') {
    const n = input.deloadEveryNCycles ?? input.trainingCycleCount;
    let sinceLastDeload = 0;
    for (let i = 0; i < input.trainingCycleCount; i += 1) {
      pushTraining(i);
      sinceLastDeload += 1;
      if (n > 0 && sinceLastDeload % n === 0) pushDeload();
    }
    return cycles;
  }

  // final_cycle_only
  for (let i = 0; i < input.trainingCycleCount; i += 1) pushTraining(i);
  pushDeload();
  return cycles;
}

// A deload changes only two fields — targetSets halved (rounded up, floored at 1) and targetRir
// raised — never the rep range or rest, which inherit from the base unchanged. Returns an object
// with exactly the fields it actually changes, per D-06's sparse-override rule; a base field that
// is null contributes no key at all rather than a computed value derived from null.
export function deloadOverrideFor(base: ResolvedTarget): TargetOverride {
  const override: TargetOverride = {};

  if (base.targetSets !== null) {
    override.targetSets = Math.max(1, Math.ceil(base.targetSets * DELOAD_SET_MULTIPLIER));
  }
  if (base.targetRir !== null) {
    override.targetRir = base.targetRir + DELOAD_RIR_INCREMENT;
  }

  return override;
}
