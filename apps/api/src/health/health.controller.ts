import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

@Controller({ path: 'health', version: VERSION_NEUTRAL })
@AllowAnonymous()
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
