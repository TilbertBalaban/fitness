import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DrizzleModule } from './db/drizzle.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { MailerModule } from './mailer/mailer.module';
import { SyncModule } from './sync/sync.module';
import { MinClientVersionGuard } from './common/min-client-version.guard';

// SyncModule is the sole ingress for per-user mutable domain data (D-01, ARCHITECTURE.md §3
// Anti-Pattern 1) — the seam this comment used to reserve, now filled.
@Module({
  imports: [DrizzleModule, AuthModule, HealthModule, MailerModule, SyncModule],
  providers: [{ provide: APP_GUARD, useClass: MinClientVersionGuard }],
})
export class AppModule {}
