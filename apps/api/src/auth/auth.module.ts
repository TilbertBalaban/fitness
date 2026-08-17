import { Module } from '@nestjs/common';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import { auth } from './auth';

@Module({
  // This module's json parser (not Nest's own — disabled in main.ts for Better Auth's raw-body
  // need) is the one that runs in front of every non-auth route, including /v1/sync/push.
  // Express's body-parser default (100kb) silently 413s before a batch ever reaches
  // SyncController's own SYNC_MAX_BATCH_OPS check — raised so a batch at that ceiling with
  // realistic per-op payloads reaches the app-level check instead of an uncontrolled transport
  // rejection.
  imports: [BetterAuthModule.forRoot({ auth, bodyParser: { json: { limit: '2mb' } } })],
  exports: [BetterAuthModule],
})
export class AuthModule {}
