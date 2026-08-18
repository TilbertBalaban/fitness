#!/usr/bin/env node
// Generates apps/mobile/lib/catalog/catalog-image-map.generated.ts from
// apps/mobile/assets/catalog/image-manifest.json (870 exercises, 1740 vendored images —
// see 03-05-SUMMARY.md and WINDOWS #36).
//
// Metro (React Native's bundler) only resolves require() when its argument is a static string
// literal it can see at parse time -- a runtime-computed path (`require(someVariable)`) is not
// supported. That rules out looping over the manifest at runtime and calling require() with a
// computed string. Instead, this script emits one literal `require("...")` call per vendored
// image file, so Metro sees 1740 ordinary static requires; the map from exercise id to those
// requires is built at module-load time, not at Metro's bundling time.
//
// Regenerate with: node scripts/generate-catalog-image-map.cjs
// Do not hand-edit the generated output -- re-run this script instead.

const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

const REPO_ROOT = resolve(__dirname, '..');
const MANIFEST_PATH = resolve(REPO_ROOT, 'apps/mobile/assets/catalog/image-manifest.json');
const OUTPUT_PATH = resolve(REPO_ROOT, 'apps/mobile/lib/catalog/catalog-image-map.generated.ts');

// Manifest paths are relative to apps/mobile/assets/catalog/ (e.g. "images/seed_Foo/0.jpg").
// This generated file lives at apps/mobile/lib/catalog/, two directories below apps/mobile/ --
// hence the ../../assets/catalog/ prefix on every require() call below.
const RELATIVE_ASSET_PREFIX = '../../assets/catalog';

function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
  const exerciseIds = Object.keys(manifest).sort();

  let totalImages = 0;
  const entries = exerciseIds.map((id) => {
    const paths = manifest[id];
    const requireCalls = paths.map((path) => {
      totalImages += 1;
      return `require(${JSON.stringify(`${RELATIVE_ASSET_PREFIX}/${path}`)})`;
    });
    return `  ${JSON.stringify(id)}: [${requireCalls.join(', ')}],`;
  });

  const output = `// GENERATED FILE -- do not hand-edit.
// Regenerate with: node scripts/generate-catalog-image-map.cjs
// Source: apps/mobile/assets/catalog/image-manifest.json (${exerciseIds.length} exercises, ${totalImages} images)
//
// Each require() call below resolves to a Metro asset module id (a number) at bundle time --
// this is the static-require-map WINDOWS #36 calls for, closing the gap 03-05 left open: the
// vendored images were on disk but never reachable from any require() call, so Metro never
// included them in the bundle and no component could render them.

const catalogImageMap: Record<string, number[]> = {
${entries.join('\n')}
};

// Returns the first vendored local image for an exercise id, or null if none is vendored --
// the offline render path (ExerciseImageTile's localSource prop) branches on this, never on
// the exercise's own (still-remote) image_urls field, so a stale or missing manifest entry
// falls back to the placeholder tile instead of a live network fetch.
export function getLocalCatalogImage(exerciseId: string): number | null {
  const images = catalogImageMap[exerciseId];
  return images && images.length > 0 ? images[0] : null;
}
`;

  writeFileSync(OUTPUT_PATH, output, 'utf-8');
  console.log(`Wrote ${OUTPUT_PATH}: ${exerciseIds.length} exercises, ${totalImages} images`);
}

main();
