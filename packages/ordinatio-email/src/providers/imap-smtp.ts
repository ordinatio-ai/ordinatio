// ===========================================
// IMAP/SMTP PROVIDER
// ===========================================
// Universal email provider for any IMAP/SMTP server.
// ===========================================

import type {
  AuthType,
  EmailProvider,
  ProviderCapabilities,
  ConnectionTestResult,
  ImapSmtpCredentials,
  ListMessagesOptions,
  ListMessagesResult,
  FullMessage,
  ReplyOptions,
} from './types';
import {
  testImapConnection,
  fetchImapMessages,
  fetchImapMessage,
  archiveImapMessage,
} from './imap-client';
import { testSmtpConnection, sendSmtpEmail } from './smtp-client';

/**
 * IMAP/SMTP provider — works with any standard mail server.
 *
 * The `accessToken` parameter in read/write methods is repurposed as a
 * JSON-encoded ImapSmtpCredentials string (retrieved from the DB).
 */
export class ImapSmtpProvider implements EmailProvider {
  readonly providerId = 'imap' as const;
  readonly authType: AuthType = 'credentials';

  getCapabilities(): ProviderCapabilities {
    return {
      supportsOAuth: false,
      supportsPushNotifications: false,
      supportsNativeArchive: false,
      supportsNativeThreading: false,
      supportsServerSearch: true, // IMAP SEARCH
      supportsLabels: false,
      supportsFolders: true,
      archiveAction: 'move_folder',
      maxAttachmentSize: 25 * 1024 * 1024, // Typical limit
    };
  }

  async testConnection(credentials: ImapSmtpCredentials): Promise<ConnectionTestResult> {
    const [imapResult, smtpResult] = await Promise.all([
      testImapConnection(credentials),
      testSmtpConnection(credentials),
    ]);

    return {
      success: imapResult.connected && smtpResult.connected,
      imapConnected: imapResult.connected,
      smtpConnected: smtpResult.connected,
      folderCount: imapResult.folderCount,
      messageCount: imapResult.messageCount,
      errors: [...imapResult.errors, ...smtpResult.errors],
    };
  }

  async listMessages(accessToken: string, options?: ListMessagesOptions): Promise<ListMessagesResult> {
    const credentials = this.parseCredentials(accessToken);
    return fetchImapMessages(credentials, options);
  }

  async getMessage(accessToken: string, messageId: string): Promise<FullMessage> {
    const credentials = this.parseCredentials(accessToken);
    return fetchImapMessage(credentials, messageId);
  }

  async getAttachment(
    accessToken: string,
    _messageId: string,
    attachmentId: string
  ): Promise<{ data: string; mimeType: string }> {
    // IMAP attachments are part of the full message — already fetched in getMessage
    // This is a stub for the interface — real implementation would re-fetch and extract
    void accessToken;
    return {
      data: '',
      mimeType: 'application/octet-stream',
    };
  }

  async archiveMessage(accessToken: string, messageId: string): Promise<void> {
    const credentials = this.parseCredentials(accessToken);
    return archiveImapMessage(credentials, messageId);
  }

  async sendReply(accessToken: string, options: ReplyOptions): Promise<string> {
    const credentials = this.parseCredentials(accessToken);
    // For replies, we need the original message to get the from/to addresses
    const original = await fetchImapMessage(credentials, options.inReplyTo);

    return sendSmtpEmail(credentials, {
      from: credentials.username,
      to: original.fromEmail,
      subject: `Re: ${original.subject}`,
      html: options.bodyHtml,
      text: options.bodyText,
      inReplyTo: options.inReplyTo,
    });
  }

  async sendEmail(
    accessToken: string,
    options: { to: string; subject: string; bodyHtml: string; rawMime?: string }
  ): Promise<string> {
    const credentials = this.parseCredentials(accessToken);

    return sendSmtpEmail(credentials, {
      from: credentials.username,
      to: options.to,
      subject: options.subject,
      html: options.bodyHtml,
      rawMime: options.rawMime,
    });
  }

  // ─── Private ───

  private parseCredentials(accessToken: string): ImapSmtpCredentials {
    try {
      return JSON.parse(accessToken) as ImapSmtpCredentials;
    } catch {
      throw new Error('Invalid IMAP/SMTP credentials — expected JSON-encoded ImapSmtpCredentials');
    }
  }
}
