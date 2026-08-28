import type { EquipmentType, SetType } from '@fitness/api-contracts';
import type { ResolvedInventory } from '@fitness/plate-math';

export interface LoggedSetInput {
  id: string;
  parentSetId: string | null;
  setType: SetType;
  weightKg: string | null;
  reps: number;
  rir: number | null;
  // Not typed as a closed union: the logged_set.side column is a plain text field with no
  // enumerated vocabulary yet, and 08-03 (not this plan) is what defines and consumes per-side
  // values. This module reads the column as-is and does not interpret it.
  side: string | null;
  completed: boolean;
}

export interface ExerciseSessionSets {
  sessionId: string;
  sets: LoggedSetInput[];
}

export interface NormalizedPerformance {
  sessionId: string;
  weightKg: string | null;
  reps: number;
  rir: number | null;
  setType: SetType;
}

export interface RecommendInput {
  // D-10/PRGR-08: most-recent-first, positional only. No entry here carries a timestamp and no
  // caller may filter or weight this list by elapsed time — a recency weight added later would
  // silently reintroduce the layoff-penalty behaviour PRGR-08 forbids.
  sessions: ExerciseSessionSets[];
  prescription: {
    targetRepMin: number | null;
    targetRepMax: number | null;
    targetRir: number | null;
  };
  equipmentType: EquipmentType | null;
  inventory: ResolvedInventory | null;
}

export type RecommendationBasis = 'load_increase' | 'rep_increase' | 'hold' | 'failure_rep_increase';

export type UnavailableReason = 'incomplete_prescription' | 'no_achievable_weight' | 'equipment_unavailable';

export interface OfferedReduction {
  weightKg: string | null;
  reps: number;
}

export type ProgressionResult =
  | {
      kind: 'recommendation';
      weightKg: string | null;
      reps: number;
      rir: number | null;
      basis: RecommendationBasis;
      // Always null in this plan; 08-04 populates it once the shortfall-streak rule exists. Left
      // present on the type now so that plan's call sites gain a value rather than a shape change.
      offeredReduction: OfferedReduction | null;
    }
  | { kind: 'no_history' }
  | { kind: 'unavailable'; reason: UnavailableReason };
