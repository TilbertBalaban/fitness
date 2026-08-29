import { Module } from '@nestjs/common';
import { AnalyticsReconciliationService } from './reconciliation.service';

// No controller: muscle_volume_rollup and analytics_watermark reach the client through the
// existing user_data PowerSync stream, never a REST endpoint (D-09). This module has no REST
// surface by design.
@Module({
  providers: [AnalyticsReconciliationService],
  exports: [AnalyticsReconciliationService],
})
export class AnalyticsModule {}
