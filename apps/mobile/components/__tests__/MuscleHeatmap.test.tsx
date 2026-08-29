import type { ReactElement, ReactNode } from 'react';
import { Text } from 'react-native';
import type { MuscleGroupId } from '@fitness/api-contracts';
import {
  fillForMusclePoint,
  MIN_FIGURE_WIDTH,
  MuscleHeatmap,
  muscleMapFigureSummary,
  resolveMuscleMapFigureWidth,
  TRAINED_FILL_OPACITY_FLOOR,
  UNTRAINED_FILL_OPACITY,
  type MuscleHeatmapPoint,
  type MuscleHeatmapProps,
} from '../MuscleHeatmap';

type AnyElement = ReactElement<Record<string, unknown>>;

function findAll(node: ReactNode, matches: (element: AnyElement) => boolean, found: AnyElement[] = []): AnyElement[] {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return found;
  }
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, matches, found);
    return found;
  }
  const element = node as AnyElement;
  if (matches(element)) found.push(element);
  const children = element.props?.children as ReactNode;
  if (children !== undefined) findAll(children, matches, found);
  return found;
}

// Shapes are matched by their SVG geometry props rather than importing react-native-svg here:
// MuscleHeatmap.tsx and TrendChart.tsx must remain the app's only importers of that library.
const isShape = (element: AnyElement) => element.props?.x !== undefined && element.props?.width !== undefined;
const isSvgRoot = (element: AnyElement) => element.props?.accessibilityRole === 'image';

const COLORS = { accent: 'rgb(37, 99, 235)', foregroundMuted: 'rgb(113, 113, 122)', surface: 'rgb(244, 244, 245)' };

function point(overrides: Partial<MuscleHeatmapPoint> = {}): MuscleHeatmapPoint {
  return {
    muscleGroupId: 'chest' as MuscleGroupId,
    side: 'front',
    trainingVolumeKg: null,
    weightedSets: null,
    setCount: 0,
    relativeIntensity: null,
    muscleName: 'Chest',
    volumeLabel: null,
    ...overrides,
  };
}

function baseProps(overrides: Partial<MuscleHeatmapProps> = {}): MuscleHeatmapProps {
  return {
    points: [],
    colors: COLORS,
    frontWidth: 150,
    backWidth: 150,
    windowLabel: 'the last 7 days',
    ...overrides,
  };
}

describe('resolveMuscleMapFigureWidth', () => {
  it('returns half of the window width less the screen padding and figure gap', () => {
    expect(resolveMuscleMapFigureWidth(1200)).toBe((1200 - 64) / 2);
  });

  it('floors at MIN_FIGURE_WIDTH rather than a squeezed width', () => {
    expect(resolveMuscleMapFigureWidth(200)).toBe(MIN_FIGURE_WIDTH);
  });

  it('floors at MIN_FIGURE_WIDTH for a non-finite input rather than producing a non-finite width', () => {
    expect(resolveMuscleMapFigureWidth(Number.NaN)).toBe(MIN_FIGURE_WIDTH);
  });
});

describe('fillForMusclePoint', () => {
  it('returns the muted foreground colour at the untrained opacity for an untrained point', () => {
    expect(fillForMusclePoint(point(), COLORS)).toEqual({ color: COLORS.foregroundMuted, opacity: UNTRAINED_FILL_OPACITY });
  });

  it('returns the accent colour at an opacity no lower than the trained floor for a trained point', () => {
    const result = fillForMusclePoint(point({ trainingVolumeKg: 50, setCount: 3, relativeIntensity: 0.5 }), COLORS);
    expect(result.color).toBe(COLORS.accent);
    expect(result.opacity).toBeGreaterThanOrEqual(TRAINED_FILL_OPACITY_FLOOR);
  });

  it('returns exactly the trained floor opacity at relative intensity zero', () => {
    const result = fillForMusclePoint(point({ trainingVolumeKg: 10, setCount: 1, relativeIntensity: 0 }), COLORS);
    expect(result.opacity).toBe(TRAINED_FILL_OPACITY_FLOOR);
  });

  it('returns full opacity at relative intensity one', () => {
    const result = fillForMusclePoint(point({ trainingVolumeKg: 100, setCount: 5, relativeIntensity: 1 }), COLORS);
    expect(result.opacity).toBe(1);
  });

  it('never uses the same colour for the untrained and trained branches', () => {
    const untrained = fillForMusclePoint(point(), COLORS);
    const trained = fillForMusclePoint(point({ trainingVolumeKg: 10, setCount: 1, relativeIntensity: 0 }), COLORS);
    expect(untrained.color).not.toBe(trained.color);
  });
});

describe('muscleMapFigureSummary', () => {
  it('names the side, window, trained count and highest-volume muscle when at least one is trained', () => {
    const points: MuscleHeatmapPoint[] = [
      point({ muscleGroupId: 'chest' as MuscleGroupId, side: 'front', trainingVolumeKg: 100, setCount: 5, relativeIntensity: 1, muscleName: 'Chest', volumeLabel: '100.00 kg' }),
      point({ muscleGroupId: 'biceps' as MuscleGroupId, side: 'front', muscleName: 'Biceps' }),
    ];
    const summary = muscleMapFigureSummary({ side: 'front', windowLabel: 'the last 7 days', points });
    expect(summary).toContain('Front view, the last 7 days.');
    expect(summary).toContain('Chest');
    expect(summary).toContain('100.00 kg');
  });

  it('uses the no-muscles-trained sentence when nothing on that side is trained', () => {
    const points: MuscleHeatmapPoint[] = [point({ muscleGroupId: 'chest' as MuscleGroupId, side: 'front' })];
    const summary = muscleMapFigureSummary({ side: 'front', windowLabel: 'the last 7 days', points });
    expect(summary).toBe('Front view, the last 7 days. No muscles trained on this view.');
    expect(summary).not.toMatch(/\b0\b/);
  });

  it('breaks a tie by MUSCLE_MAP_ROW_ORDER position identically on repeated calls', () => {
    const points: MuscleHeatmapPoint[] = [
      point({ muscleGroupId: 'front_delts' as MuscleGroupId, side: 'front', trainingVolumeKg: 50, setCount: 3, relativeIntensity: 1, muscleName: 'Front Delts', volumeLabel: '50.00 kg' }),
      point({ muscleGroupId: 'chest' as MuscleGroupId, side: 'front', trainingVolumeKg: 50, setCount: 3, relativeIntensity: 1, muscleName: 'Chest', volumeLabel: '50.00 kg' }),
    ];
    const first = muscleMapFigureSummary({ side: 'front', windowLabel: 'the last 7 days', points });
    const second = muscleMapFigureSummary({ side: 'front', windowLabel: 'the last 7 days', points });
    expect(first).toBe(second);
    expect(first).toContain('Front Delts');
  });
});

describe('MuscleHeatmap', () => {
  it('renders both figures with every zone at the untrained fill when given an empty points array', () => {
    const result = MuscleHeatmap(baseProps({ points: [] }));
    const svgRoots = findAll(result, isSvgRoot);
    const shapes = findAll(result, isShape);

    expect(svgRoots).toHaveLength(2);
    expect(shapes).toHaveLength(19);
    for (const shape of shapes) {
      expect(shape.props.fill).toBe(COLORS.foregroundMuted);
      expect(shape.props.fillOpacity).toBe(UNTRAINED_FILL_OPACITY);
    }
  });

  it('hides every shape from assistive technology', () => {
    const result = MuscleHeatmap(baseProps());
    const shapes = findAll(result, isShape);

    expect(shapes.length).toBeGreaterThan(0);
    for (const shape of shapes) {
      expect(shape.props.importantForAccessibility).toBe('no-hide-descendants');
      expect(shape.props.accessibilityElementsHidden).toBe(true);
    }
  });

  it('carries accessible and an image accessibility role on each Svg root, with the composed summary as its label', () => {
    const result = MuscleHeatmap(baseProps());
    const svgRoots = findAll(result, isSvgRoot);

    expect(svgRoots).toHaveLength(2);
    for (const root of svgRoots) {
      expect(root.props.accessible).toBe(true);
      expect(root.props.accessibilityRole).toBe('image');
      expect(typeof root.props.accessibilityLabel).toBe('string');
      expect((root.props.accessibilityLabel as string).length).toBeGreaterThan(0);
    }
  });

  it('renders no SvgText-family element anywhere in its tree', () => {
    const result = MuscleHeatmap(baseProps());
    const svgTextLike = findAll(result, (element) => {
      const type = element.type as unknown;
      const name = typeof type === 'function' ? type.name : typeof type === 'string' ? type : '';
      return /svgtext|tspan|textpath/i.test(name);
    });

    expect(svgTextLike).toHaveLength(0);
  });

  it('renders the Front and Back captions as ordinary React Native text nodes, not inside the canvas', () => {
    const result = MuscleHeatmap(baseProps());
    const texts = findAll(result, (element) => element.type === Text).map((element) => element.props.children);

    expect(texts).toContain('Front');
    expect(texts).toContain('Back');
  });
});
