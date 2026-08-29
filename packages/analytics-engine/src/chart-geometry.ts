export const CHART_VERTICAL_PAD_RATIO = 0.1;

// Keeps the outermost markers and the line's round caps inside the canvas; an unpadded extreme
// point is drawn half outside the viewport and reads as clipping.
export const CHART_EDGE_PAD = 4;

const COORDINATE_DECIMALS = 2;

export interface ChartMarker {
  x: number;
  y: number;
}

export interface ChartGeometry {
  line: string;
  area: string;
  markers: ChartMarker[];
  baselineY: number;
}

export interface ChartGeometryInput {
  values: number[];
  width: number;
  height: number;
}

export function linearScale(domain: [number, number], range: [number, number]): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  // Dividing by a zero span yields Infinity/NaN, which the SVG renderer drops from the path with no
  // error at all — the difference between a flat line and an invisible chart.
  if (span === 0) return () => (r0 + r1) / 2;
  return (value: number) => r0 + ((value - d0) / span) * (r1 - r0);
}

export function paddedDomain(values: number[]): [number, number] {
  if (values.length === 0) return [-1, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  // Never [0, max]: a 100-to-105 kg series scaled from zero is a flat line against the frame's
  // bottom edge and reads as no progress at all.
  const pad = span > 0 ? span * CHART_VERTICAL_PAD_RATIO : Math.max(Math.abs(max) * CHART_VERTICAL_PAD_RATIO, 1);
  return [min - pad, max + pad];
}

function round(value: number): number {
  return Number(value.toFixed(COORDINATE_DECIMALS));
}

// x is spaced by index rather than by elapsed time: the pinned TrendChartProps contract carries no
// numeric date per point, so a time-proportional axis is not expressible through it. Both hosts omit
// empty buckets rather than plotting a zero, so nothing false is drawn either way — but an untrained
// week is not visually distinguishable from a shorter gap, and the axis dates remain the truthful
// signal. Adding a numeric date to TrendPoint is what would let a later phase switch the scale.
export function buildChartGeometry({ values, width, height }: ChartGeometryInput): ChartGeometry {
  const baselineY = round(height - CHART_EDGE_PAD);

  if (values.length === 0) {
    return { line: '', area: '', markers: [], baselineY };
  }

  // SVG's y axis grows downward, so the value domain maps onto an INVERTED output range: a larger
  // value must produce a smaller coordinate. Flipping this renders a mirrored chart that still
  // looks plausible.
  const scaleY = linearScale(paddedDomain(values), [height - CHART_EDGE_PAD, CHART_EDGE_PAD]);
  const usableWidth = width - CHART_EDGE_PAD * 2;
  const step = values.length > 1 ? usableWidth / (values.length - 1) : 0;

  const markers: ChartMarker[] = values.map((value, index) => ({
    x: round(values.length === 1 ? width / 2 : CHART_EDGE_PAD + index * step),
    y: round(scaleY(value)),
  }));

  // A one-point polyline is invisible, and a line drawn to an implied origin asserts a workout that
  // never happened — one marker, no paths.
  if (markers.length === 1) {
    return { line: '', area: '', markers, baselineY };
  }

  // Straight segments only: a spline would invent values between real sessions.
  const line = markers.map((marker, index) => `${index === 0 ? 'M' : 'L'}${marker.x},${marker.y}`).join(' ');
  const first = markers[0];
  const last = markers[markers.length - 1];
  const area = `${line} L${last.x},${baselineY} L${first.x},${baselineY} Z`;

  return { line, area, markers, baselineY };
}
