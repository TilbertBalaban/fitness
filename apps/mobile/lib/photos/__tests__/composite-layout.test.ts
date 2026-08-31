import { COMPOSITE_CAPTION_BAND_HEIGHT, COMPOSITE_CELL_WIDTH, MAX_COMPOSITE_PHOTOS, resolveCompositeCanvas } from '../composite-layout';

describe('resolveCompositeCanvas', () => {
  it('MAX_COMPOSITE_PHOTOS is exactly two — there is no variable-count composite', () => {
    expect(MAX_COMPOSITE_PHOTOS).toBe(2);
  });

  it('two equal-sized (square) inputs produce two equal-height rectangles at the shared cell width', () => {
    const layout = resolveCompositeCanvas({ width: 1000, height: 1000 }, { width: 1000, height: 1000 });

    expect(layout.before.width).toBe(COMPOSITE_CELL_WIDTH);
    expect(layout.after.width).toBe(COMPOSITE_CELL_WIDTH);
    expect(layout.before.height).toBe(COMPOSITE_CELL_WIDTH);
    expect(layout.after.height).toBe(layout.before.height);
    expect(layout.before.y).toBe(0);
    expect(layout.after.y).toBe(0);
  });

  it('a portrait paired with a landscape scales each to the cell width but keeps its own aspect ratio', () => {
    const landscape = { width: 1600, height: 900 };
    const portrait = { width: 900, height: 1600 };
    const layout = resolveCompositeCanvas(landscape, portrait);

    expect(layout.before.height).toBe(Math.round(COMPOSITE_CELL_WIDTH * (900 / 1600)));
    expect(layout.after.height).toBe(Math.round(COMPOSITE_CELL_WIDTH * (1600 / 900)));
    expect(layout.before.height).not.toBe(layout.after.height);

    // The taller photo (the portrait, in the "after" slot) sets the shared photo-area height; the
    // shorter one is centered within it rather than stretched to match.
    const photoAreaHeight = Math.max(layout.before.height, layout.after.height);
    expect(layout.after.y).toBe(0);
    expect(layout.before.y).toBe(Math.round((photoAreaHeight - layout.before.height) / 2));
  });

  it('the caption band contributes exactly COMPOSITE_CAPTION_BAND_HEIGHT to the output height', () => {
    const layout = resolveCompositeCanvas({ width: 1000, height: 1000 }, { width: 1000, height: 1000 });
    const photoAreaHeight = Math.max(layout.before.height, layout.after.height);

    expect(layout.height).toBe(photoAreaHeight + COMPOSITE_CAPTION_BAND_HEIGHT);
    expect(layout.captionBandHeight).toBe(COMPOSITE_CAPTION_BAND_HEIGHT);
  });

  it('never reorders — before is always the left rectangle, after always the right', () => {
    const layout = resolveCompositeCanvas({ width: 1000, height: 1000 }, { width: 500, height: 500 });

    expect(layout.before.x).toBe(0);
    expect(layout.after.x).toBeGreaterThan(layout.before.x);
    expect(layout.width).toBeGreaterThanOrEqual(layout.before.x + layout.before.width);
    expect(layout.width).toBeGreaterThanOrEqual(layout.after.x + layout.after.width);
  });
});
