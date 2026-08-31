// getPowerSync's real module chain reaches @powersync/react-native -> @powersync/shared-internals,
// whose ESM dist Jest cannot parse (WINDOWS #22/#33) — mocked before importing the screen module so
// its top-level `import { getPowerSync } from '@/lib/db/powersync'` never reaches that chain,
// matching home-dashboard.test.ts's own precedent.
jest.mock('../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../lib/db/programs/next-up-query', () => ({ loadNextUp: jest.fn() }));
// authClient's better-auth/react ESM dist is one Jest cannot parse, same rationale as the
// powersync mock above.
jest.mock('../../lib/auth-client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

import { dispatchQuickAction, type QuickActionHandlers } from '../(tabs)/index';
import type { QuickActionId } from '@/components/QuickActionSheet';

function recordingHandlers(calls: string[]): QuickActionHandlers {
  return {
    dismiss: () => calls.push('dismiss'),
    navigate: (route) => calls.push(`navigate:${route}`),
    openMetricEntry: (kind) => calls.push(`openMetricEntry:${kind}`),
    openMeasurementPicker: () => calls.push('openMeasurementPicker'),
    openPhotoCapture: () => calls.push('openPhotoCapture'),
  };
}

// R30: a pure-navigation destination dismisses the sheet BEFORE navigating, asserted by recording
// call order, not by inspecting the final state — a final-state assertion would pass identically
// for a sheet that navigated while still mounted.
describe('dispatchQuickAction — pure-navigation rows dismiss before navigating (R30)', () => {
  const cases: Array<[QuickActionId, string]> = [
    ['history', 'navigate:/(tabs)/history'],
    ['new_program', 'navigate:/programs/generate'],
    ['one_off_workout', 'navigate:/(tabs)/workout?openOneOff=1'],
  ];

  it.each(cases)('dismisses before navigating for %s', (id, expectedNavigateCall) => {
    const calls: string[] = [];
    dispatchQuickAction(id, recordingHandlers(calls));

    expect(calls).toEqual(['dismiss', expectedNavigateCall]);
  });
});

describe('dispatchQuickAction — in-place rows (D-29)', () => {
  it("dismisses, then opens the metric entry sheet pre-selected to 'bodyweight' for quick_weigh_in — no kind picker step", () => {
    const calls: string[] = [];
    dispatchQuickAction('quick_weigh_in', recordingHandlers(calls));

    expect(calls).toEqual(['dismiss', 'openMetricEntry:bodyweight']);
  });

  it('dismisses, then opens the measurement kind picker for quick_measurement', () => {
    const calls: string[] = [];
    dispatchQuickAction('quick_measurement', recordingHandlers(calls));

    expect(calls).toEqual(['dismiss', 'openMeasurementPicker']);
  });

  it('dismisses, then opens photo capture directly for progress_photo', () => {
    const calls: string[] = [];
    dispatchQuickAction('progress_photo', recordingHandlers(calls));

    expect(calls).toEqual(['dismiss', 'openPhotoCapture']);
  });

  it('never calls navigate for an in-place action', () => {
    const calls: string[] = [];
    dispatchQuickAction('quick_weigh_in', recordingHandlers(calls));
    dispatchQuickAction('quick_measurement', recordingHandlers(calls));
    dispatchQuickAction('progress_photo', recordingHandlers(calls));

    expect(calls.some((call) => call.startsWith('navigate:'))).toBe(false);
  });
});
