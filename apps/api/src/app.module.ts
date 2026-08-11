import { Module } from '@nestjs/common';
import { DrizzleModule } from './db/drizzle.module';
import { AuthModule } from './auth/auth.module';

// No controller for per-user mutable domain data lives here or is added later in this phase:
// ARCHITECTURE.md §3 Anti-Pattern 1 reserves that ingress for Phase 2's SyncModule.
@Module({
  imports: [DrizzleModule, AuthModule],
})
export class AppModule {}
