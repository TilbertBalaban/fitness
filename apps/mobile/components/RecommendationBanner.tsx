import { Text, View } from 'react-native';
import { formatWeight, type WeightUnit } from '@fitness/api-contracts';
import type { ProgressionResult } from '@fitness/progression-engine';
import type { ThemeColors } from '@/lib/theme-colors';

export interface RecommendationBannerProps {
  result: ProgressionResult | null;
  weightUnit: WeightUnit;
  colors: ThemeColors;
}

// PRGR-09/D-05: the offer is a second, visually and textually distinct line — it is never the
// recommendation itself. It arrives already built (weight, reps); this component only formats it
// for display, the same as the recommendation's own weight, and adds no accept control — automatic
// acceptance of a reduction is explicitly deferred, and an accept path would need a write target
// this phase does not have.
function renderRecommendation(result: Extract<ProgressionResult, { kind: 'recommendation' }>, weightUnit: WeightUnit) {
  const weightLabel = formatWeight(result.weightKg, weightUnit);
  const repsLabel = result.rir !== null ? `${result.reps} reps @ RIR ${result.rir}` : `${result.reps} reps`;
  return (
    <>
      <Text className="mb-md text-body font-semibold text-foreground">{`Next: ${weightLabel} × ${repsLabel}`}</Text>
      {result.offeredReduction !== null ? (
        <Text className="mb-md text-body font-normal text-foreground-muted">
          {`A lighter option is available if you'd rather take it: ${formatWeight(result.offeredReduction.weightKg, weightUnit)} × ${result.offeredReduction.reps} reps.`}
        </Text>
      ) : null}
    </>
  );
}

function renderUnavailable(result: Extract<ProgressionResult, { kind: 'unavailable' }>) {
  switch (result.reason) {
    case 'incomplete_prescription':
      return <Text className="mb-md text-body font-normal text-foreground-muted">Set a rep range and RIR target to get a recommendation.</Text>;
    case 'no_achievable_weight':
      return <Text className="mb-md text-body font-normal text-foreground-muted">No loadable weight matches the next target at this gym.</Text>;
    case 'equipment_unavailable':
      return <Text className="mb-md text-body font-normal text-foreground-muted">This equipment isn&apos;t available for this session.</Text>;
    default: {
      // Exhaustiveness guard: a reason added later without a case above is a compile error here,
      // never a silent fall-through to nothing rendered.
      const exhaustive: never = result.reason;
      return exhaustive;
    }
  }
}

// Hook-free and props-driven (matching PlateStripView's own no-computation contract): the result
// arrives already computed by the caller's useMemo over the engine's public entry point — this
// component performs no computation and calls no engine function. Every branch of D-09/D-15's three-member
// union is rendered exhaustively so a fourth member added later is a compile error, not a silently
// blank banner. The copy below is this project's own design (D-05/D-06's honesty requirement
// extends to every user-facing string this phase writes) and must never be worded as if it came
// from a published source or coach.
export function RecommendationBanner({ result, weightUnit, colors: _colors }: RecommendationBannerProps) {
  if (result === null) return null;

  switch (result.kind) {
    case 'recommendation':
      return renderRecommendation(result, weightUnit);
    case 'no_history':
      return <Text className="mb-md text-body font-normal text-foreground-muted">No history yet — pick your own starting weight.</Text>;
    case 'unavailable':
      return renderUnavailable(result);
    default: {
      const exhaustive: never = result;
      return exhaustive;
    }
  }
}
