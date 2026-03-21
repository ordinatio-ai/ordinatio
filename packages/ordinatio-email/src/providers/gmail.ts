// ===========================================
// GMAIL PROVIDER (BARREL)
// ===========================================

import type {
  AuthType,
  EmailProvider,
  ProviderCapabilities,
  TokenSet,
  ListMessagesOptions,
  ListMessagesResult,
  FullMessage,
  ReplyOptions,
} from './types';

import {
  getAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
} from './gmail-auth';

import {
  listMessages,
  getMessage,
  getAttachment,
  archiveMessage,
  sendReply,
  sendEmail,
} from './gmail-operations';

export * from './gmail-auth';
export * from './gmail-operations';

export class GmailProvider implements EmailProvider {
  readonly providerId = 'gmail' as const;
  readonly authType: AuthType = 'oauth';

  getCapabilities(): ProviderCapabilities {
    return {
      supportsOAuth: true,
      supportsPushNotifications: true,
      supportsNativeArchive: true,
      supportsNativeThreading: true,
      supportsServerSearch: true,
      supportsLabels: true,
      supportsFolders: false,
      archiveAction: 'label_remove',
      maxAttachmentSize: 25 * 1024 * 1024, // 25MB
    };
  }

  getAuthUrl(state?: string): string {
    return getAuthUrl(state);
  }

  async exchangeCodeForTokens(code: string): Promise<TokenSet> {
    return exchangeCodeForTokens(code);
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenSet> {
    return refreshAccessToken(refreshToken);
  }

  async listMessages(
    accessToken: string,
    options?: ListMessagesOptions
  ): Promise<ListMessagesResult> {
    return listMessages(accessToken, options);
  }

  async getMessage(accessToken: string, messageId: string): Promise<FullMessage> {
    return getMessage(accessToken, messageId);
  }

  async getAttachment(
    accessToken: string,
    messageId: string,
    attachmentId: string
  ): Promise<{ data: string; mimeType: string }> {
    return getAttachment(accessToken, messageId, attachmentId);
  }

  async archiveMessage(accessToken: string, messageId: string): Promise<void> {
    return archiveMessage(accessToken, messageId);
  }

  async sendReply(accessToken: string, options: ReplyOptions): Promise<string> {
    return sendReply(accessToken, options);
  }

  async sendEmail(
    accessToken: string,
    options: { to: string; subject: string; bodyHtml: string }
  ): Promise<string> {
    return sendEmail(accessToken, options);
  }
}
