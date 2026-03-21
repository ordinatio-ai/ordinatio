// ===========================================
// SMTP CLIENT — Nodemailer Wrapper
// ===========================================

import { emailError } from '../errors';
import type { ImapSmtpCredentials } from './types';

export interface SmtpSendOptions {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  inReplyTo?: string;
  references?: string;
  rawMime?: string;
}

/**
 * Test SMTP connectivity — attempt to verify the connection.
 */
export async function testSmtpConnection(credentials: ImapSmtpCredentials): Promise<{
  connected: boolean;
  errors: string[];
}> {
  try {
    const nodemailer = await import('nodemailer');

    const transporter = nodemailer.createTransport({
      host: credentials.smtpHost,
      port: credentials.smtpPort,
      secure: credentials.smtpSecurity === 'ssl',
      auth: {
        user: credentials.username,
        pass: credentials.password,
      },
      connectionTimeout: 10000,
    });

    await transporter.verify();
    transporter.close();

    return { connected: true, errors: [] };
  } catch (err) {
    return {
      connected: false,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

/**
 * Send an email via SMTP.
 * Returns a synthetic message ID.
 */
export async function sendSmtpEmail(
  credentials: ImapSmtpCredentials,
  options: SmtpSendOptions
): Promise<string> {
  try {
    const nodemailer = await import('nodemailer');

    const transporter = nodemailer.createTransport({
      host: credentials.smtpHost,
      port: credentials.smtpPort,
      secure: credentials.smtpSecurity === 'ssl',
      auth: {
        user: credentials.username,
        pass: credentials.password,
      },
      connectionTimeout: 10000,
    });

    if (options.rawMime) {
      // Send raw MIME (for pre-built messages with capsules)
      const info = await transporter.sendMail({ envelope: { from: options.from, to: [options.to] }, raw: options.rawMime });
      transporter.close();
      return info.messageId || `imap-${Date.now()}`;
    }

    const mailOptions: Record<string, unknown> = {
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    };

    if (options.text) mailOptions.text = options.text;
    if (options.inReplyTo) mailOptions.inReplyTo = options.inReplyTo;
    if (options.references) mailOptions.references = options.references;

    const info = await transporter.sendMail(mailOptions);
    transporter.close();

    return info.messageId || `imap-${Date.now()}`;
  } catch (err) {
    const error = emailError('EMAIL_613', {
      host: credentials.smtpHost,
      to: options.to,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error(`${error.ref}: ${error.description}`);
  }
}
