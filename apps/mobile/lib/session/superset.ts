// Pure module, no database access and no React — mirrors auto-advance.ts's shape. Every function
// takes the already-loaded LIVE exercise list as its first argument: loadSessionTree filters
// removed_at IS NULL before this module ever sees a row, which is precisely what makes D-24's
// "live members only" rule fall out with no extra branching anywhere below.
export interface SupersetMemberInput {
  id: string;
  orderIndex: number;
  supersetGroupId: string | null;
  exerciseName: string;
}

// The shared core every other function in this file is written in terms of, so "who is in this
// group" is answered in exactly one place. An ungrouped exercise (supersetGroupId null) resolves
// to a one-member list containing only itself — a group of one — which is what lets
// isFinalGroupMember treat "ungrouped" and "shrunk to one live member" as the same trivial case
// rather than two separate branches.
export function supersetMembers(exercises: SupersetMemberInput[], sessionExerciseId: string): SupersetMemberInput[] {
  const self = exercises.find((exercise) => exercise.id === sessionExerciseId);
  if (!self) return [];
  if (self.supersetGroupId === null) return [self];

  return exercises
    .filter((exercise) => exercise.supersetGroupId === self.supersetGroupId)
    .sort((a, b) => a.orderIndex - b.orderIndex);
}

// (a) "Highest" is scoped to the members supersetMembers returns for THIS group — never to
// order_index read globally across the session. A two-member group sitting at the very start of a
// long session still resolves correctly, because the comparison set is the group, not the session
// (Pitfall 4's exact failure).
// (b) An ungrouped exercise returning true is what lets the rest-start call site stay a single
// unconditional call — it never needs an `if (supersetGroupId === null)` escape hatch of its own.
// (c) D-24's shrunk-to-one group needs no branch: once the other member's row drops out of the
// live list, supersetMembers already returns a one-member list, and a one-member list's sole
// member is trivially its own highest.
export function isFinalGroupMember(exercises: SupersetMemberInput[], sessionExerciseId: string): boolean {
  const members = supersetMembers(exercises, sessionExerciseId);
  if (members.length === 0) return true;

  const highest = members[members.length - 1];
  return highest.id === sessionExerciseId;
}

// D-14's advance: fires on EVERY completed set on a non-final member, regardless of that
// exercise's own target-set completion. Deliberately NOT part of shouldAutoAdvance (Pitfall 5) —
// shouldAutoAdvance fires only once the whole exercise's prescription is met, and conflating the
// two would make a superset's first exercise never advance. Takes the pager's own list index
// (mirroring shouldAutoAdvance's currentIndex/exerciseCount shape), not a session_exercise id,
// because that is what the pager needs back.
export function nextSupersetMemberIndex(exercises: SupersetMemberInput[], currentIndex: number): number | null {
  const current = exercises[currentIndex];
  if (!current) return null;
  if (isFinalGroupMember(exercises, current.id)) return null;

  const members = supersetMembers(exercises, current.id);
  const position = members.findIndex((member) => member.id === current.id);
  const nextMember = members[position + 1];
  if (!nextMember) return null;

  const nextIndex = exercises.findIndex((exercise) => exercise.id === nextMember.id);
  return nextIndex === -1 ? null : nextIndex;
}

// The Exercise Page partner chip's copy (UI-SPEC "Superset — Exercise Strip & Exercise Page"):
// null for an ungrouped exercise or a group whose live membership has shrunk to one (D-24), the
// two-member phrasing for the shape this phase's forming UI actually produces, and the
// read-tolerant N-of-3-or-more phrasing for a chained-pairwise group (D-15).
export function supersetPartnerLabel(exercises: SupersetMemberInput[], sessionExerciseId: string): string | null {
  const members = supersetMembers(exercises, sessionExerciseId);
  if (members.length <= 1) return null;

  if (members.length === 2) {
    const partner = members.find((member) => member.id !== sessionExerciseId);
    return partner ? `Superset with ${partner.exerciseName}` : null;
  }

  return `Superset (${members.length} exercises)`;
}

// The Detach row's partner name (A-P7 — the UI-SPEC leaves the N-of-3-or-more case a backstop).
// This resolves it as a defined choice, not an incidental one: the other member for a two-member
// group, and the immediately adjacent live member by order_index for a group of three or more —
// preferring the next-higher neighbor, falling back to the next-lower one only for the group's own
// highest member (which has no higher neighbor to name).
export function detachRowPartnerName(exercises: SupersetMemberInput[], sessionExerciseId: string): string | null {
  const members = supersetMembers(exercises, sessionExerciseId);
  if (members.length <= 1) return null;

  const position = members.findIndex((member) => member.id === sessionExerciseId);
  if (position === -1) return null;

  const adjacent = members[position + 1] ?? members[position - 1];
  return adjacent ? adjacent.exerciseName : null;
}
