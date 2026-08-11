import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DrizzleModule } from './db/drizzle.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { MailerModule } from './mailer/mailer.module';
import { MinClientVersionGuard } from './common/min-client-version.guard';

// No controller for per-user mutable domain data lives here or is added later in this phase:
// ARCHITECTURE.md §3 Anti-Pattern 1 reserves that ingress for Phase 2's SyncModule.
@Module({
  imports: [DrizzleModule, AuthModule, HealthModule, MailerModule],
  providers: [{ provide: APP_GUARD, useClass: MinClientVersionGuard }],
})
export class AppModule {}
