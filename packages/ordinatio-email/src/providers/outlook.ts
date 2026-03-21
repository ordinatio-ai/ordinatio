// ===========================================
// OUTLOOK PROVIDER (BARREL)
// ===========================================
// Microsoft Outlook / Microsoft 365 via Graph API.
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
  getOutlookAuthUrl,
  exchangeOutlookCode,
  refreshOutlookToken,
} from './outlook-auth';

import {
  listOutlookMessages,
  getOutlookMessage,
  getOutlookAttachment,
  archiveOutlookMessage,
  sendOutlookReply,
  sendOutlookEmail,
} from './outlook-operations';

export * from './outlook-auth';
export * from './outlook-operations';

export class OutlookProvider implements EmailProvider {
  readonly providerId = 'outlook' as const;
  readonly authType: AuthType = 'oauth';

  getCapabilities(): ProviderCapabilities {
    return {
      supportsOAuth: true,
      supportsPushNotifications: true, // Webhooks via Graph subscriptions
      supportsNativeArchive: false, // Need to move to Archive folder
      supportsNativeThreading: true, // conversationId
      supportsServerSearch: true, // $search and $filter
      supportsLabels: false,
      supportsFolders: true,
      archiveAction: 'move_folder',
      maxAttachmentSize: 150 * 1024 * 1024, // 150MB via upload session
    };
  }

  getAuthUrl(state?: string): string {
    return getOutlookAuthUrl(state);
  }

  async exchangeCodeForTokens(code: string): Promise<TokenSet> {
    return exchangeOutlookCode(code);
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenSet> {
    return refreshOutlookToken(refreshToken);
  }

  async listMessages(
    accessToken: string,
    options?: ListMessagesOptions
  ): Promise<ListMessagesResult> {
    return listOutlookMessages(accessToken, options);
  }

  async getMessage(accessToken: string, messageId: string): Promise<FullMessage> {
    return getOutlookMessage(accessToken, messageId);
  }

  async getAttachment(
    accessToken: string,
    messageId: string,
    attachmentId: string
  ): Promise<{ data: string; mimeType: string }> {
    return getOutlookAttachment(accessToken, messageId, attachmentId);
  }

  async archiveMessage(accessToken: string, messageId: string): Promise<void> {
    return archiveOutlookMessage(accessToken, messageId);
  }

  async sendReply(accessToken: string, options: ReplyOptions): Promise<string> {
    return sendOutlookReply(accessToken, options);
  }

  async sendEmail(
    accessToken: string,
    options: { to: string; subject: string; bodyHtml: string }
  ): Promise<string> {
    return sendOutlookEmail(accessToken, options);
  }
}
