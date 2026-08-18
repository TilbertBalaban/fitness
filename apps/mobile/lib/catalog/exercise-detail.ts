import { eq } from 'drizzle-orm';
import type { MuscleRole } from '@fitness/api-contracts';
import type { WriteDb } from '../db/powersync';
import { exercise, exerciseMuscleMapping, muscleGroup, seededExercise } from '../db/schema';

export interface MuscleTarget {
  muscleGroupId: string;
  name: string;
  bodyRegion: string;
  weightFactor: string;
}

// Carries `role` only while sorting/grouping — ExerciseDetail's own primaryMuscles/secondaryMuscles
// arrays drop it because splitting by role already encodes it structurally.
export interface RawMuscleTarget extends MuscleTarget {
  role: MuscleRole;
}

export interface ExerciseDetail {
  id: string;
  name: string;
  aliases: string[];
  movementPattern: string | null;
  equipmentRequired: string | null;
  loadType: string;
  unilateral: boolean;
  instructionsText: string | null;
  cueText: string | null;
  imageUrls: string[];
  primaryMuscles: MuscleTarget[];
  secondaryMuscles: MuscleTarget[];
}

// Exported separately from loadExerciseDetail so the total-ordering contract is unit-testable
// without a database. Primary before secondary is the first key; weightFactor is compared
// numerically (Number(), never a string compare) so '0.30' sorts below '1.00'; muscle group name
// ascending is the tie-break that makes the order total, not merely deterministic-in-practice —
// without it, two mappings sharing a role and a weight_factor could still swap position across a
// re-render of identical data.
export function sortMuscleTargets(targets: RawMuscleTarget[]): RawMuscleTarget[] {
  return [...targets].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'primary' ? -1 : 1;
    const weightDiff = Number(b.weightFactor) - Number(a.weightFactor);
    if (weightDiff !== 0) return weightDiff;
    return a.name.localeCompare(b.name);
  });
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? (parsed as string[]) : [];
}

interface DetailJoinRow {
  id: string;
  name: string;
  aliases: string | null;
  movementPattern: string | null;
  equipmentRequired: string | null;
  loadType: string;
  unilateral: boolean;
  instructionsText: string | null;
  cueText: string | null;
  imageUrls: string | null;
  muscleGroupId: string | null;
  muscleGroupName: string | null;
  muscleGroupBodyRegion: string | null;
  role: string | null;
  weightFactor: string | null;
}

// One joined query per candidate table — exercise + muscle mappings + muscle groups in a single
// round trip, never a per-mapping muscle-group lookup. PITFALLS.md §13 names that per-mapping
// shape as this project's canonical N+1 risk.
async function queryDetailRows(
  db: WriteDb,
  table: typeof seededExercise | typeof exercise,
  id: string,
): Promise<DetailJoinRow[]> {
  const rows = await db
    .select({
      id: table.id,
      name: table.name,
      aliases: table.aliases,
      movementPattern: table.movementPattern,
      equipmentRequired: table.equipmentRequired,
      loadType: table.loadType,
      unilateral: table.unilateral,
      instructionsText: table.instructionsText,
      cueText: table.cueText,
      imageUrls: table.imageUrls,
      muscleGroupId: muscleGroup.id,
      muscleGroupName: muscleGroup.name,
      muscleGroupBodyRegion: muscleGroup.bodyRegion,
      role: exerciseMuscleMapping.role,
      weightFactor: exerciseMuscleMapping.weightFactor,
    })
    .from(table)
    .leftJoin(exerciseMuscleMapping, eq(exerciseMuscleMapping.exerciseId, table.id))
    .leftJoin(muscleGroup, eq(muscleGroup.id, exerciseMuscleMapping.muscleGroupId))
    .where(eq(table.id, id));
  return rows as DetailJoinRow[];
}

// Seeded rows live in localOnly seededExercise (WINDOWS #32); custom rows stay in the synced
// exercise table. An id is unique across both, so at most one of the two lookups below returns
// rows — this mirrors the union read path apps/mobile/app/exercises/[id].tsx already establishes.
export async function loadExerciseDetail(db: WriteDb, id: string): Promise<ExerciseDetail | null> {
  const seededRows = await queryDetailRows(db, seededExercise, id);
  const rows = seededRows.length > 0 ? seededRows : await queryDetailRows(db, exercise, id);

  const [base] = rows;
  if (!base) return null;

  const rawTargets: RawMuscleTarget[] = rows
    .filter((row) => row.muscleGroupId !== null && row.role !== null && row.weightFactor !== null)
    .map((row) => ({
      muscleGroupId: row.muscleGroupId as string,
      name: row.muscleGroupName as string,
      bodyRegion: row.muscleGroupBodyRegion as string,
      weightFactor: row.weightFactor as string,
      role: row.role as MuscleRole,
    }));

  const sorted = sortMuscleTargets(rawTargets);
  const stripRole = ({ role: _role, ...target }: RawMuscleTarget): MuscleTarget => target;

  return {
    id: base.id,
    name: base.name,
    aliases: parseJsonArray(base.aliases),
    movementPattern: base.movementPattern,
    equipmentRequired: base.equipmentRequired,
    loadType: base.loadType,
    unilateral: base.unilateral,
    instructionsText: base.instructionsText,
    cueText: base.cueText,
    imageUrls: parseJsonArray(base.imageUrls),
    primaryMuscles: sorted.filter((target) => target.role === 'primary').map(stripRole),
    secondaryMuscles: sorted.filter((target) => target.role === 'secondary').map(stripRole),
  };
}
