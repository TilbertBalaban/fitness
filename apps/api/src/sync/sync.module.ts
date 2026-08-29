import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [AnalyticsModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
