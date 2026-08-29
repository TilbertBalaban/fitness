import { CANONICAL_KG_SCALE, formatWeight, type WeightUnit } from '@fitness/api-contracts';
import { pluralizeCount } from './chart-labels';

// The app has exactly one weight formatter (formatWeight, @fitness/api-contracts); this converts a
// pure-package number into that formatter's canonical-string input rather than growing a second
// weight formatter for this screen.
export function formatMuscleVolumeLabel(weightedVolumeKg: number, unit: WeightUnit): string {
  return formatWeight(weightedVolumeKg.toFixed(CANONICAL_KG_SCALE), unit);
}

// null (not "0 sessions") is the nothing-to-disclose state (R25) — the caller renders this caption
// only when the return value is non-null, matching the shipped stale-rollup absent-by-default rule.
export function staleRollupCaption(overlaySessionCount: number): string | null {
  if (overlaySessionCount === 0) return null;
  return `Includes ${pluralizeCount(overlaySessionCount, 'session', 'sessions')} not yet reflected on the server.`;
}

// D-04's disambiguation sentence, transcribed verbatim from the Copywriting Contract — a constant
// rather than inline JSX text because it is the one place a lifter could otherwise conflate this
// figure with Home's muscles-trained count.
export const MUSCLE_MAP_VOLUME_CAPTION =
  "Training Volume — includes secondary muscles, weighted by contribution. This is different from 'Muscles trained' on Home.";
