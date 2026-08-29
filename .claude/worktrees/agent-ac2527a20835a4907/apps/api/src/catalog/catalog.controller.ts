import { Controller, Get, Headers, Res } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { CatalogSnapshot } from '@fitness/api-contracts';
import { CatalogService, type CatalogVersionResponse } from './catalog.service';

// A minimal local shape for the one Express response object this handler needs, matching
// min-client-version.guard.ts's own precedent (RequestWithHeaders/HeaderBag) — no top-level
// `express` package is resolvable from apps/api under this pnpm workspace's strict linking, even
// though @nestjs/platform-express carries it as a runtime dependency.
interface ExpressLikeResponse {
  status(code: number): this;
  set(headers: Record<string, string>): this;
  json(body: unknown): void;
  end(): void;
}

// A normal versioned path (not VERSION_NEUTRAL like HealthController) — the catalog does want
// /v1/... versioning and MinClientVersionGuard coverage, unlike a plain liveness probe.
// @AllowAnonymous() because the payload is public seeded content with no user data in it: a
// cold-started client (never signed in, or signed out) must still be able to refresh its catalog,
// and requiring a session here would break exactly that pre-sign-in path (T-03-05, accepted).
// Two @Get() handlers only — no mutation verb exists on this controller, which is the property
// that keeps ARCHITECTURE.md's Anti-Pattern 1 ("two write paths for the same data") intact for
// `exercise`: SyncModule remains the sole ingress for mutable domain data.
@Controller('catalog')
@AllowAnonymous()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('version')
  version(): CatalogVersionResponse {
    return this.catalogService.getVersion();
  }

  // Express lower-cases inbound header names before the @Headers() decorator ever sees them, so
  // reading 'if-none-match' is equivalent to reading the wire header `If-None-Match` — no separate
  // case-insensitive comparison is needed here.
  @Get('download')
  download(@Headers('if-none-match') ifNoneMatch: string | undefined, @Res() res: ExpressLikeResponse): void {
    const etag = this.catalogService.getEtag();

    // T-03-04's mitigation: a conditional GET carrying the current ETag as If-None-Match returns
    // 304 with no body, so an already-current client transfers nothing. Compared against the
    // literal ETag string (both sides quoted), not parsed as an HTTP list — this route only ever
    // has one representation, so list/weak-comparison semantics don't apply.
    if (ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }

    res.status(200).set({ ETag: etag, 'Cache-Control': 'public, max-age=0, must-revalidate' }).json(
      this.catalogService.getSnapshot() satisfies CatalogSnapshot,
    );
  }
}
