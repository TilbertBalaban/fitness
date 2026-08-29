import { formatMuscleVolumeLabel, MUSCLE_MAP_VOLUME_CAPTION, staleRollupCaption } from '../muscle-map-labels';

describe('formatMuscleVolumeLabel', () => {
  it('renders a weighted volume in kilograms through the shared weight formatter', () => {
    expect(formatMuscleVolumeLabel(182.5, 'kg')).toBe('182.50 kg');
  });

  it('renders a weighted volume in pounds through the shared weight formatter', () => {
    expect(formatMuscleVolumeLabel(100, 'lb')).toBe('220.5 lb');
  });

  it('never returns a bare number without a unit', () => {
    expect(formatMuscleVolumeLabel(0, 'kg')).toMatch(/kg$/);
  });
});

describe('staleRollupCaption', () => {
  it('returns null at zero — silence is the nothing-to-disclose state', () => {
    expect(staleRollupCaption(0)).toBeNull();
  });

  it('uses the singular noun for exactly one session', () => {
    expect(staleRollupCaption(1)).toBe('Includes 1 session not yet reflected on the server.');
  });

  it('uses the plural noun for any other count', () => {
    expect(staleRollupCaption(2)).toBe('Includes 2 sessions not yet reflected on the server.');
  });
});

describe('MUSCLE_MAP_VOLUME_CAPTION', () => {
  it('states the D-04 disambiguation verbatim', () => {
    expect(MUSCLE_MAP_VOLUME_CAPTION).toContain('Training Volume');
    expect(MUSCLE_MAP_VOLUME_CAPTION).toContain('Muscles trained');
    expect(MUSCLE_MAP_VOLUME_CAPTION).toContain('Home');
  });
});
