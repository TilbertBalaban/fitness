import { Body, Controller, Post } from '@nestjs/common';
import { Session, UserSession } from '@thallesp/nestjs-better-auth';
import { SYNC_MAX_BATCH_OPS, type SyncPushRequest, type SyncPushResponse } from '@fitness/api-contracts';
import { SyncService } from './sync.service';

// Deliberately no @AllowAnonymous() and no explicit `version` — this participates in the app's
// normal /v1/... versioning and MinClientVersionGuard, unlike HealthController (D-01: the sole
// mutating ingress for synced rows, and every op must come from an authenticated session).
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('push')
  async push(@Body() body: SyncPushRequest, @Session() session: UserSession): Promise<SyncPushResponse> {
    // The only validation this controller does itself — an oversized batch rejects the whole
    // request so a client can never half-apply one (SyncService assumes an already-bounded batch).
    if (body.batch.length > SYNC_MAX_BATCH_OPS) {
      return {
        applied: [],
        rejected: body.batch.map((op) => ({ op_id: op.op_id, reason: 'batch_too_large' as const })),
        server_seq: '0',
      };
    }
    return this.syncService.applyBatch(session.user.id, body.batch);
  }
}
