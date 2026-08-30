// Runtime tuple backing WeightUnit — added so sync.service.ts's user_preference validator can
// build a Set from the real vocabulary instead of retyping the two literals (04-04's own
// no-retyped-literals rule, matching LOAD_TYPES/ROUTINE_STATUSES elsewhere in this package).
export const WEIGHT_UNITS = ['kg', 'lb'] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

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

// The one place either conversion direction actually multiplies by a factor — kg/lb and cm/in both
// go through this, substituting their own integer numerator/denominator pair. Never a binary float
// anywhere in this path (D-03's own rationale).
function convertByFactor(fraction: Fraction, factor: Fraction, direction: 'toCanonical' | 'fromCanonical'): Fraction {
  const applied = direction === 'toCanonical' ? factor : { numerator: factor.denominator, denominator: factor.numerator };
  return {
    numerator: fraction.numerator * applied.numerator,
    denominator: fraction.denominator * applied.denominator,
  };
}

function convertFraction(fraction: Fraction, unit: WeightUnit, direction: 'toKg' | 'fromKg'): Fraction {
  if (unit === 'kg') return fraction;
  return convertByFactor(fraction, KG_PER_LB, direction === 'toKg' ? 'toCanonical' : 'fromCanonical');
}

// A displayed length is a coarser reading than a displayed weight — a tape measure has no
// meaningful sub-tenth precision — so, unlike fromCanonicalKg, the rendered string drops a
// trailing ".0"/trailing zero once rounding to LENGTH_DISPLAY_SCALE lands on a whole or
// short-decimal value. Purely a display-string transform after the exact bigint arithmetic has
// already run; it changes no stored value and no conversion result.
function trimTrailingDecimalZeros(value: string): string {
  if (!value.includes('.')) return value;
  return value.replace(/0+$/, '').replace(/\.$/, '');
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

// D-08's length half — every circumference kind stores centimetres canonically; a user under an
// `lb` weight preference sees inches (resolveDisplayUnit, body-metrics.ts), never a mix of kg and
// in. Same exact-bigint-fraction pipeline as toCanonicalKg/fromCanonicalKg, CM_PER_IN substituted
// for KG_PER_LB.
export const LENGTH_UNITS = ['cm', 'in'] as const;
export type LengthUnit = (typeof LENGTH_UNITS)[number];

// Matches body_metric.value's numeric(10,3) column precision headroom, but a body measurement is
// never meaningfully precise past a tenth of a centimetre — one decimal digit of canonical storage
// is enough to round-trip every real display value exactly (RESEARCH A4).
export const CANONICAL_CM_SCALE: number = 1;

// A body measurement is not meaningfully precise past one decimal in either unit — a cosmetic
// display-precision choice (RESEARCH A4), not dictated by D-08. Unlike DISPLAY_SCALE.kg/lb,
// fromCanonicalCm additionally trims a resulting trailing zero (see trimTrailingDecimalZeros).
export const LENGTH_DISPLAY_SCALE: Record<LengthUnit, number> = { cm: 1, in: 1 };

// One inch is defined as exactly 2.54 centimetres. Written as an integer numerator/denominator
// pair for the same reason KG_PER_LB is, even though this ratio happens to be an exact decimal —
// multiplying by it must never pass through a binary float.
export const CM_PER_IN = { numerator: 254n, denominator: 100n } as const;

function convertLengthFraction(fraction: Fraction, unit: LengthUnit, direction: 'toCm' | 'fromCm'): Fraction {
  if (unit === 'cm') return fraction;
  return convertByFactor(fraction, CM_PER_IN, direction === 'toCm' ? 'toCanonical' : 'fromCanonical');
}

export function toCanonicalCm(value: string | null, unit: LengthUnit): string | null {
  if (value === null || value.trim() === '') return null;
  const fraction = parseDecimalToFraction(value);
  const cmFraction = convertLengthFraction(fraction, unit, 'toCm');
  const scaledCm = roundExactFractionToScale(cmFraction, CANONICAL_CM_SCALE);
  return formatScaledBigInt(scaledCm, CANONICAL_CM_SCALE);
}

export function fromCanonicalCm(cm: string | null, unit: LengthUnit): string | null {
  if (cm === null || cm.trim() === '') return null;
  const fraction = parseDecimalToFraction(cm);
  const displayFraction = convertLengthFraction(fraction, unit, 'fromCm');
  const displayScale = LENGTH_DISPLAY_SCALE[unit];
  const scaledDisplay = roundExactFractionToScale(displayFraction, displayScale);
  return trimTrailingDecimalZeros(formatScaledBigInt(scaledDisplay, displayScale));
}

// A null length renders as an em dash rather than "0 cm" — an unlogged measurement has no reading,
// and zero would read as a logged value of zero.
export function formatLength(cm: string | null, unit: LengthUnit): string {
  const displayValue = fromCanonicalCm(cm, unit);
  if (displayValue === null) return '—';
  return `${displayValue} ${unit}`;
}
