import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DrizzleModule } from './db/drizzle.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { MailerModule } from './mailer/mailer.module';
import { SyncModule } from './sync/sync.module';
import { CatalogModule } from './catalog/catalog.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { MinClientVersionGuard } from './common/min-client-version.guard';

// SyncModule is the sole ingress for per-user mutable domain data (D-01, ARCHITECTURE.md §3
// Anti-Pattern 1) — the seam this comment used to reserve, now filled. CatalogModule is D-01's
// own explicit carve-out: a read-only, unauthenticated first-install/refresh catalog download,
// never a second write path for `exercise` — it has no mutation verb on it at all. AnalyticsModule
// has no REST surface at all (D-09) — it exists so SyncService can inject
// AnalyticsReconciliationService through the module graph.
@Module({
  imports: [DrizzleModule, AuthModule, HealthModule, MailerModule, SyncModule, CatalogModule, AnalyticsModule],
  providers: [{ provide: APP_GUARD, useClass: MinClientVersionGuard }],
})
export class AppModule {}
