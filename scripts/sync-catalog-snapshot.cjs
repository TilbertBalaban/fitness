#!/usr/bin/env node
// Copies the committed, normalized catalog artifact (apps/api/src/seed/data/catalog-normalized.json)
// byte-for-byte into the bundled mobile snapshot (apps/mobile/assets/catalog/catalog-snapshot.json).
// A plain fs.copyFileSync — never JSON.parse + re-stringify, which could reformat the bytes even if
// the parsed content stayed identical. The device and the server must ship the exact same
// catalog_version; two derivations of the same artifact (even a re-serialization) is exactly how
// they drift. Run via `pnpm --filter api sync:catalog-snapshot` whenever normalize-catalog.ts
// regenerates the source artifact, so forgetting this step is a one-command fix, not a manual one.

const { copyFileSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const repoRoot = resolve(__dirname, '..');
const source = resolve(repoRoot, 'apps/api/src/seed/data/catalog-normalized.json');
const destination = resolve(repoRoot, 'apps/mobile/assets/catalog/catalog-snapshot.json');

copyFileSync(source, destination);

const { catalog_version: catalogVersion, exercises } = JSON.parse(readFileSync(destination, 'utf-8'));
console.log(`Copied catalog-normalized.json -> catalog-snapshot.json (catalog_version=${catalogVersion}, ${exercises.length} exercises).`);
