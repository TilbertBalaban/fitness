#!/usr/bin/env node
// Downloads every image_urls entry from the committed catalog artifact
// (apps/api/src/seed/data/catalog-normalized.json) into
// apps/mobile/assets/catalog/images/<exercise-id>/<n>.jpg, and writes a companion manifest
// (apps/mobile/assets/catalog/image-manifest.json) mapping exercise id -> local relative paths.
//
// Per the fedb-with-images decision (docs/catalog-dataset-license.md), images must be available
// offline -- vendored, not runtime-fetched. This script performs the vendoring: after it runs, the
// image binaries are committed, local files, not live raw.githubusercontent.com fetches. It does
// NOT wire those files into the app's rendered bundle (that needs a Metro static-require map plus
// changes to ExerciseImageTile.tsx and the exercises screens, out of scope for the plan that added
// this script -- see the phase SUMMARY for the exact, honestly-recorded gap).
//
// Idempotent-ish: re-running overwrites existing files with a fresh download rather than skipping
// them, so a corrected upstream image (or a re-normalized catalog with different urls) is picked up
// on the next run. Run via `node scripts/vendor-catalog-images.cjs` from the repo root.

const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve, dirname } = require('node:path');

const REPO_ROOT = resolve(__dirname, '..');
const ARTIFACT_PATH = resolve(REPO_ROOT, 'apps/api/src/seed/data/catalog-normalized.json');
const IMAGES_DIR = resolve(REPO_ROOT, 'apps/mobile/assets/catalog/images');
const MANIFEST_PATH = resolve(REPO_ROOT, 'apps/mobile/assets/catalog/image-manifest.json');

const CONCURRENCY = 24;
const MAX_ATTEMPTS = 4;

async function downloadOne(url, destPath) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      mkdirSync(dirname(destPath), { recursive: true });
      writeFileSync(destPath, buf);
      return { ok: true };
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) return { ok: false, error: String(err) };
      await new Promise((r) => setTimeout(r, 300 * attempt));
    }
  }
}

async function main() {
  const { exercises } = require(ARTIFACT_PATH);

  const jobs = [];
  for (const exercise of exercises) {
    (exercise.image_urls || []).forEach((url, index) => {
      jobs.push({ id: exercise.id, index, url, destPath: resolve(IMAGES_DIR, exercise.id, `${index}.jpg`) });
    });
  }

  console.log(`Total images to download: ${jobs.length}`);

  let completed = 0;
  let failedCount = 0;
  const failures = [];
  const manifest = {};

  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      const result = await downloadOne(job.url, job.destPath);
      completed += 1;
      if (result.ok) {
        if (!manifest[job.id]) manifest[job.id] = [];
        manifest[job.id][job.index] = `images/${job.id}/${job.index}.jpg`;
      } else {
        failedCount += 1;
        failures.push({ id: job.id, index: job.index, url: job.url, error: result.error });
      }
      if (completed % 200 === 0) {
        console.log(`  ...${completed}/${jobs.length} (${failedCount} failed so far)`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

  if (failures.length > 0) {
    console.error(`${failures.length} image(s) failed to download after ${MAX_ATTEMPTS} attempts each:`);
    for (const f of failures) console.error(`  ${f.id}[${f.index}]: ${f.url} -- ${f.error}`);
    process.exitCode = 1;
  }

  console.log(
    `Done. completed=${completed} failed=${failedCount} manifestEntries=${Object.keys(manifest).length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
