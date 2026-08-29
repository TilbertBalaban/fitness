import { CYCLE_KINDS } from '@fitness/api-contracts';
import { deloadOverrideFor, placeCycles } from '../deload';

describe('placeCycles', () => {
  it('returns exactly trainingCycleCount training cycles for deloadPlacement none', () => {
    const cycles = placeCycles({ trainingCycleCount: 4, deloadPlacement: 'none', deloadEveryNCycles: null });

    expect(cycles).toHaveLength(4);
    expect(cycles.every((cycle) => cycle.kind === 'training')).toBe(true);
  });

  it('places a deload every N cycles, with strictly increasing orderIndex', () => {
    const cycles = placeCycles({ trainingCycleCount: 6, deloadPlacement: 'every_n_cycles', deloadEveryNCycles: 3 });

    expect(cycles.map((cycle) => cycle.kind)).toEqual([
      'training',
      'training',
      'training',
      'deload',
      'training',
      'training',
      'training',
      'deload',
    ]);

    for (let i = 1; i < cycles.length; i += 1) {
      expect(cycles[i]!.orderIndex).toBeGreaterThan(cycles[i - 1]!.orderIndex);
    }
  });

  it('appends exactly one deload cycle after the last training cycle for final_cycle_only', () => {
    const cycles = placeCycles({ trainingCycleCount: 4, deloadPlacement: 'final_cycle_only', deloadEveryNCycles: null });

    expect(cycles).toHaveLength(5);
    expect(cycles.slice(0, 4).every((cycle) => cycle.kind === 'training')).toBe(true);
    expect(cycles[4]!.kind).toBe('deload');
  });

  it('never produces a cycle kind outside the imported CYCLE_KINDS tuple', () => {
    const scenarios = [
      placeCycles({ trainingCycleCount: 4, deloadPlacement: 'none', deloadEveryNCycles: null }),
      placeCycles({ trainingCycleCount: 6, deloadPlacement: 'every_n_cycles', deloadEveryNCycles: 3 }),
      placeCycles({ trainingCycleCount: 4, deloadPlacement: 'final_cycle_only', deloadEveryNCycles: null }),
    ];

    for (const cycles of scenarios) {
      for (const cycle of cycles) {
        expect(CYCLE_KINDS).toContain(cycle.kind);
      }
    }
  });
});

describe('deloadOverrideFor', () => {
  it('halves targetSets rounded up with a floor of 1, and raises targetRir by 2', () => {
    const override = deloadOverrideFor({ targetSets: 5, targetRepMin: 8, targetRepMax: 12, targetRir: 2, targetRestSeconds: 120 });

    expect(override.targetSets).toBe(3); // ceil(5 * 0.5) = 3
    expect(override.targetRir).toBe(4);
  });

  it('floors targetSets at 1 rather than 0', () => {
    const override = deloadOverrideFor({ targetSets: 1, targetRepMin: 8, targetRepMax: 12, targetRir: 2, targetRestSeconds: 120 });

    expect(override.targetSets).toBe(1);
  });

  it('returns an object with exactly the targetSets and targetRir keys set, the other three absent', () => {
    const override = deloadOverrideFor({ targetSets: 4, targetRepMin: 8, targetRepMax: 12, targetRir: 2, targetRestSeconds: 120 });

    expect(Object.keys(override).sort()).toEqual(['targetRir', 'targetSets']);
  });
});
