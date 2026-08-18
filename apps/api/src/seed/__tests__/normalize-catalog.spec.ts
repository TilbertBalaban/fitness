import { LOAD_TYPES, MOVEMENT_PATTERNS, MUSCLE_GROUPS, EQUIPMENT_TYPES } from '@fitness/api-contracts';
import {
  AMBIGUOUS_DELT,
  BODYWEIGHT_CONTRIBUTION_DEFAULTS,
  LOAD_TYPE_RULES,
  MOVEMENT_PATTERN_RULES,
  SOURCE_EQUIPMENT_TO_CANONICAL,
  SOURCE_MUSCLE_TO_CANONICAL,
  WEIGHT_FACTOR_OVERRIDES,
} from '../catalog-taxonomy';

// The 17 free-exercise-db muscle values [VERIFIED via direct fetch of dist/exercises.json,
// 2026-08-18] this table must cover, exactly.
const FEDB_MUSCLE_VALUES = [
  'abdominals',
  'abductors',
  'adductors',
  'biceps',
  'calves',
  'chest',
  'forearms',
  'glutes',
  'hamstrings',
  'lats',
  'lower back',
  'middle back',
  'neck',
  'quadriceps',
  'shoulders',
  'traps',
  'triceps',
];

// The 12 non-null free-exercise-db equipment values this table must cover, exactly.
const FEDB_EQUIPMENT_VALUES = [
  'body only',
  'machine',
  'other',
  'foam roll',
  'barbell',
  'kettlebells',
  'dumbbell',
  'cable',
  'medicine ball',
  'bands',
  'exercise ball',
  'e-z curl bar',
];

const MUSCLE_GROUP_SET = new Set<string>(MUSCLE_GROUPS);
const MOVEMENT_PATTERN_SET = new Set<string>(MOVEMENT_PATTERNS);
const LOAD_TYPE_SET = new Set<string>(LOAD_TYPES);
const EQUIPMENT_TYPE_SET = new Set<string>(EQUIPMENT_TYPES);

describe('catalog-taxonomy', () => {
  describe('SOURCE_MUSCLE_TO_CANONICAL', () => {
    it('has an entry for all 17 free-exercise-db muscle values', () => {
      for (const muscle of FEDB_MUSCLE_VALUES) {
        expect(SOURCE_MUSCLE_TO_CANONICAL[muscle]).toBeDefined();
      }
      expect(Object.keys(SOURCE_MUSCLE_TO_CANONICAL).sort()).toEqual([...FEDB_MUSCLE_VALUES].sort());
    });

    it('maps every value to a MUSCLE_GROUPS member, except the documented AMBIGUOUS_DELT sentinel for shoulders', () => {
      for (const [source, canonical] of Object.entries(SOURCE_MUSCLE_TO_CANONICAL)) {
        if (canonical === AMBIGUOUS_DELT) {
          expect(source).toBe('shoulders');
          continue;
        }
        expect(MUSCLE_GROUP_SET.has(canonical)).toBe(true);
      }
    });
  });

  describe('SOURCE_EQUIPMENT_TO_CANONICAL', () => {
    it('has an entry for all 12 free-exercise-db equipment values', () => {
      for (const equipment of FEDB_EQUIPMENT_VALUES) {
        expect(SOURCE_EQUIPMENT_TO_CANONICAL[equipment]).toBeDefined();
      }
      expect(Object.keys(SOURCE_EQUIPMENT_TO_CANONICAL).sort()).toEqual([...FEDB_EQUIPMENT_VALUES].sort());
    });

    it('maps every value to an EQUIPMENT_TYPES member', () => {
      for (const canonical of Object.values(SOURCE_EQUIPMENT_TO_CANONICAL)) {
        expect(EQUIPMENT_TYPE_SET.has(canonical)).toBe(true);
      }
    });
  });

  describe('MOVEMENT_PATTERN_RULES', () => {
    it('names a pattern in MOVEMENT_PATTERNS for every rule', () => {
      expect(MOVEMENT_PATTERN_RULES.length).toBeGreaterThan(0);
      for (const rule of MOVEMENT_PATTERN_RULES) {
        expect(MOVEMENT_PATTERN_SET.has(rule.pattern)).toBe(true);
        expect(rule.why.length).toBeGreaterThan(0);
      }
    });
  });

  describe('LOAD_TYPE_RULES', () => {
    it('names a type in LOAD_TYPES for every rule', () => {
      expect(LOAD_TYPE_RULES.length).toBeGreaterThan(0);
      for (const rule of LOAD_TYPE_RULES) {
        expect(LOAD_TYPE_SET.has(rule.loadType)).toBe(true);
        expect(rule.why.length).toBeGreaterThan(0);
      }
    });
  });

  describe('BODYWEIGHT_CONTRIBUTION_DEFAULTS', () => {
    const NAMED_FAMILY_KEYS = new Set([
      'pull_up_chin_up',
      'dip',
      'push_up',
      'inverted_row',
      'split_squat_lunge',
      'bodyweight_squat',
    ]);

    it('has a LOAD_TYPES member or a named exercise family for every key', () => {
      for (const key of Object.keys(BODYWEIGHT_CONTRIBUTION_DEFAULTS)) {
        expect(LOAD_TYPE_SET.has(key) || NAMED_FAMILY_KEYS.has(key)).toBe(true);
      }
    });

    it('gives every non-null value as a decimal string between 0.000 and 1.000 inclusive', () => {
      for (const [key, value] of Object.entries(BODYWEIGHT_CONTRIBUTION_DEFAULTS)) {
        if (value === null) continue;
        expect(value).toMatch(/^\d\.\d{3}$/);
        const numeric = Number(value);
        expect(numeric).toBeGreaterThanOrEqual(0);
        expect(numeric).toBeLessThanOrEqual(1);
        void key;
      }
    });

    it('maps external_weight, time_based and distance_based to null -- the concept does not apply to those load types', () => {
      expect(BODYWEIGHT_CONTRIBUTION_DEFAULTS.external_weight).toBeNull();
      expect(BODYWEIGHT_CONTRIBUTION_DEFAULTS.time_based).toBeNull();
      expect(BODYWEIGHT_CONTRIBUTION_DEFAULTS.distance_based).toBeNull();
    });
  });

  describe('WEIGHT_FACTOR_OVERRIDES', () => {
    it('contains at least one entry whose value is neither 1.00 nor 0.50 -- the mechanical check Pitfall 3 names', () => {
      const values = Object.values(WEIGHT_FACTOR_OVERRIDES)
        .flat()
        .map((entry) => entry.weight_factor);
      const distinct = new Set(values);
      expect(distinct.size).toBeGreaterThan(2);
      const nonBinary = values.filter((v) => v !== '1.00' && v !== '0.50');
      expect(nonBinary.length).toBeGreaterThan(0);
    });

    it('every muscle_group_id referenced is a MUSCLE_GROUPS member', () => {
      for (const entries of Object.values(WEIGHT_FACTOR_OVERRIDES)) {
        for (const entry of entries) {
          expect(MUSCLE_GROUP_SET.has(entry.muscle_group_id)).toBe(true);
        }
      }
    });
  });
});
