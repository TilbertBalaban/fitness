import { buildChartGeometry, CHART_VERTICAL_PAD_RATIO, linearScale, paddedDomain } from '../chart-geometry';

describe('linearScale', () => {
  it('maps a value proportionally through the domain onto the range', () => {
    expect(linearScale([10, 20], [0, 100])(15)).toBe(50);
    expect(linearScale([10, 20], [0, 100])(10)).toBe(0);
    expect(linearScale([10, 20], [0, 100])(20)).toBe(100);
  });

  it('maps a zero-width domain to the range midpoint instead of a non-finite number', () => {
    const scale = linearScale([5, 5], [0, 100]);
    expect(scale(5)).toBe(50);
    expect(Number.isFinite(scale(5))).toBe(true);
  });

  it('produces a SMALLER coordinate for a HIGHER value when the output range is inverted', () => {
    const scale = linearScale([100, 200], [116, 4]);
    expect(scale(200)).toBeLessThan(scale(100));
  });
});

describe('paddedDomain', () => {
  it('pads min and max by the pad ratio of the span and never starts at zero', () => {
    const [min, max] = paddedDomain([100, 105]);
    const pad = 5 * CHART_VERTICAL_PAD_RATIO;
    expect(min).toBeCloseTo(100 - pad, 6);
    expect(max).toBeCloseTo(105 + pad, 6);
    expect(min).not.toBe(0);
  });

  it('returns a non-zero-width domain when every value is identical, so a flat series still draws', () => {
    const [min, max] = paddedDomain([100, 100, 100]);
    expect(max).toBeGreaterThan(min);
  });

  it('returns a non-zero-width domain for an all-zero series', () => {
    const [min, max] = paddedDomain([0, 0]);
    expect(max).toBeGreaterThan(min);
  });
});

describe('buildChartGeometry', () => {
  const width = 300;
  const height = 120;

  it('builds a move-then-line path, a closed area path and one marker per value', () => {
    const geometry = buildChartGeometry({ values: [100, 110, 105], width, height });

    expect(geometry.line.startsWith('M')).toBe(true);
    expect(geometry.line.split(' ').filter((command) => command.startsWith('L'))).toHaveLength(2);
    expect(geometry.area.startsWith(geometry.line)).toBe(true);
    expect(geometry.area.endsWith('Z')).toBe(true);
    expect(geometry.area).toContain(String(geometry.baselineY));
    expect(geometry.markers).toHaveLength(3);
  });

  it('rounds every coordinate to two decimals', () => {
    const geometry = buildChartGeometry({ values: [100, 133, 107], width: 317, height });

    for (const marker of geometry.markers) {
      expect(marker.x).toBe(Number(marker.x.toFixed(2)));
      expect(marker.y).toBe(Number(marker.y.toFixed(2)));
    }
    expect(geometry.line).not.toMatch(/\.\d{3}/);
  });

  it('places a higher value above a lower one, because SVG y grows downward', () => {
    const geometry = buildChartGeometry({ values: [100, 200], width, height });
    expect(geometry.markers[1].y).toBeLessThan(geometry.markers[0].y);
  });

  it('draws a flat series at the vertical centre rather than vanishing', () => {
    const geometry = buildChartGeometry({ values: [80, 80, 80], width, height });

    for (const marker of geometry.markers) {
      expect(Number.isFinite(marker.y)).toBe(true);
      expect(marker.y).toBeCloseTo(height / 2, 0);
    }
  });

  it('returns exactly one marker and no paths for a single value', () => {
    const geometry = buildChartGeometry({ values: [100], width, height });

    expect(geometry.markers).toHaveLength(1);
    expect(geometry.line).toBe('');
    expect(geometry.area).toBe('');
  });

  it('returns no markers and no paths for an empty series', () => {
    const geometry = buildChartGeometry({ values: [], width, height });

    expect(geometry.markers).toHaveLength(0);
    expect(geometry.line).toBe('');
    expect(geometry.area).toBe('');
  });
});
