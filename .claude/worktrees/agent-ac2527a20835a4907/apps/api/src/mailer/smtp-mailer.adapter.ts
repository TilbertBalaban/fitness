import { Injectable } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type { MailerPort, MailMessage } from './mailer.port';

@Injectable()
export class SmtpMailerAdapter implements MailerPort {
  private readonly transport: Transporter;

  constructor() {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;

    this.transport = createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 1025),
      // The local catcher listens unauthenticated on 127.0.0.1:1025 — passing an empty credential
      // object there breaks the connection, so auth is only attached when SMTP_USER is actually set.
      ...(user ? { auth: { user, pass } } : {}),
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({
      from: process.env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
