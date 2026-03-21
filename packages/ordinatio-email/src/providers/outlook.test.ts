// ===========================================
// OUTLOOK PROVIDER — TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutlookProvider } from './outlook';

// Mock outlook modules
vi.mock('./outlook-auth', () => ({
  getOutlookAuthUrl: vi.fn().mockReturnValue('https://login.microsoftonline.com/auth?...'),
  exchangeOutlookCode: vi.fn().mockResolvedValue({
    accessToken: 'at-123',
    refreshToken: 'rt-123',
    expiresAt: new Date(Date.now() + 3600000),
  }),
  refreshOutlookToken: vi.fn().mockResolvedValue({
    accessToken: 'at-refreshed',
    refreshToken: 'rt-123',
    expiresAt: new Date(Date.now() + 3600000),
  }),
}));

vi.mock('./outlook-operations', () => ({
  listOutlookMessages: vi.fn().mockResolvedValue({
    messages: [
      {
        providerId: 'msg-1',
        threadId: 'conv-1',
        subject: 'Test Email',
        fromEmail: 'alice@outlook.com',
        toEmail: 'bob@example.com',
        snippet: 'Hello',
        date: new Date('2026-03-01'),
        hasAttachments: false,
      },
    ],
    nextCursor: undefined,
  }),
  getOutlookMessage: vi.fn().mockResolvedValue({
    providerId: 'msg-1',
    threadId: 'conv-1',
    subject: 'Test Email',
    fromEmail: 'alice@outlook.com',
    toEmail: 'bob@example.com',
    snippet: 'Hello',
    date: new Date('2026-03-01'),
    hasAttachments: false,
    bodyHtml: '<p>Hello</p>',
    attachments: [],
  }),
  getOutlookAttachment: vi.fn().mockResolvedValue({
    data: 'base64data',
    mimeType: 'application/pdf',
  }),
  archiveOutlookMessage: vi.fn().mockResolvedValue(undefined),
  sendOutlookReply: vi.fn().mockResolvedValue('reply-id-1'),
  sendOutlookEmail: vi.fn().mockResolvedValue('send-id-1'),
}));

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

describe('OutlookProvider', () => {
  let provider: OutlookProvider;

  beforeEach(() => {
    provider = new OutlookProvider();
    vi.clearAllMocks();
  });

  // ─── Identity ───

  it('has correct provider ID and auth type', () => {
    expect(provider.providerId).toBe('outlook');
    expect(provider.authType).toBe('oauth');
  });

  // ─── Capabilities ───

  it('reports correct capabilities', () => {
    const caps = provider.getCapabilities();
    expect(caps.supportsOAuth).toBe(true);
    expect(caps.supportsPushNotifications).toBe(true);
    expect(caps.supportsNativeThreading).toBe(true);
    expect(caps.supportsFolders).toBe(true);
    expect(caps.supportsLabels).toBe(false);
    expect(caps.archiveAction).toBe('move_folder');
    expect(caps.maxAttachmentSize).toBe(150 * 1024 * 1024);
  });

  // ─── Auth ───

  it('gets auth URL', () => {
    const url = provider.getAuthUrl!('test-state');
    expect(vi.mocked(getOutlookAuthUrl)).toHaveBeenCalledWith('test-state');
  });

  it('exchanges code for tokens', async () => {
    const tokens = await provider.exchangeCodeForTokens!('auth-code');
    expect(tokens.accessToken).toBe('at-123');
    expect(vi.mocked(exchangeOutlookCode)).toHaveBeenCalledWith('auth-code');
  });

  it('refreshes access token', async () => {
    const tokens = await provider.refreshAccessToken!('rt-123');
    expect(tokens.accessToken).toBe('at-refreshed');
    expect(vi.mocked(refreshOutlookToken)).toHaveBeenCalledWith('rt-123');
  });

  // ─── Read ───

  it('lists messages', async () => {
    const result = await provider.listMessages('at-123', { maxResults: 10 });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].subject).toBe('Test Email');
    expect(result.messages[0].threadId).toBe('conv-1');
    expect(vi.mocked(listOutlookMessages)).toHaveBeenCalledWith('at-123', { maxResults: 10 });
  });

  it('gets a single message', async () => {
    const msg = await provider.getMessage('at-123', 'msg-1');
    expect(msg.subject).toBe('Test Email');
    expect(msg.bodyHtml).toBe('<p>Hello</p>');
    expect(vi.mocked(getOutlookMessage)).toHaveBeenCalledWith('at-123', 'msg-1');
  });

  it('gets attachment', async () => {
    const att = await provider.getAttachment('at-123', 'msg-1', 'att-1');
    expect(att.data).toBe('base64data');
    expect(att.mimeType).toBe('application/pdf');
  });

  // ─── Write ───

  it('archives message', async () => {
    await provider.archiveMessage('at-123', 'msg-1');
    expect(vi.mocked(archiveOutlookMessage)).toHaveBeenCalledWith('at-123', 'msg-1');
  });

  it('sends reply', async () => {
    const id = await provider.sendReply('at-123', {
      inReplyTo: 'msg-1',
      bodyHtml: '<p>Reply</p>',
    });
    expect(id).toBe('reply-id-1');
    expect(vi.mocked(sendOutlookReply)).toHaveBeenCalledWith('at-123', {
      inReplyTo: 'msg-1',
      bodyHtml: '<p>Reply</p>',
    });
  });

  it('sends email', async () => {
    const id = await provider.sendEmail('at-123', {
      to: 'bob@example.com',
      subject: 'New Email',
      bodyHtml: '<p>Hi</p>',
    });
    expect(id).toBe('send-id-1');
    expect(vi.mocked(sendOutlookEmail)).toHaveBeenCalledWith('at-123', {
      to: 'bob@example.com',
      subject: 'New Email',
      bodyHtml: '<p>Hi</p>',
    });
  });
});
