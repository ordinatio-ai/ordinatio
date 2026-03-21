// ===========================================
// GMAIL PROVIDER TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockOAuth2Client, mockGmailUsers, MockOAuth2Class } = vi.hoisted(() => {
  const mockOAuth2Client = {
    generateAuthUrl: vi.fn(),
    getToken: vi.fn(),
    setCredentials: vi.fn(),
    refreshAccessToken: vi.fn(),
  };

  const mockGmailUsers = {
    messages: {
      list: vi.fn(),
      get: vi.fn(),
      modify: vi.fn(),
      send: vi.fn(),
    },
    getProfile: vi.fn(),
  };

  class MockOAuth2Class {
    generateAuthUrl = mockOAuth2Client.generateAuthUrl;
    getToken = mockOAuth2Client.getToken;
    setCredentials = mockOAuth2Client.setCredentials;
    refreshAccessToken = mockOAuth2Client.refreshAccessToken;
  }

  return { mockOAuth2Client, mockGmailUsers, MockOAuth2Class };
});

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: MockOAuth2Class,
    },
    gmail: vi.fn(() => ({
      users: mockGmailUsers,
    })),
  },
}));

process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/callback';

import { GmailProvider } from './gmail';

describe('GmailProvider', () => {
  let provider: GmailProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GmailProvider();
  });

  describe('getAuthUrl', () => {
    it('generates OAuth authorization URL', () => {
      mockOAuth2Client.generateAuthUrl.mockReturnValue(
        'https://accounts.google.com/o/oauth2/v2/auth?scope=...'
      );

      const url = provider.getAuthUrl();

      expect(url).toContain('https://accounts.google.com');
      expect(mockOAuth2Client.generateAuthUrl).toHaveBeenCalledWith({
        access_type: 'offline',
        scope: expect.arrayContaining([
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.modify',
          'https://www.googleapis.com/auth/gmail.send',
        ]),
        prompt: 'consent',
        state: undefined,
      });
    });

    it('includes state parameter when provided', () => {
      mockOAuth2Client.generateAuthUrl.mockReturnValue('https://...');

      provider.getAuthUrl('custom-state');

      expect(mockOAuth2Client.generateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'custom-state',
        })
      );
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('exchanges code for tokens successfully', async () => {
      mockOAuth2Client.getToken.mockResolvedValue({
        tokens: {
          access_token: 'access-123',
          refresh_token: 'refresh-456',
          expiry_date: Date.now() + 3600000,
        },
      });

      const result = await provider.exchangeCodeForTokens('auth-code');

      expect(result.accessToken).toBe('access-123');
      expect(result.refreshToken).toBe('refresh-456');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('throws error when tokens are missing', async () => {
      mockOAuth2Client.getToken.mockResolvedValue({
        tokens: {
          access_token: 'access-123',
        },
      });

      await expect(provider.exchangeCodeForTokens('code')).rejects.toThrow(
        'Failed to obtain tokens from Google'
      );
    });
  });

  describe('refreshAccessToken', () => {
    it('refreshes token successfully', async () => {
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: 'new-access-token',
          expiry_date: Date.now() + 3600000,
        },
      });

      const result = await provider.refreshAccessToken('refresh-token');

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('refresh-token');
    });

    it('throws error when refresh fails', async () => {
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: {},
      });

      await expect(provider.refreshAccessToken('refresh-token')).rejects.toThrow(
        'Failed to refresh access token'
      );
    });
  });

  describe('listMessages', () => {
    it('lists messages from inbox', async () => {
      mockGmailUsers.messages.list.mockResolvedValue({
        data: {
          messages: [{ id: 'msg-1' }, { id: 'msg-2' }],
          nextPageToken: 'next-page',
        },
      });
      mockGmailUsers.messages.get.mockResolvedValue({
        data: {
          id: 'msg-1',
          threadId: 'thread-1',
          snippet: 'Preview text',
          internalDate: '1704067200000',
          payload: {
            headers: [
              { name: 'From', value: 'John Doe <john@example.com>' },
              { name: 'To', value: 'me@example.com' },
              { name: 'Subject', value: 'Test Subject' },
            ],
          },
        },
      });

      const result = await provider.listMessages('access-token', { maxResults: 10 });

      expect(result.messages.length).toBe(2);
      expect(result.nextCursor).toBe('next-page');
    });

    it('handles empty message list', async () => {
      mockGmailUsers.messages.list.mockResolvedValue({
        data: { messages: undefined },
      });

      const result = await provider.listMessages('access-token');

      expect(result.messages).toEqual([]);
    });

    it('parses email addresses correctly', async () => {
      mockGmailUsers.messages.list.mockResolvedValue({
        data: { messages: [{ id: 'msg-1' }] },
      });
      mockGmailUsers.messages.get.mockResolvedValue({
        data: {
          id: 'msg-1',
          snippet: 'Test',
          internalDate: '1704067200000',
          payload: {
            headers: [
              { name: 'From', value: '"John Doe" <john@example.com>' },
              { name: 'To', value: 'recipient@example.com' },
              { name: 'Subject', value: 'Subject' },
            ],
          },
        },
      });

      const result = await provider.listMessages('token');

      expect(result.messages[0].fromName).toBe('John Doe');
      expect(result.messages[0].fromEmail).toBe('john@example.com');
    });

    it('handles missing subject', async () => {
      mockGmailUsers.messages.list.mockResolvedValue({
        data: { messages: [{ id: 'msg-1' }] },
      });
      mockGmailUsers.messages.get.mockResolvedValue({
        data: {
          id: 'msg-1',
          snippet: 'Test',
          internalDate: '1704067200000',
          payload: {
            headers: [
              { name: 'From', value: 'test@example.com' },
              { name: 'To', value: 'me@example.com' },
            ],
          },
        },
      });

      const result = await provider.listMessages('token');

      expect(result.messages[0].subject).toBe('(No Subject)');
    });
  });

  describe('getMessage', () => {
    it('fetches full message content', async () => {
      mockGmailUsers.messages.get.mockResolvedValue({
        data: {
          id: 'msg-1',
          threadId: 'thread-1',
          snippet: 'Preview',
          internalDate: '1704067200000',
          payload: {
            headers: [
              { name: 'From', value: 'sender@example.com' },
              { name: 'To', value: 'recipient@example.com' },
              { name: 'Subject', value: 'Test' },
            ],
            mimeType: 'text/html',
            body: {
              data: Buffer.from('<p>Hello</p>').toString('base64'),
            },
          },
        },
      });

      const result = await provider.getMessage('token', 'msg-1');

      expect(result.providerId).toBe('msg-1');
      expect(result.bodyHtml).toBe('<p>Hello</p>');
    });

    it('extracts attachments metadata', async () => {
      mockGmailUsers.messages.get.mockResolvedValue({
        data: {
          id: 'msg-1',
          snippet: 'Test',
          internalDate: '1704067200000',
          payload: {
            headers: [
              { name: 'From', value: 'test@example.com' },
              { name: 'To', value: 'me@example.com' },
              { name: 'Subject', value: 'Test' },
            ],
            parts: [
              {
                filename: 'document.pdf',
                mimeType: 'application/pdf',
                body: { attachmentId: 'att-123', size: 1024 },
              },
            ],
          },
        },
      });

      const result = await provider.getMessage('token', 'msg-1');

      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0].name).toBe('document.pdf');
    });
  });

  describe('archiveMessage', () => {
    it('removes INBOX label from message', async () => {
      mockGmailUsers.messages.modify.mockResolvedValue({});

      await provider.archiveMessage('token', 'msg-1');

      expect(mockGmailUsers.messages.modify).toHaveBeenCalledWith({
        userId: 'me',
        id: 'msg-1',
        requestBody: { removeLabelIds: ['INBOX'] },
      });
    });
  });

  describe('sendReply', () => {
    it('sends reply email', async () => {
      mockGmailUsers.messages.get.mockResolvedValue({
        data: {
          payload: {
            headers: [
              { name: 'From', value: 'original@example.com' },
              { name: 'Subject', value: 'Original Subject' },
              { name: 'Message-ID', value: '<original-msg-id>' },
            ],
          },
        },
      });
      mockGmailUsers.getProfile.mockResolvedValue({
        data: { emailAddress: 'me@example.com' },
      });
      mockGmailUsers.messages.send.mockResolvedValue({
        data: { id: 'sent-msg-id' },
      });

      const result = await provider.sendReply('token', {
        inReplyTo: 'original-msg',
        threadId: 'thread-1',
        bodyHtml: '<p>Reply content</p>',
      });

      expect(result).toBe('sent-msg-id');
      expect(mockGmailUsers.messages.send).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: expect.objectContaining({
          threadId: 'thread-1',
        }),
      });
    });
  });

  describe('providerId', () => {
    it('returns gmail as provider id', () => {
      expect(provider.providerId).toBe('gmail');
    });
  });
});
