import { appendFileSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
import type { MailerPort, MailMessage } from './mailer.port';

// Test-only. password-reset.e2e-spec.ts drives the built dist/main.js as a separate process over
// real HTTP (apps/api/test/auth.e2e-spec.ts's established pattern — better-auth is ESM-only and
// Jest's CommonJS runtime cannot load it in-process), so a Nest TestingModule provider override is
// not available to substitute a capturing double. This adapter is that double's process-spawn-safe
// equivalent: selected only when MAIL_TRANSPORT=capture, it appends each sent message as one JSON
// line to MAIL_CAPTURE_FILE, which the spec reads to recover the token a real person would receive.
@Injectable()
export class CaptureMailerAdapter implements MailerPort {
  async send(message: MailMessage): Promise<void> {
    const path = process.env.MAIL_CAPTURE_FILE;
    if (!path) {
      throw new Error('MAIL_CAPTURE_FILE must be set when MAIL_TRANSPORT=capture');
    }
    appendFileSync(path, `${JSON.stringify(message)}\n`);
  }
}
