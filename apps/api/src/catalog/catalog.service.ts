import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import type { CatalogSnapshot } from '@fitness/api-contracts';

export interface CatalogVersionResponse {
  catalog_version: string;
}

// Loads the committed artifact ONCE at construction and holds it in memory — the artifact is a
// build-time constant (identical to the file the mobile app bundles), so re-reading it per request
// buys nothing and reading it from Postgres would make an unauthenticated route issue database
// queries (T-03-04). Follows sync.service.ts's plain @Injectable() shape; unlike it, this service
// injects nothing.
@Injectable()
export class CatalogService {
  private readonly snapshot: CatalogSnapshot;
  private readonly etag: string;

  constructor() {
    // Resolved from process.cwd(), not __dirname: `nest build` compiles TS to dist/ but does not
    // copy non-TS assets, so an __dirname-relative path would 404 once this runs from
    // dist/catalog/catalog.service.js. drizzle.module.ts's own dotenv bootstrap already establishes
    // process.cwd()-relative resolution as this codebase's convention for exactly this reason —
    // every entrypoint (nest start, node dist/main, jest-e2e's spawned dist/main.js) runs with cwd
    // set to apps/api, where the TypeScript source (and this JSON artifact) actually lives.
    const artifactPath = resolve(process.cwd(), 'src/seed/data/catalog-normalized.json');
    this.snapshot = JSON.parse(readFileSync(artifactPath, 'utf-8')) as CatalogSnapshot;
    // A quoted strong ETag derived straight from catalog_version — the version is already a
    // content-addressed hash (03-04's SHA-256-derived catalog_version), so a second digest here
    // would be redundant work for the same guarantee.
    this.etag = `"${this.snapshot.catalog_version}"`;
  }

  getVersion(): CatalogVersionResponse {
    return { catalog_version: this.snapshot.catalog_version };
  }

  getSnapshot(): CatalogSnapshot {
    return this.snapshot;
  }

  getEtag(): string {
    return this.etag;
  }
}
