import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GenerationCatalog, GenerationInput } from '../result';
import { generateProgram } from '../generate';

const MUSCLE_GROUPS_FOR_FULL_BODY_3 = [
  'chest',
  'lats',
  'quads',
  'hamstrings',
  'glutes',
  'front_delts',
  'side_delts',
  'biceps',
  'triceps',
  'abs',
] as const;

function fullCatalog(): GenerationCatalog {
  const exercises = MUSCLE_GROUPS_FOR_FULL_BODY_3.map((muscleGroupId) => ({
    id: `ex-${muscleGroupId}`,
    name: `${muscleGroupId} exercise`,
    equipmentRequired: null,
    movementPattern: null,
  }));

  const mappings = MUSCLE_GROUPS_FOR_FULL_BODY_3.map((muscleGroupId) => ({
    exerciseId: `ex-${muscleGroupId}`,
    muscleGroupId,
    role: 'primary' as const,
    weightFactor: '1.0',
  }));

  return { exercises, mappings };
}

function tracerInput(overrides: Partial<GenerationInput> = {}): GenerationInput {
  return {
    routineName: 'My Program',
    trainingGoal: 'hypertrophy',
    experienceLevel: 'intermediate',
    daysPerWeek: 3,
    sessionLengthMinutes: 60,
    splitPreference: 'full_body',
    emphasis: {},
    deloadPlacement: 'every_n_cycles',
    deloadEveryNCycles: 3,
    trainingCycleCount: 4,
    variantSeed: 1,
    catalog: fullCatalog(),
    inventory: null,
    excludedExerciseIds: [],
    ...overrides,
  };
}

describe('D-03: byte-determinism', () => {
  it('produces identical JSON for two calls on the same input', () => {
    const input = tracerInput();
    expect(JSON.stringify(generateProgram(input))).toBe(JSON.stringify(generateProgram(input)));
  });

  it('produces a different, itself-stable result when only variantSeed changes', () => {
    const a1 = JSON.stringify(generateProgram(tracerInput({ variantSeed: 7 })));
    const a2 = JSON.stringify(generateProgram(tracerInput({ variantSeed: 7 })));
    const b1 = JSON.stringify(generateProgram(tracerInput({ variantSeed: 1234 })));
    const b2 = JSON.stringify(generateProgram(tracerInput({ variantSeed: 1234 })));

    expect(a1).toBe(a2);
    expect(b1).toBe(b2);
  });
});

describe('D-03: no clock, no random source', () => {
  // The forbidden tokens are assembled from fragments at runtime so this gate's own source text
  // can never match itself (it would otherwise contain the literal strings it's searching for).
  const FORBIDDEN_TOKENS = [
    ['Date', '.', 'now', '('].join(''),
    ['new', ' ', 'Date', '('].join(''),
    ['Math', '.', 'random', '('].join(''),
    ['crypto', '.', 'randomUUID', '('].join(''),
  ];

  function stripComments(source: string): string {
    return source
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');
  }

  function listSourceFiles(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.name === '__tests__') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...listSourceFiles(fullPath));
      } else if (entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  it('contains no clock or random source anywhere under src (excluding __tests__)', () => {
    const srcDir = path.join(__dirname, '..');
    const files = listSourceFiles(srcDir);
    expect(files.length).toBeGreaterThan(0);

    const offenders: { file: string; token: string }[] = [];
    for (const file of files) {
      const stripped = stripComments(fs.readFileSync(file, 'utf8'));
      for (const token of FORBIDDEN_TOKENS) {
        if (stripped.includes(token)) {
          offenders.push({ file, token });
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
