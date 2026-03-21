// ===========================================
// EMAIL ENGINE — ACCOUNT QUERIES & MUTATIONS TESTS
// Covers: account-queries.ts + account-mutations.ts
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';

import { EmailAccountNotFoundError, EmailAccountExistsError } from './types';

// ---------------------------------------------------------------------------
// Mock the providers module so no real Google OAuth clients are created
// ---------------------------------------------------------------------------

vi.mock('./providers', () => ({
  getProvider: vi.fn(),
}));

// Mock gmail-auth for getConnectUrl's underlying getAuthUrl call
vi.mock('./providers/gmail-auth', () => ({
  getAuthUrl: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mock declarations)
// ---------------------------------------------------------------------------

import { getProvider } from './providers';
import { getAuthUrl } from './providers/gmail-auth';

import {
  getActiveAccount,
  getConnectUrl,
  getValidAccessToken,
  updateSyncTimestamp,
} from './account-queries';

import { connectAccount, disconnectAccount } from './account-mutations';

// ---------------------------------------------------------------------------
// Shared mock db factory
// ---------------------------------------------------------------------------

function makeMockDb() {
  return {
    emailAccount: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
  } as unknown as PrismaClient;
}

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acc-1',
    provider: 'GMAIL',
    email: 'user@example.com',
    accessToken: 'access-token-abc',
    refreshToken: 'refresh-token-xyz',
    tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
    isActive: true,
    lastSyncAt: null,
    syncCursor: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// getActiveAccount
// ===========================================================================

describe('getActiveAccount', () => {
  it('returns the active account when one exists', async () => {
    const db = makeMockDb();
    const account = makeAccount();
    db.emailAccount.findFirst = vi.fn().mockResolvedValue(account);

    const result = await getActiveAccount(db);

    expect(result).toEqual(account);
    expect(db.emailAccount.findFirst).toHaveBeenCalledWith({
      where: { isActive: true },
    });
  });

  it('returns null when no active account exists', async () => {
    const db = makeMockDb();
    db.emailAccount.findFirst = vi.fn().mockResolvedValue(null);

    const result = await getActiveAccount(db);

    expect(result).toBeNull();
  });

  it('calls findFirst with isActive: true', async () => {
    const db = makeMockDb();
    db.emailAccount.findFirst = vi.fn().mockResolvedValue(null);

    await getActiveAccount(db);

    expect(db.emailAccount.findFirst).toHaveBeenCalledOnce();
    const callArg = (db.emailAccount.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.where).toEqual({ isActive: true });
  });
});

// ===========================================================================
// getConnectUrl
// ===========================================================================

describe('getConnectUrl', () => {
  it('returns the auth URL from the provider for gmail', () => {
    const mockAuthUrl = 'https://accounts.google.com/o/oauth2/auth?...';
    const mockProvider = { getAuthUrl: vi.fn().mockReturnValue(mockAuthUrl) };
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue(mockProvider);

    const result = getConnectUrl('gmail');

    expect(result).toBe(mockAuthUrl);
    expect(getProvider).toHaveBeenCalledWith('gmail');
    expect(mockProvider.getAuthUrl).toHaveBeenCalledWith(undefined);
  });

  it('passes the state parameter to getAuthUrl', () => {
    const mockAuthUrl = 'https://accounts.google.com/o/oauth2/auth?state=abc';
    const mockProvider = { getAuthUrl: vi.fn().mockReturnValue(mockAuthUrl) };
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue(mockProvider);

    const result = getConnectUrl('gmail', 'abc');

    expect(result).toBe(mockAuthUrl);
    expect(mockProvider.getAuthUrl).toHaveBeenCalledWith('abc');
  });

  it('throws for unsupported providers', () => {
    (getProvider as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Outlook provider not yet implemented');
    });

    expect(() => getConnectUrl('outlook')).toThrow('Outlook provider not yet implemented');
  });

  it('throws for imap provider', () => {
    (getProvider as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('IMAP provider not yet implemented');
    });

    expect(() => getConnectUrl('imap')).toThrow('IMAP provider not yet implemented');
  });
});

// ===========================================================================
// getValidAccessToken
// ===========================================================================

describe('getValidAccessToken', () => {
  it('throws EmailAccountNotFoundError when account does not exist', async () => {
    const db = makeMockDb();
    db.emailAccount.findUnique = vi.fn().mockResolvedValue(null);

    await expect(getValidAccessToken(db, 'missing-id')).rejects.toThrow(EmailAccountNotFoundError);
  });

  it('includes the account ID in the not-found error message', async () => {
    const db = makeMockDb();
    db.emailAccount.findUnique = vi.fn().mockResolvedValue(null);

    const err = await getValidAccessToken(db, 'acc-missing').catch((e) => e);

    expect(err.message).toContain('acc-missing');
  });

  it('has the correct error name when account is not found', async () => {
    const db = makeMockDb();
    db.emailAccount.findUnique = vi.fn().mockResolvedValue(null);

    const err = await getValidAccessToken(db, 'x').catch((e) => e);

    expect(err.name).toBe('EmailAccountNotFoundError');
  });

  it('returns the existing access token when it is not expired', async () => {
    const db = makeMockDb();
    // Token expires 1 hour from now — well beyond the 5-minute refresh threshold
    const account = makeAccount({
      accessToken: 'still-valid-token',
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    db.emailAccount.findUnique = vi.fn().mockResolvedValue(account);

    const result = await getValidAccessToken(db, 'acc-1');

    expect(result).toBe('still-valid-token');
    expect(db.emailAccount.update).not.toHaveBeenCalled();
  });

  it('does not call provider.refreshAccessToken when token is still valid', async () => {
    const db = makeMockDb();
    const mockProvider = { refreshAccessToken: vi.fn() };
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue(mockProvider);

    const account = makeAccount({
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    db.emailAccount.findUnique = vi.fn().mockResolvedValue(account);

    await getValidAccessToken(db, 'acc-1');

    expect(mockProvider.refreshAccessToken).not.toHaveBeenCalled();
  });

  it('refreshes the token when it expires within 5 minutes', async () => {
    const db = makeMockDb();
    const newTokens = {
      accessToken: 'refreshed-access-token',
      refreshToken: 'refresh-token-xyz',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };
    const mockProvider = {
      refreshAccessToken: vi.fn().mockResolvedValue(newTokens),
    };
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue(mockProvider);

    // Token expires in 2 minutes — inside the 5-minute threshold
    const account = makeAccount({
      tokenExpiresAt: new Date(Date.now() + 2 * 60 * 1000),
      provider: 'GMAIL',
    });
    db.emailAccount.findUnique = vi.fn().mockResolvedValue(account);
    db.emailAccount.update = vi.fn().mockResolvedValue({ ...account, accessToken: 'refreshed-access-token' });

    const result = await getValidAccessToken(db, 'acc-1');

    expect(result).toBe('refreshed-access-token');
    expect(mockProvider.refreshAccessToken).toHaveBeenCalledWith(account.refreshToken);
  });

  it('refreshes the token when it is already expired', async () => {
    const db = makeMockDb();
    const newTokens = {
      accessToken: 'brand-new-token',
      refreshToken: 'refresh-token-xyz',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };
    const mockProvider = {
      refreshAccessToken: vi.fn().mockResolvedValue(newTokens),
    };
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue(mockProvider);

    const account = makeAccount({
      tokenExpiresAt: new Date(Date.now() - 60 * 1000), // expired 1 minute ago
      provider: 'GMAIL',
    });
    db.emailAccount.findUnique = vi.fn().mockResolvedValue(account);
    db.emailAccount.update = vi.fn().mockResolvedValue({ ...account, accessToken: 'brand-new-token' });

    const result = await getValidAccessToken(db, 'acc-1');

    expect(result).toBe('brand-new-token');
  });

  it('persists the refreshed tokens to the database', async () => {
    const db = makeMockDb();
    const newExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const newTokens = {
      accessToken: 'refreshed-access-token',
      refreshToken: 'refresh-token-xyz',
      expiresAt: newExpiresAt,
    };
    const mockProvider = {
      refreshAccessToken: vi.fn().mockResolvedValue(newTokens),
    };
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue(mockProvider);

    const account = makeAccount({
      tokenExpiresAt: new Date(Date.now() + 2 * 60 * 1000),
      provider: 'GMAIL',
    });
    db.emailAccount.findUnique = vi.fn().mockResolvedValue(account);
    db.emailAccount.update = vi.fn().mockResolvedValue(account);

    await getValidAccessToken(db, 'acc-1');

    expect(db.emailAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: {
        accessToken: 'refreshed-access-token',
        tokenExpiresAt: newExpiresAt,
      },
    });
  });

  it('calls getProvider with the lowercased provider string', async () => {
    const db = makeMockDb();
    const newTokens = {
      accessToken: 'new-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };
    const mockProvider = {
      refreshAccessToken: vi.fn().mockResolvedValue(newTokens),
    };
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue(mockProvider);

    // Provider stored as uppercase 'GMAIL' in DB
    const account = makeAccount({
      provider: 'GMAIL',
      tokenExpiresAt: new Date(Date.now() + 2 * 60 * 1000),
    });
    db.emailAccount.findUnique = vi.fn().mockResolvedValue(account);
    db.emailAccount.update = vi.fn().mockResolvedValue(account);

    await getValidAccessToken(db, 'acc-1');

    expect(getProvider).toHaveBeenCalledWith('gmail');
  });
});

// ===========================================================================
// updateSyncTimestamp
// ===========================================================================

describe('updateSyncTimestamp', () => {
  it('calls db.emailAccount.update with the account ID', async () => {
    const db = makeMockDb();
    db.emailAccount.update = vi.fn().mockResolvedValue({});

    await updateSyncTimestamp(db, 'acc-1');

    expect(db.emailAccount.update).toHaveBeenCalledOnce();
    const callArg = (db.emailAccount.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.where).toEqual({ id: 'acc-1' });
  });

  it('sets lastSyncAt to a current Date', async () => {
    const db = makeMockDb();
    const before = Date.now();
    db.emailAccount.update = vi.fn().mockResolvedValue({});

    await updateSyncTimestamp(db, 'acc-1');

    const callArg = (db.emailAccount.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const after = Date.now();
    const lastSyncAt: Date = callArg.data.lastSyncAt;
    expect(lastSyncAt).toBeInstanceOf(Date);
    expect(lastSyncAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(lastSyncAt.getTime()).toBeLessThanOrEqual(after);
  });

  it('sets syncCursor to the provided cursor string', async () => {
    const db = makeMockDb();
    db.emailAccount.update = vi.fn().mockResolvedValue({});

    await updateSyncTimestamp(db, 'acc-1', 'cursor-token-123');

    const callArg = (db.emailAccount.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.data.syncCursor).toBe('cursor-token-123');
  });

  it('sets syncCursor to null when no cursor is provided', async () => {
    const db = makeMockDb();
    db.emailAccount.update = vi.fn().mockResolvedValue({});

    await updateSyncTimestamp(db, 'acc-1');

    const callArg = (db.emailAccount.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.data.syncCursor).toBeNull();
  });

  it('sets syncCursor to null when cursor is explicitly undefined', async () => {
    const db = makeMockDb();
    db.emailAccount.update = vi.fn().mockResolvedValue({});

    await updateSyncTimestamp(db, 'acc-1', undefined);

    const callArg = (db.emailAccount.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.data.syncCursor).toBeNull();
  });

  it('resolves without throwing', async () => {
    const db = makeMockDb();
    db.emailAccount.update = vi.fn().mockResolvedValue({});

    await expect(updateSyncTimestamp(db, 'acc-1', 'cursor')).resolves.toBeUndefined();
  });
});

// ===========================================================================
// connectAccount
// ===========================================================================

describe('connectAccount', () => {
  it('creates and returns the new account id and email', async () => {
    const db = makeMockDb();
    const created = makeAccount({ id: 'acc-new', email: 'new@example.com' });
    const mockProvider = {
      exchangeCodeForTokens: vi.fn().mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date(Date.now() + 3600 * 1000),
      }),
    };
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue(mockProvider);

    db.emailAccount.findUnique = vi.fn().mockResolvedValue(null);
    db.emailAccount.updateMany = vi.fn().mockResolvedValue({ count: 0 });
    db.emailAccount.create = vi.fn().mockResolvedValue(created);

    const result = await connectAccount(db, 'gmail', 'auth-code', 'new@example.com');

    expect(result).toEqual({ id: 'acc-new', email: 'new@example.com' });
  });

  it('throws EmailAccountExistsError when the email is already connected', async () => {
    const db = makeMockDb();
    db.emailAccount.findUnique = vi.fn().mockResolvedValue(makeAccount());

    await expect(
      connectAccount(db, 'gmail', 'auth-code', 'user@example.com')
    ).rejects.toThrow(EmailAccountExistsError);
  });

  it('has the correct error name when account already exists', async () => {
    const db = makeMockDb();
    db.emailAccount.findUnique = vi.fn().mockResolvedValue(makeAccount());

    const err = await connectAccount(db, 'gmail', 'code', 'user@example.com').catch((e) => e);

    expect(err.name).toBe('EmailAccountExistsError');
  });

  it('includes the email address in the AlreadyExists error message', async () => {
    const db = makeMockDb();
    db.emailAccount.findUnique = vi.fn().mockResolvedValue(makeAccount());

    const err = await connectAccount(db, 'gmail', 'code', 'user@example.com').catch((e) => e);

    expect(err.message).toContain('user@example.com');
  });

  it('deactivates all existing active accounts before creating the new one', async () => {
    const db = makeMockDb();
    const tokens = {
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: new Date(Date.now() + 3600 * 1000),
    };
    const mockProvider = { exchangeCodeForTokens: vi.fn().mockResolvedValue(tokens) };
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue(mockProvider);

    db.emailAccount.findUnique = vi.fn().mockResolvedValue(null);
    db.emailAccount.updateMany = vi.fn().mockResolvedValue({ count: 1 });
    db.emailAccount.create = vi.fn().mockResolvedValue(makeAccount({ id: 'acc-new' }));

    await connectAccount(db, 'gmail', 'code', 'new@example.com');

    expect(db.emailAccount.updateMany).toHaveBeenCalledWith({
      where: { isActive: true },
      data: { isActive: false },
    });
  });

  it('calls provider.exchangeCodeForTokens with the provided code', async () => {
    const db = makeMockDb();
    const tokens = {
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: new Date(Date.now() + 3600 * 1000),
    };
    const mockProvider = { exchangeCodeForTokens: vi.fn().mockResolvedValue(tokens) };
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue(mockProvider);

    db.emailAccount.findUnique = vi.fn().mockResolvedValue(null);
    db.emailAccount.updateMany = vi.fn().mockResolvedValue({ count: 0 });
    db.emailAccount.create = vi.fn().mockResolvedValue(makeAccount({ id: 'acc-new' }));

    await connectAccount(db, 'gmail', 'my-auth-code', 'new@example.com');

    expect(mockProvider.exchangeCodeForTokens).toHaveBeenCalledWith('my-auth-code');
  });

  it('creates the account with isActive: true and correct provider', async () => {
    const db = makeMockDb();
    const expiresAt = new Date(Date.now() + 3600 * 1000);
    const tokens = { accessToken: 'at', refreshToken: 'rt', expiresAt };
    const mockProvider = { exchangeCodeForTokens: vi.fn().mockResolvedValue(tokens) };
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue(mockProvider);

    db.emailAccount.findUnique = vi.fn().mockResolvedValue(null);
    db.emailAccount.updateMany = vi.fn().mockResolvedValue({ count: 0 });
    db.emailAccount.create = vi.fn().mockResolvedValue(makeAccount({ id: 'acc-new' }));

    await connectAccount(db, 'gmail', 'code', 'new@example.com');

    expect(db.emailAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: 'GMAIL',
        email: 'new@example.com',
        accessToken: 'at',
        refreshToken: 'rt',
        tokenExpiresAt: expiresAt,
        isActive: true,
      }),
    });
  });

  it('invokes onActivity callback after account creation', async () => {
    const db = makeMockDb();
    const tokens = {
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: new Date(Date.now() + 3600 * 1000),
    };
    const mockProvider = { exchangeCodeForTokens: vi.fn().mockResolvedValue(tokens) };
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue(mockProvider);

    const created = makeAccount({ id: 'acc-new', email: 'new@example.com' });
    db.emailAccount.findUnique = vi.fn().mockResolvedValue(null);
    db.emailAccount.updateMany = vi.fn().mockResolvedValue({ count: 0 });
    db.emailAccount.create = vi.fn().mockResolvedValue(created);

    const onActivity = vi.fn();

    await connectAccount(db, 'gmail', 'code', 'new@example.com', { onActivity });

    expect(onActivity).toHaveBeenCalledOnce();
    expect(onActivity).toHaveBeenCalledWith(
      'EMAIL_ACCOUNT_CONNECTED',
      expect.stringContaining('new@example.com'),
      expect.objectContaining({ accountId: 'acc-new', email: 'new@example.com' })
    );
  });

  it('does not throw when callbacks are omitted', async () => {
    const db = makeMockDb();
    const tokens = {
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: new Date(Date.now() + 3600 * 1000),
    };
    const mockProvider = { exchangeCodeForTokens: vi.fn().mockResolvedValue(tokens) };
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue(mockProvider);

    db.emailAccount.findUnique = vi.fn().mockResolvedValue(null);
    db.emailAccount.updateMany = vi.fn().mockResolvedValue({ count: 0 });
    db.emailAccount.create = vi.fn().mockResolvedValue(makeAccount({ id: 'acc-new' }));

    await expect(
      connectAccount(db, 'gmail', 'code', 'new@example.com')
    ).resolves.not.toThrow();
  });

  it('does not call create when the email already exists', async () => {
    const db = makeMockDb();
    db.emailAccount.findUnique = vi.fn().mockResolvedValue(makeAccount());

    await connectAccount(db, 'gmail', 'code', 'user@example.com').catch(() => {});

    expect(db.emailAccount.create).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// disconnectAccount
// ===========================================================================

describe('disconnectAccount', () => {
  it('deletes the account when it exists', async () => {
    const db = makeMockDb();
    const account = makeAccount();
    db.emailAccount.findUnique = vi.fn().mockResolvedValue(account);
    db.emailAccount.delete = vi.fn().mockResolvedValue(account);

    await disconnectAccount(db, 'acc-1');

    expect(db.emailAccount.delete).toHaveBeenCalledWith({ where: { id: 'acc-1' } });
  });

  it('throws EmailAccountNotFoundError when account does not exist', async () => {
    const db = makeMockDb();
    db.emailAccount.findUnique = vi.fn().mockResolvedValue(null);

    await expect(disconnectAccount(db, 'ghost-id')).rejects.toThrow(EmailAccountNotFoundError);
  });

  it('has the correct error name when account is not found', async () => {
    const db = makeMockDb();
    db.emailAccount.findUnique = vi.fn().mockResolvedValue(null);

    const err = await disconnectAccount(db, 'ghost-id').catch((e) => e);

    expect(err.name).toBe('EmailAccountNotFoundError');
  });

  it('includes the account ID in the not-found error message', async () => {
    const db = makeMockDb();
    db.emailAccount.findUnique = vi.fn().mockResolvedValue(null);

    const err = await disconnectAccount(db, 'missing-acc-id').catch((e) => e);

    expect(err.message).toContain('missing-acc-id');
  });

  it('does not call delete when account is not found', async () => {
    const db = makeMockDb();
    db.emailAccount.findUnique = vi.fn().mockResolvedValue(null);

    await disconnectAccount(db, 'ghost-id').catch(() => {});

    expect(db.emailAccount.delete).not.toHaveBeenCalled();
  });

  it('invokes onActivity callback after deletion', async () => {
    const db = makeMockDb();
    const account = makeAccount({ id: 'acc-1', email: 'user@example.com' });
    db.emailAccount.findUnique = vi.fn().mockResolvedValue(account);
    db.emailAccount.delete = vi.fn().mockResolvedValue(account);

    const onActivity = vi.fn();

    await disconnectAccount(db, 'acc-1', { onActivity });

    expect(onActivity).toHaveBeenCalledOnce();
    expect(onActivity).toHaveBeenCalledWith(
      'EMAIL_ACCOUNT_DISCONNECTED',
      expect.stringContaining('user@example.com'),
      expect.objectContaining({ accountId: 'acc-1', email: 'user@example.com' })
    );
  });

  it('does not throw when callbacks are omitted', async () => {
    const db = makeMockDb();
    const account = makeAccount();
    db.emailAccount.findUnique = vi.fn().mockResolvedValue(account);
    db.emailAccount.delete = vi.fn().mockResolvedValue(account);

    await expect(disconnectAccount(db, 'acc-1')).resolves.toBeUndefined();
  });

  it('looks up the account by the provided account ID', async () => {
    const db = makeMockDb();
    const account = makeAccount({ id: 'acc-42' });
    db.emailAccount.findUnique = vi.fn().mockResolvedValue(account);
    db.emailAccount.delete = vi.fn().mockResolvedValue(account);

    await disconnectAccount(db, 'acc-42');

    expect(db.emailAccount.findUnique).toHaveBeenCalledWith({ where: { id: 'acc-42' } });
  });
});
