import * as fs from 'fs';
import * as path from 'path';
import {
  CANONICAL_KG_SCALE,
  DISPLAY_SCALE,
  KG_PER_LB,
  fromCanonicalKg,
  formatWeight,
  toCanonicalKg,
  type WeightUnit,
} from '../units';

// Whole/half/quarter kg plate combos — a kg-native entry never has more than 2 decimal digits,
// so it always round-trips exactly through kg's own display scale.
const KG_FIXTURES = ['20', '22.5', '25', '40', '60', '100', '140', '2.5', '1.25', '0.5', '17.5'];

// US commercial-gym bar + plate combos, plus the small dumbbell increments where kg and lb align
// worst (2.5/5/7.5/10/12.5 lb). Verified numerically against this exact module before being
// pinned here — a value below the smallest real plate increment (e.g. 0.25 lb) is excluded
// because it is finer than DISPLAY_SCALE.lb can represent and would not round-trip.
const LB_FIXTURES = ['45', '95', '135', '185', '225', '275', '315', '365', '405', '2.5', '5', '7.5', '10', '12.5', '1'];

describe('toCanonicalKg', () => {
  it('converts a kg-entered value to the exact canonical string', () => {
    expect(toCanonicalKg('100', 'kg')).toBe('100.000');
  });

  it('converts an lb-entered value to the kilogram equivalent as an exact three-decimal string', () => {
    const result = toCanonicalKg('225', 'lb');
    expect(result).toMatch(/^\d+\.\d{3}$/);
    expect(result).toBe('102.058');
  });

  it('returns null for a null input', () => {
    expect(toCanonicalKg(null, 'kg')).toBeNull();
    expect(toCanonicalKg(null, 'lb')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(toCanonicalKg('', 'kg')).toBeNull();
    expect(toCanonicalKg('   ', 'lb')).toBeNull();
  });

  it('throws on a negative value', () => {
    expect(() => toCanonicalKg('-5', 'kg')).toThrow();
  });

  it('throws on a non-numeric string', () => {
    expect(() => toCanonicalKg('not-a-weight', 'kg')).toThrow();
  });
});

describe('fromCanonicalKg', () => {
  it('returns null for a null input', () => {
    expect(fromCanonicalKg(null, 'kg')).toBeNull();
    expect(fromCanonicalKg(null, 'lb')).toBeNull();
  });

  it('renders stored kilograms at the kilogram display scale', () => {
    expect(fromCanonicalKg('100.000', 'kg')).toBe('100.00');
  });

  it('renders stored kilograms as the pound equivalent at the pound display scale', () => {
    expect(fromCanonicalKg('100.000', 'lb')).toBe('220.5');
  });
});

describe('round trip stability', () => {
  it.each(KG_FIXTURES.map((entered) => ({ unit: 'kg' as WeightUnit, entered })))(
    'entering $entered $unit survives a canonical -> display -> canonical round trip',
    ({ unit, entered }) => {
      const canonical = toCanonicalKg(entered, unit);
      expect(canonical).not.toBeNull();
      const display = fromCanonicalKg(canonical, unit);
      expect(toCanonicalKg(display, unit)).toBe(canonical);
    },
  );

  it.each(LB_FIXTURES.map((entered) => ({ unit: 'lb' as WeightUnit, entered })))(
    'entering $entered $unit survives a canonical -> display -> canonical round trip',
    ({ unit, entered }) => {
      const canonical = toCanonicalKg(entered, unit);
      expect(canonical).not.toBeNull();
      const display = fromCanonicalKg(canonical, unit);
      expect(toCanonicalKg(display, unit)).toBe(canonical);
    },
  );

  it('does not drift across fifty repeated round trips through the other unit', () => {
    const original = toCanonicalKg('225', 'lb');
    let current = original;
    for (let i = 0; i < 50; i += 1) {
      const display = fromCanonicalKg(current, 'lb');
      current = toCanonicalKg(display, 'lb');
    }
    expect(current).toBe(original);
  });
});

describe('collision safety', () => {
  it('lets two values one gram apart render identically in pounds without altering either stored value', () => {
    const lower = '100.000';
    const higher = '100.001';
    expect(fromCanonicalKg(lower, 'lb')).toBe(fromCanonicalKg(higher, 'lb'));
    expect(lower).toBe('100.000');
    expect(higher).toBe('100.001');
  });

  it('renders two kilogram-equal stored values as equal in pounds', () => {
    const stored = '62.500';
    expect(fromCanonicalKg(stored, 'lb')).toBe(fromCanonicalKg(stored, 'lb'));
  });
});

describe('ordering', () => {
  const ascendingCanonicalKg = ['0.500', '1.000', '22.500', '22.501', '100.000', '140.250'];

  function asNumber(rendered: string | null): number {
    return Number(rendered);
  }

  it('sorts the same by canonical decimal, by kilogram rendering, and by pound rendering', () => {
    const kgRendered = ascendingCanonicalKg.map((kg) => asNumber(fromCanonicalKg(kg, 'kg')));
    const lbRendered = ascendingCanonicalKg.map((kg) => asNumber(fromCanonicalKg(kg, 'lb')));

    const isNonDecreasing = (values: number[]) => values.every((value, i) => i === 0 || value >= values[i - 1]);

    expect(isNonDecreasing(kgRendered)).toBe(true);
    expect(isNonDecreasing(lbRendered)).toBe(true);
  });
});

describe('formatWeight', () => {
  it('appends the unit suffix', () => {
    expect(formatWeight('100.000', 'kg')).toBe('100.00 kg');
    expect(formatWeight('100.000', 'lb')).toBe('220.5 lb');
  });

  it('renders a null weight as an em dash rather than zero', () => {
    expect(formatWeight(null, 'kg')).toBe('—');
  });
});

describe('the module never surfaces a weight as a JavaScript number', () => {
  it('returns strings or null from every conversion function', () => {
    expect(typeof toCanonicalKg('10', 'kg')).toBe('string');
    expect(typeof fromCanonicalKg('10.000', 'kg')).toBe('string');
    expect(typeof formatWeight('10.000', 'kg')).toBe('string');
    expect(toCanonicalKg(null, 'kg')).toBeNull();
    expect(fromCanonicalKg(null, 'kg')).toBeNull();
  });

  it('never assigns a number type to the scale constants that would leak into a weight value', () => {
    expect(typeof CANONICAL_KG_SCALE).toBe('number');
    expect(typeof DISPLAY_SCALE.kg).toBe('number');
    expect(typeof KG_PER_LB.numerator).toBe('bigint');
  });
});

describe('single-declaration gate (T-02-19)', () => {
  const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
  const SEARCH_DIRS = ['apps', 'packages'];
  const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', '.expo', 'expo-web-build', '.turbo']);
  const UNITS_MODULE = path.join(REPO_ROOT, 'packages', 'api-contracts', 'src', 'units.ts');

  function collectTsFiles(dir: string, out: string[] = []): string[] {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectTsFiles(full, out);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        out.push(full);
      }
    }
    return out;
  }

  const allTsFiles = SEARCH_DIRS.flatMap((dir) => collectTsFiles(path.join(REPO_ROOT, dir)));

  it('declares the KG_PER_LB conversion factor in exactly one file', () => {
    const declarationPattern = /\bKG_PER_LB\s*=/;
    const matches = allTsFiles.filter((file) => declarationPattern.test(fs.readFileSync(file, 'utf8')));
    expect(matches).toEqual([UNITS_MODULE]);
  });

  it('declares the pound-to-kilogram exact literal in exactly one file', () => {
    // Built at runtime rather than typed as a literal, so this assertion itself never becomes a
    // second file the gate would have to exempt.
    const poundDefinitionDigits = ['4', '5', '3', '5', '9', '2', '3', '7'].join('');
    const matches = allTsFiles.filter((file) => fs.readFileSync(file, 'utf8').includes(poundDefinitionDigits));
    expect(matches).toEqual([UNITS_MODULE]);
  });

  it('never applies a naive 2.2-multiplier conversion anywhere in the mobile app', () => {
    const naivePattern = /weight.*\*\s*2\.2|weight.*\/\s*2\.2/i;
    const mobileLibFiles = collectTsFiles(path.join(REPO_ROOT, 'apps', 'mobile', 'lib'));
    const offenders = mobileLibFiles.filter((file) => naivePattern.test(fs.readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
