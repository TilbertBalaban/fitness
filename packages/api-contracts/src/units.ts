export type WeightUnit = 'kg' | 'lb';

// Matches logged_set.weight_kg's numeric(8, 3) column exactly (apps/api/src/db/schema/session.ts)
// — a code scale that disagrees with the column scale is a rounding difference nobody will find.
export const CANONICAL_KG_SCALE: number = 3;

// Finer than any real plate increment, coarse enough that re-entering a displayed value maps
// back to the kilogram value it came from for the weights a real gym actually produces.
export const DISPLAY_SCALE: Record<WeightUnit, number> = { kg: 2, lb: 1 };

// The international avoirdupois pound is defined as exactly 0.45359237 kilograms. Written as an
// integer numerator/denominator pair rather than a decimal literal, so multiplying by it never
// passes through the nearest binary float IEEE-754 would round 0.45359237 to.
export const KG_PER_LB = { numerator: 45359237n, denominator: 100000000n } as const;

interface Fraction {
  numerator: bigint;
  denominator: bigint;
}

function parseDecimalToFraction(value: string): Fraction {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Weight must be a non-negative decimal number, got "${value}"`);
  }
  const [wholePart, fractionPart = ''] = trimmed.split('.');
  const numerator = BigInt(wholePart + fractionPart);
  const denominator = 10n ** BigInt(fractionPart.length);
  return { numerator, denominator };
}

function roundExactFractionToScale(fraction: Fraction, scale: number): bigint {
  const targetMultiplier = 10n ** BigInt(scale);
  const scaledNumerator = fraction.numerator * targetMultiplier;
  const quotient = scaledNumerator / fraction.denominator;
  const remainder = scaledNumerator % fraction.denominator;
  if (remainder * 2n >= fraction.denominator) {
    return quotient + 1n;
  }
  return quotient;
}

function formatScaledBigInt(scaledValue: bigint, scale: number): string {
  const digits = scaledValue.toString().padStart(scale + 1, '0');
  const wholePart = digits.slice(0, digits.length - scale) || '0';
  if (scale === 0) return wholePart;
  const fractionPart = digits.slice(digits.length - scale);
  return `${wholePart}.${fractionPart}`;
}

function convertFraction(fraction: Fraction, unit: WeightUnit, direction: 'toKg' | 'fromKg'): Fraction {
  if (unit === 'kg') return fraction;
  const factor = direction === 'toKg' ? KG_PER_LB : { numerator: KG_PER_LB.denominator, denominator: KG_PER_LB.numerator };
  return {
    numerator: fraction.numerator * factor.numerator,
    denominator: fraction.denominator * factor.denominator,
  };
}

export function toCanonicalKg(value: string | null, unit: WeightUnit): string | null {
  if (value === null || value.trim() === '') return null;
  const fraction = parseDecimalToFraction(value);
  const kgFraction = convertFraction(fraction, unit, 'toKg');
  const scaledKg = roundExactFractionToScale(kgFraction, CANONICAL_KG_SCALE);
  return formatScaledBigInt(scaledKg, CANONICAL_KG_SCALE);
}

export function fromCanonicalKg(kg: string | null, unit: WeightUnit): string | null {
  if (kg === null || kg.trim() === '') return null;
  const fraction = parseDecimalToFraction(kg);
  const displayFraction = convertFraction(fraction, unit, 'fromKg');
  const displayScale = DISPLAY_SCALE[unit];
  const scaledDisplay = roundExactFractionToScale(displayFraction, displayScale);
  return formatScaledBigInt(scaledDisplay, displayScale);
}

// A null weight renders as an em dash rather than "0 kg" — a bodyweight exercise has no external
// load, and zero would read as a logged weight of zero.
export function formatWeight(kg: string | null, unit: WeightUnit): string {
  const displayValue = fromCanonicalKg(kg, unit);
  if (displayValue === null) return '—';
  return `${displayValue} ${unit}`;
}
