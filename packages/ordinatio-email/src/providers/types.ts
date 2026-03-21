// ===========================================
// EMAIL PROVIDER TYPES
// ===========================================
// Abstract email provider interface.
// Supports OAuth, credentials, and capability detection.
// ===========================================

// ─── Auth Types ───

export type AuthType = 'oauth' | 'credentials';

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface ImapSmtpCredentials {
  imapHost: string;
  imapPort: number;
  imapSecurity: 'ssl' | 'starttls' | 'none';
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: 'ssl' | 'starttls' | 'none';
  username: string;
  password: string;
}

// ─── Capabilities ───

export interface ProviderCapabilities {
  supportsOAuth: boolean;
  supportsPushNotifications: boolean;
  supportsNativeArchive: boolean;
  supportsNativeThreading: boolean;
  supportsServerSearch: boolean;
  supportsLabels: boolean;
  supportsFolders: boolean;
  archiveAction: 'label_remove' | 'move_folder' | 'flag';
  maxAttachmentSize: number;
}

// ─── Connection Testing ───

export interface ConnectionTestResult {
  success: boolean;
  imapConnected?: boolean;
  smtpConnected?: boolean;
  folderCount?: number;
  messageCount?: number;
  errors?: string[];
}

// ─── Message Types ───

export interface ListMessagesOptions {
  maxResults?: number;
  cursor?: string;
  after?: Date;
}

export interface ListMessagesResult {
  messages: MessageSummary[];
  nextCursor?: string;
}

export interface MessageSummary {
  providerId: string;
  threadId?: string;
  subject: string;
  fromEmail: string;
  fromName?: string;
  toEmail: string;
  snippet: string;
  date: Date;
  hasAttachments: boolean;
}

export interface FullMessage extends MessageSummary {
  bodyHtml?: string;
  bodyText?: string;
  attachments: Attachment[];
}

export interface Attachment {
  providerId: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface ReplyOptions {
  inReplyTo: string;
  threadId?: string;
  bodyHtml: string;
  bodyText?: string;
}

// ─── Provider Interface ───

export interface EmailProvider {
  readonly providerId: string;
  readonly authType: AuthType;

  // Capabilities
  getCapabilities(): ProviderCapabilities;

  // Auth — OAuth (optional for credential-based providers)
  getAuthUrl?(state?: string): string;
  exchangeCodeForTokens?(code: string): Promise<TokenSet>;
  refreshAccessToken?(refreshToken: string): Promise<TokenSet>;

  // Auth — Credentials (optional for OAuth providers)
  testConnection?(credentials: ImapSmtpCredentials): Promise<ConnectionTestResult>;

  // Read
  listMessages(accessToken: string, options?: ListMessagesOptions): Promise<ListMessagesResult>;
  getMessage(accessToken: string, messageId: string): Promise<FullMessage>;
  getAttachment(
    accessToken: string,
    messageId: string,
    attachmentId: string
  ): Promise<{ data: string; mimeType: string }>;

  // Write
  archiveMessage(accessToken: string, messageId: string): Promise<void>;
  sendReply(accessToken: string, options: ReplyOptions): Promise<string>;
  sendEmail(
    accessToken: string,
    options: { to: string; subject: string; bodyHtml: string; rawMime?: string }
  ): Promise<string>;
}

export type EmailProviderFactory = () => EmailProvider;
