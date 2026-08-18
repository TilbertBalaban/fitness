import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

// As narrow as HealthModule — this codebase's convention for a small, single-purpose module. No
// `exports`: nothing else in this app needs CatalogService today, and keeping it self-contained
// is what health.module.ts / mailer.module.ts's own minimalism establishes as the house pattern.
@Module({
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
