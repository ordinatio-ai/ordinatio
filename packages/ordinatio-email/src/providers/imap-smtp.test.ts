// ===========================================
// IMAP/SMTP PROVIDER — TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImapSmtpProvider } from './imap-smtp';
import type { ImapSmtpCredentials, ConnectionTestResult } from './types';

// Mock the imap-client and smtp-client modules
vi.mock('./imap-client', () => ({
  testImapConnection: vi.fn(),
  fetchImapMessages: vi.fn(),
  fetchImapMessage: vi.fn(),
  archiveImapMessage: vi.fn(),
}));

vi.mock('./smtp-client', () => ({
  testSmtpConnection: vi.fn(),
  sendSmtpEmail: vi.fn(),
}));

import {
  testImapConnection,
  fetchImapMessages,
  fetchImapMessage,
  archiveImapMessage,
} from './imap-client';
import { testSmtpConnection, sendSmtpEmail } from './smtp-client';

const mockCredentials: ImapSmtpCredentials = {
  imapHost: 'imap.example.com',
  imapPort: 993,
  imapSecurity: 'ssl',
  smtpHost: 'smtp.example.com',
  smtpPort: 587,
  smtpSecurity: 'starttls',
  username: 'user@example.com',
  password: 'secret',
};

const credentialsToken = JSON.stringify(mockCredentials);

describe('ImapSmtpProvider', () => {
  let provider: ImapSmtpProvider;

  beforeEach(() => {
    provider = new ImapSmtpProvider();
    vi.clearAllMocks();
  });

  // ─── Identity ───

  it('has correct provider ID and auth type', () => {
    expect(provider.providerId).toBe('imap');
    expect(provider.authType).toBe('credentials');
  });

  // ─── Capabilities ───

  it('reports correct capabilities', () => {
    const caps = provider.getCapabilities();
    expect(caps.supportsOAuth).toBe(false);
    expect(caps.supportsPushNotifications).toBe(false);
    expect(caps.supportsNativeThreading).toBe(false);
    expect(caps.supportsFolders).toBe(true);
    expect(caps.archiveAction).toBe('move_folder');
  });

  // ─── Connection Testing ───

  it('tests connection (both IMAP and SMTP)', async () => {
    vi.mocked(testImapConnection).mockResolvedValue({
      connected: true,
      folderCount: 5,
      messageCount: 100,
      errors: [],
    });
    vi.mocked(testSmtpConnection).mockResolvedValue({
      connected: true,
      errors: [],
    });

    const result = await provider.testConnection!(mockCredentials);
    expect(result.success).toBe(true);
    expect(result.imapConnected).toBe(true);
    expect(result.smtpConnected).toBe(true);
    expect(result.folderCount).toBe(5);
    expect(result.messageCount).toBe(100);
  });

  it('reports failure when IMAP fails', async () => {
    vi.mocked(testImapConnection).mockResolvedValue({
      connected: false,
      folderCount: 0,
      messageCount: 0,
      errors: ['Connection refused'],
    });
    vi.mocked(testSmtpConnection).mockResolvedValue({
      connected: true,
      errors: [],
    });

    const result = await provider.testConnection!(mockCredentials);
    expect(result.success).toBe(false);
    expect(result.imapConnected).toBe(false);
    expect(result.smtpConnected).toBe(true);
    expect(result.errors).toContain('Connection refused');
  });

  it('reports failure when SMTP fails', async () => {
    vi.mocked(testImapConnection).mockResolvedValue({
      connected: true,
      folderCount: 3,
      messageCount: 50,
      errors: [],
    });
    vi.mocked(testSmtpConnection).mockResolvedValue({
      connected: false,
      errors: ['Auth failed'],
    });

    const result = await provider.testConnection!(mockCredentials);
    expect(result.success).toBe(false);
    expect(result.smtpConnected).toBe(false);
  });

  // ─── List Messages ───

  it('lists messages via IMAP', async () => {
    vi.mocked(fetchImapMessages).mockResolvedValue({
      messages: [
        {
          providerId: '1',
          subject: 'Test',
          fromEmail: 'a@b.com',
          toEmail: 'c@d.com',
          snippet: '',
          date: new Date(),
          hasAttachments: false,
        },
      ],
      nextCursor: '1',
    });

    const result = await provider.listMessages(credentialsToken, { maxResults: 10 });
    expect(result.messages).toHaveLength(1);
    expect(vi.mocked(fetchImapMessages)).toHaveBeenCalledWith(mockCredentials, { maxResults: 10 });
  });

  // ─── Get Message ───

  it('gets a single message via IMAP', async () => {
    vi.mocked(fetchImapMessage).mockResolvedValue({
      providerId: '42',
      subject: 'Hello',
      fromEmail: 'a@b.com',
      toEmail: 'c@d.com',
      snippet: 'body',
      date: new Date(),
      hasAttachments: false,
      bodyHtml: '<p>Hello</p>',
      attachments: [],
    });

    const msg = await provider.getMessage(credentialsToken, '42');
    expect(msg.subject).toBe('Hello');
    expect(msg.bodyHtml).toBe('<p>Hello</p>');
  });

  // ─── Archive ───

  it('archives a message via IMAP', async () => {
    vi.mocked(archiveImapMessage).mockResolvedValue(undefined);

    await provider.archiveMessage(credentialsToken, '42');
    expect(vi.mocked(archiveImapMessage)).toHaveBeenCalledWith(mockCredentials, '42');
  });

  // ─── Send Email ───

  it('sends email via SMTP', async () => {
    vi.mocked(sendSmtpEmail).mockResolvedValue('msg-id-123');

    const result = await provider.sendEmail(credentialsToken, {
      to: 'test@example.com',
      subject: 'Test',
      bodyHtml: '<p>Hi</p>',
    });

    expect(result).toBe('msg-id-123');
    expect(vi.mocked(sendSmtpEmail)).toHaveBeenCalledWith(
      mockCredentials,
      expect.objectContaining({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
      })
    );
  });

  // ─── Send Reply ───

  it('sends reply via SMTP', async () => {
    vi.mocked(fetchImapMessage).mockResolvedValue({
      providerId: '42',
      subject: 'Original',
      fromEmail: 'sender@b.com',
      toEmail: 'me@example.com',
      snippet: '',
      date: new Date(),
      hasAttachments: false,
      attachments: [],
    });
    vi.mocked(sendSmtpEmail).mockResolvedValue('reply-id');

    const result = await provider.sendReply(credentialsToken, {
      inReplyTo: '42',
      bodyHtml: '<p>Reply</p>',
    });

    expect(result).toBe('reply-id');
    expect(vi.mocked(sendSmtpEmail)).toHaveBeenCalledWith(
      mockCredentials,
      expect.objectContaining({
        to: 'sender@b.com',
        inReplyTo: '42',
      })
    );
  });

  // ─── Credential Parsing ───

  it('throws on invalid credentials JSON', async () => {
    await expect(provider.listMessages('not-json', {})).rejects.toThrow(
      'Invalid IMAP/SMTP credentials'
    );
  });
});
