import { DEFAULT_ROUNDING_INCREMENT_KG, WARMUP_STEPS, roundToIncrement, warmupSets } from '../warmup';

describe('roundToIncrement', () => {
  it('rounds a halfway value UP to the next increment', () => {
    expect(roundToIncrement(101.25, 2.5)).toBe(102.5);
  });

  it('rounds down when closer to the lower increment', () => {
    expect(roundToIncrement(101, 2.5)).toBe(100);
  });

  it('rounds up when closer to the higher increment', () => {
    expect(roundToIncrement(101.5, 2.5)).toBe(102.5);
  });
});

describe('warmupSets', () => {
  it('returns exactly three rows in ascending weight order for a 100kg working weight', () => {
    const result = warmupSets(100);

    expect(result).toHaveLength(3);
    expect(result.map((s) => s.weightKg)).toEqual([...result.map((s) => s.weightKg)].sort((a, b) => a - b));
  });

  it('produces the expected rounded weights and rep counts at 100kg', () => {
    const result = warmupSets(100);

    expect(result).toEqual([
      { weightKg: 40, reps: 10 },
      { weightKg: 60, reps: 5 },
      { weightKg: 80, reps: 3 },
    ]);
  });

  it('rounds each step per WARMUP_STEPS against the working weight', () => {
    const workingWeightKg = 137;
    const result = warmupSets(workingWeightKg);

    expect(result).toEqual(
      WARMUP_STEPS.map((step) => ({
        weightKg: roundToIncrement(workingWeightKg * step.fraction, DEFAULT_ROUNDING_INCREMENT_KG),
        reps: step.reps,
      })).filter((s) => s.weightKg > 0)
    );
  });

  it('drops the 40 percent step when it rounds to 0 for a very light working weight', () => {
    const result = warmupSets(3);

    expect(result.find((s) => s.reps === 10)).toBeUndefined();
    expect(result).toHaveLength(2);
  });

  it('returns an empty array for a null working weight', () => {
    expect(warmupSets(null)).toEqual([]);
  });

  it('returns an empty array for a zero working weight', () => {
    expect(warmupSets(0)).toEqual([]);
  });

  it('returns an empty array for a negative working weight', () => {
    expect(warmupSets(-50)).toEqual([]);
  });

  it('returns an empty array for a NaN working weight', () => {
    expect(warmupSets(NaN)).toEqual([]);
  });

  it('returns an empty array for an Infinity working weight', () => {
    expect(warmupSets(Infinity)).toEqual([]);
  });

  it('is deterministic across repeated calls with identical arguments', () => {
    const first = warmupSets(137.5);
    const second = warmupSets(137.5);

    expect(first).toEqual(second);
  });

  it('with no roundWeight argument, behaves exactly as before, including the ties-up rounding', () => {
    const withoutArg = warmupSets(100);
    const withUndefinedArg = warmupSets(100, DEFAULT_ROUNDING_INCREMENT_KG, undefined);

    expect(withoutArg).toEqual([
      { weightKg: 40, reps: 10 },
      { weightKg: 60, reps: 5 },
      { weightKg: 80, reps: 3 },
    ]);
    expect(withUndefinedArg).toEqual(withoutArg);
  });

  it('calls a supplied roundWeight once per warm-up step with the raw fractional weight, and uses its return value', () => {
    const calls: number[] = [];
    const roundWeight = (rawKg: number) => {
      calls.push(rawKg);
      return Math.floor(rawKg);
    };

    const result = warmupSets(101, DEFAULT_ROUNDING_INCREMENT_KG, roundWeight);

    expect(calls).toHaveLength(3);
    calls.forEach((call, index) => expect(call).toBeCloseTo([40.4, 60.6, 80.8][index]));
    expect(result).toEqual([
      { weightKg: 40, reps: 10 },
      { weightKg: 60, reps: 5 },
      { weightKg: 80, reps: 3 },
    ]);
  });

  it('drops a warm-up step when the supplied roundWeight returns a value at or below zero', () => {
    const roundWeight = (rawKg: number) => (rawKg < 50 ? 0 : rawKg);

    const result = warmupSets(100, DEFAULT_ROUNDING_INCREMENT_KG, roundWeight);

    expect(result.find((s) => s.reps === 10)).toBeUndefined();
    expect(result).toEqual([
      { weightKg: 60, reps: 5 },
      { weightKg: 80, reps: 3 },
    ]);
  });
});
