import { DEGRADATION_KINDS, type DegradationEntry } from './result';

// D-21: this list is a first-class part of the generator's return value, surfaced to the user
// before the program is saved — never a log line. Deterministically ordered by DEGRADATION_KINDS
// position, then day key, then muscle group id, and de-duplicated so an identical reduction
// reported twice (e.g. the same unfillable slot noticed by two code paths) surfaces once.
function keyOf(entry: DegradationEntry): string {
  return `${entry.kind}|${entry.dayKey ?? ''}|${entry.muscleGroupId ?? ''}|${entry.detail}`;
}

function rankOf(entry: DegradationEntry): number {
  return DEGRADATION_KINDS.indexOf(entry.kind);
}

export function collectDegradations(entries: DegradationEntry[]): DegradationEntry[] {
  const seen = new Set<string>();
  const deduped: DegradationEntry[] = [];

  for (const entry of entries) {
    const key = keyOf(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }

  return deduped.sort((a, b) => {
    const rankDiff = rankOf(a) - rankOf(b);
    if (rankDiff !== 0) return rankDiff;

    const dayA = a.dayKey ?? '';
    const dayB = b.dayKey ?? '';
    if (dayA !== dayB) return dayA < dayB ? -1 : 1;

    const groupA = a.muscleGroupId ?? '';
    const groupB = b.muscleGroupId ?? '';
    if (groupA !== groupB) return groupA < groupB ? -1 : 1;

    return 0;
  });
}
