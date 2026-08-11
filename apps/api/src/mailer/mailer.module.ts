import { Module } from '@nestjs/common';
import type { MailerPort } from './mailer.port';
import { MAILER_PORT } from './mailer.port';
import { SmtpMailerAdapter } from './smtp-mailer.adapter';

// MAIL_TRANSPORT is the single switch a deployment flips to change outbound-mail provider. Only
// 'smtp' exists today — it already covers both the local catcher and a real SMTP-speaking provider
// via the same env vars — but resolving the adapter here, not at each call site, is what keeps a
// future non-SMTP adapter a one-line addition to this factory.
function resolveMailerPort(): MailerPort {
  const transport = process.env.MAIL_TRANSPORT ?? 'smtp';
  switch (transport) {
    case 'smtp':
      return new SmtpMailerAdapter();
    default:
      throw new Error(`Unknown MAIL_TRANSPORT: ${transport}`);
  }
}

// Better Auth's `betterAuth({...})` instance in auth.ts is constructed at module-import time,
// outside Nest's DI graph — the same reason apps/api/src/db/drizzle.module.ts exports a plain `db`
// value alongside its DI token. sendResetPassword needs a MailerPort before Nest ever boots.
export const mailerPort: MailerPort = resolveMailerPort();

@Module({
  providers: [{ provide: MAILER_PORT, useValue: mailerPort }],
  exports: [MAILER_PORT],
})
export class MailerModule {}
