import type { ReactNode } from 'react';
import {
  muscleVolumeRowLabel,
  MuscleVolumeRowView,
  type MuscleVolumeRowPoint,
  type MuscleVolumeRowViewProps,
} from '../MuscleVolumeRow';

const COLORS = { foregroundMuted: 'rgb(113, 113, 122)' };

function findText(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) findText(child, out);
    return out;
  }
  const element = node as { props?: { children?: unknown } };
  if (element.props?.children !== undefined) findText(element.props.children, out);
  return out;
}

function collect(node: ReactNode, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return out;
  }
  const element = node as { props?: Record<string, unknown> };
  if (element.props) out.push(element.props);
  const children = element.props?.children as ReactNode;
  if (children !== undefined) collect(children, out);
  return out;
}

function trainedPoint(overrides: Partial<MuscleVolumeRowPoint> = {}): MuscleVolumeRowPoint {
  return { trainingVolumeKg: 100, setCount: 5, relativeIntensity: 0.8, ...overrides };
}

function untrainedPoint(): MuscleVolumeRowPoint {
  return { trainingVolumeKg: null, setCount: 0, relativeIntensity: null };
}

function renderRow(overrides: Partial<MuscleVolumeRowViewProps> = {}) {
  return MuscleVolumeRowView({
    point: trainedPoint(),
    muscleName: 'Front Delts',
    valueLabel: '100.00 kg',
    colors: COLORS,
    onPress: jest.fn(),
    ...overrides,
  });
}

describe('muscleVolumeRowLabel', () => {
  it('announces the muscle name, the volume as Training Volume, and its rounded percentage of the hardest-trained muscle', () => {
    const label = muscleVolumeRowLabel(trainedPoint({ relativeIntensity: 0.753 }), 'Front Delts', '100.00 kg');
    expect(label).toBe('Front Delts, 100.00 kg Training Volume, 75% of your hardest-trained muscle');
  });

  it('announces the muscle name and untrained — never a zero, never a blank, never a percentage', () => {
    const label = muscleVolumeRowLabel(untrainedPoint(), 'Calves', null);
    expect(label).toBe('Calves, untrained');
    expect(label).not.toMatch(/%/);
    expect(label).not.toMatch(/\b0\b/);
  });

  it('announces itself as trained rather than untrained when the set count is above zero and the volume is zero, using the singular noun for one set', () => {
    const label = muscleVolumeRowLabel(trainedPoint({ trainingVolumeKg: 0, setCount: 1 }), 'Abs', null);
    expect(label).toBe('Abs, 1 set');
    expect(label).not.toContain('untrained');
  });

  it('uses the plural noun for more than one set at zero volume', () => {
    const label = muscleVolumeRowLabel(trainedPoint({ trainingVolumeKg: 0, setCount: 3 }), 'Abs', null);
    expect(label).toBe('Abs, 3 sets');
  });
});

describe('MuscleVolumeRowView', () => {
  it('renders the muscle name and the formatted volume label for a trained row', () => {
    const text = findText(renderRow()).join(' ');
    expect(text).toContain('Front Delts');
    expect(text).toContain('100.00 kg');
  });

  it('renders the word Untrained for an untrained row, never a zero and never a blank', () => {
    const text = findText(renderRow({ point: untrainedPoint(), valueLabel: null })).join(' ');
    expect(text).toContain('Untrained');
    expect(text).not.toContain('0 kg');
  });

  it('renders the set count instead of a volume for a trained-but-zero-volume row', () => {
    const text = findText(renderRow({ point: trainedPoint({ trainingVolumeKg: 0, setCount: 4 }), valueLabel: null })).join(' ');
    expect(text).toContain('4 sets');
    expect(text).not.toContain('0 kg');
  });

  it('exposes exactly one press target for the whole row', () => {
    const pressables = collect(renderRow()).filter((props) => typeof props.onPress === 'function');
    expect(pressables).toHaveLength(1);
    expect(pressables[0].accessibilityRole).toBe('button');
  });

  it('holds the 48-unit minimum height on its press target', () => {
    const [pressable] = collect(renderRow()).filter((props) => typeof props.onPress === 'function');
    expect(pressable.style).toMatchObject({ minHeight: 48 });
  });

  it('is pressable exactly like a trained row when untrained — no disabled state', () => {
    const pressables = collect(renderRow({ point: untrainedPoint(), valueLabel: null })).filter(
      (props) => typeof props.onPress === 'function',
    );
    expect(pressables).toHaveLength(1);
    expect(pressables[0].disabled).toBeUndefined();
  });

  it('sets no line clamp on either line, even for a long muscle name', () => {
    const clamped = collect(renderRow({ muscleName: 'A'.repeat(120) })).filter((props) => props.numberOfLines !== undefined);
    expect(clamped).toHaveLength(0);
  });

  it('calls onPress when the row is pressed with no argument-shuffling of its own', () => {
    const onPress = jest.fn();
    const [pressable] = collect(renderRow({ onPress })).filter((props) => typeof props.onPress === 'function');
    (pressable.onPress as () => void)();
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith();
  });
});
