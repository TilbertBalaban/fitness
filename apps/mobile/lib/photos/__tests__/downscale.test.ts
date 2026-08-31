import { resolveDownscaledDimensions } from '../constants';

describe('resolveDownscaledDimensions', () => {
  it('returns the original dimensions unchanged when the long edge is already at or under the bound', () => {
    expect(resolveDownscaledDimensions(1200, 800, 2048)).toEqual({ width: 1200, height: 800 });
    expect(resolveDownscaledDimensions(2048, 1024, 2048)).toEqual({ width: 2048, height: 1024 });
  });

  it('scales a landscape image so the width becomes exactly the bound', () => {
    const result = resolveDownscaledDimensions(4000, 3000, 2048);
    expect(result.width).toBe(2048);
    expect(result.height).toBeLessThan(2048);
  });

  it('scales a portrait image so the height becomes exactly the bound', () => {
    const result = resolveDownscaledDimensions(3000, 4000, 2048);
    expect(result.height).toBe(2048);
    expect(result.width).toBeLessThan(2048);
  });

  it('preserves the original aspect ratio to integer rounding', () => {
    // 4000x3000 is a 4:3 image — the short edge at a 2048 long edge is 2048 * 3/4 = 1536 exactly.
    expect(resolveDownscaledDimensions(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    // 3000x4000 (portrait 3:4) mirrors the same ratio on the other axis.
    expect(resolveDownscaledDimensions(3000, 4000, 2048)).toEqual({ width: 1536, height: 2048 });
    // A ratio that does not divide evenly still rounds to the nearest integer pixel.
    expect(resolveDownscaledDimensions(4032, 3024, 2048)).toEqual({ width: 2048, height: 1536 });
  });

  it('treats a square image as its own long edge on both axes', () => {
    expect(resolveDownscaledDimensions(3000, 3000, 2048)).toEqual({ width: 2048, height: 2048 });
  });
});
