import { Body, Controller, Get, Post, ServiceUnavailableException } from '@nestjs/common';
import { Session, UserSession } from '@thallesp/nestjs-better-auth';
import { SYNC_MAX_BATCH_OPS, type SyncPushRequest, type SyncPushResponse } from '@fitness/api-contracts';
import { mintSyncToken } from './powersync-token';
import { SyncService } from './sync.service';

export interface SyncTokenResponse {
  token: string;
  endpoint: string;
}

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

  // The user id comes from the authenticated session only (T-02-07) — never a parameter, header
  // or body field, which is the entire attack this route exists to close off.
  @Get('token')
  async token(@Session() session: UserSession): Promise<SyncTokenResponse> {
    const endpoint = process.env.POWERSYNC_URL;
    if (!endpoint) {
      throw new ServiceUnavailableException('POWERSYNC_URL is not configured');
    }
    try {
      const { token } = mintSyncToken(session.user.id);
      return { token, endpoint };
    } catch {
      throw new ServiceUnavailableException('Sync token service is not configured');
    }
  }
}
