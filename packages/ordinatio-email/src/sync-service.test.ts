// ===========================================
// EMAIL ENGINE — SYNC SERVICE TESTS
// Covers: sync-service.ts
// ===========================================

import type { PrismaClient } from '@prisma/client';
import { syncEmails, logSyncFailure } from './sync-service';
import { EmailAccountNotFoundError } from './types';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('./providers', () => ({
  getProvider: vi.fn(),
}));

vi.mock('./account-queries', () => ({
  getActiveAccount: vi.fn(),
  getValidAccessToken: vi.fn(),
  updateSyncTimestamp: vi.fn(),
}));

// Import after vi.mock so we get the mocked versions
import { getProvider } from './providers';
import { getActiveAccount, getValidAccessToken, updateSyncTimestamp } from './account-queries';

// ---------------------------------------------------------------------------
// Mock DB factory
// ---------------------------------------------------------------------------

function makeMockDb() {
  return {
    emailMessage: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    client: {
      findFirst: vi.fn(),
    },
    clientEmailAddress: {
      findFirst: vi.fn(),
    },
  } as unknown as PrismaClient;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_ACCOUNT = {
  id: 'acct-1',
  provider: 'Gmail',
  lastSyncAt: null,
  syncCursor: null,
};

const BASE_MESSAGE = {
  providerId: 'msg-provider-001',
  threadId: 'thread-42',
  subject: 'Re: Your suit fitting',
  fromEmail: 'client@example.com',
  fromName: 'John Client',
  toEmail: 'tailor@1701bespoke.com',
  snippet: 'Looking forward to it!',
  date: new Date('2026-03-01T10:00:00Z'),
  hasAttachments: false,
};

const BASE_CREATED_EMAIL = {
  id: 'email-db-001',
  accountId: 'acct-1',
  providerId: 'msg-provider-001',
  threadId: 'thread-42',
  subject: 'Re: Your suit fitting',
  fromEmail: 'client@example.com',
  fromName: 'John Client',
  toEmail: 'tailor@1701bespoke.com',
  snippet: 'Looking forward to it!',
  emailDate: new Date('2026-03-01T10:00:00Z'),
  status: 'INBOX',
  clientId: null,
};

function makeProvider(messages = [BASE_MESSAGE], nextCursor?: string) {
  return {
    listMessages: vi.fn().mockResolvedValue({
      messages,
      nextCursor,
    }),
  };
}

// ===========================================================================
// syncEmails
// ===========================================================================

describe('syncEmails', () => {
  let db: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = makeMockDb();
    vi.mocked(getActiveAccount).mockResolvedValue(BASE_ACCOUNT as never);
    vi.mocked(getValidAccessToken).mockResolvedValue('access-token-xyz');
    vi.mocked(updateSyncTimestamp).mockResolvedValue(undefined);

    const provider = makeProvider();
    vi.mocked(getProvider).mockReturnValue(provider as never);

    // By default: no existing message, no client match, no address book match
    (db.emailMessage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (db.client.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (db.clientEmailAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (db.emailMessage.create as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_CREATED_EMAIL);
  });

  // -------------------------------------------------------------------------
  // Happy path — fetches messages, creates new emails, auto-links by primary email
  // -------------------------------------------------------------------------

  it('fetches messages from the provider using the account access token', async () => {
    const provider = makeProvider([BASE_MESSAGE]);
    vi.mocked(getProvider).mockReturnValue(provider as never);

    await syncEmails(db);

    expect(getValidAccessToken).toHaveBeenCalledWith(db, 'acct-1');
    expect(provider.listMessages).toHaveBeenCalledWith('access-token-xyz', {
      after: undefined,
      cursor: undefined,
      maxResults: 50,
    });
  });

  it('passes lastSyncAt and syncCursor from the account to the provider', async () => {
    const lastSync = new Date('2026-02-28T00:00:00Z');
    vi.mocked(getActiveAccount).mockResolvedValue({
      ...BASE_ACCOUNT,
      lastSyncAt: lastSync,
      syncCursor: 'cursor-abc',
    } as never);

    const provider = makeProvider([]);
    vi.mocked(getProvider).mockReturnValue(provider as never);

    await syncEmails(db);

    expect(provider.listMessages).toHaveBeenCalledWith('access-token-xyz', {
      after: lastSync,
      cursor: 'cursor-abc',
      maxResults: 50,
    });
  });

  it('creates a new email record for each new message', async () => {
    await syncEmails(db);

    expect(db.emailMessage.create).toHaveBeenCalledOnce();
    expect(db.emailMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'acct-1',
        providerId: 'msg-provider-001',
        threadId: 'thread-42',
        subject: 'Re: Your suit fitting',
        fromEmail: 'client@example.com',
        fromName: 'John Client',
        toEmail: 'tailor@1701bespoke.com',
        snippet: 'Looking forward to it!',
        emailDate: BASE_MESSAGE.date,
        status: 'INBOX',
      }),
    });
  });

  it('auto-links to client when primary email matches', async () => {
    (db.client.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'client-99' });

    await syncEmails(db);

    expect(db.emailMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clientId: 'client-99' }),
    });
  });

  it('returns synced count equal to the number of new messages created', async () => {
    const messages = [
      { ...BASE_MESSAGE, providerId: 'p-1' },
      { ...BASE_MESSAGE, providerId: 'p-2' },
      { ...BASE_MESSAGE, providerId: 'p-3' },
    ];
    vi.mocked(getProvider).mockReturnValue(makeProvider(messages) as never);
    (db.emailMessage.create as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_CREATED_EMAIL);

    const result = await syncEmails(db);

    expect(result.synced).toBe(3);
    expect(result.total).toBe(3);
  });

  it('returns total reflecting all messages from the provider including skipped ones', async () => {
    const messages = [
      { ...BASE_MESSAGE, providerId: 'p-1' },
      { ...BASE_MESSAGE, providerId: 'p-2' },
    ];
    vi.mocked(getProvider).mockReturnValue(makeProvider(messages) as never);

    // First message already exists, second is new
    (db.emailMessage.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ id: 'existing' })
      .mockResolvedValueOnce(null);

    const result = await syncEmails(db);

    expect(result.synced).toBe(1);
    expect(result.total).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Skips existing messages
  // -------------------------------------------------------------------------

  it('skips a message that already exists in the database', async () => {
    (db.emailMessage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'email-db-001',
    });

    const result = await syncEmails(db);

    expect(db.emailMessage.create).not.toHaveBeenCalled();
    expect(result.synced).toBe(0);
    expect(result.total).toBe(1);
  });

  it('checks for existing messages using accountId + providerId', async () => {
    (db.emailMessage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'email-db-001',
    });

    await syncEmails(db);

    expect(db.emailMessage.findFirst).toHaveBeenCalledWith({
      where: {
        accountId: 'acct-1',
        providerId: 'msg-provider-001',
      },
    });
  });

  it('creates only the messages that do not exist yet in a mixed batch', async () => {
    const messages = [
      { ...BASE_MESSAGE, providerId: 'existing-p' },
      { ...BASE_MESSAGE, providerId: 'new-p' },
    ];
    vi.mocked(getProvider).mockReturnValue(makeProvider(messages) as never);

    (db.emailMessage.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ id: 'already-in-db' })  // first message: exists
      .mockResolvedValueOnce(null);                      // second message: new

    await syncEmails(db);

    expect(db.emailMessage.create).toHaveBeenCalledOnce();
    expect(db.emailMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ providerId: 'new-p' }),
      })
    );
  });

  // -------------------------------------------------------------------------
  // clientEmailAddress table fallback
  // -------------------------------------------------------------------------

  it('tries clientEmailAddress when primary email lookup returns no client', async () => {
    (db.client.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (db.clientEmailAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      clientId: 'client-via-address-book',
    });

    await syncEmails(db);

    expect(db.clientEmailAddress.findFirst).toHaveBeenCalledWith({
      where: {
        email: {
          equals: 'client@example.com',
          mode: 'insensitive',
        },
      },
      select: { clientId: true },
    });

    expect(db.emailMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clientId: 'client-via-address-book' }),
    });
  });

  it('does not query clientEmailAddress when primary email already matched a client', async () => {
    (db.client.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'client-primary' });

    await syncEmails(db);

    expect(db.clientEmailAddress.findFirst).not.toHaveBeenCalled();
    expect(db.emailMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clientId: 'client-primary' }),
    });
  });

  it('stores clientId as null when neither primary email nor address book finds a match', async () => {
    (db.client.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (db.clientEmailAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await syncEmails(db);

    expect(db.emailMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clientId: null }),
    });
  });

  // -------------------------------------------------------------------------
  // resolveContact callback fallback
  // -------------------------------------------------------------------------

  it('calls resolveContact callback when both email lookups fail to find a client', async () => {
    (db.client.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (db.clientEmailAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const resolveContact = vi.fn().mockResolvedValue({ id: 'contact-1', clientId: 'client-from-contact' });
    await syncEmails(db, { resolveContact });

    expect(resolveContact).toHaveBeenCalledWith(db, 'client@example.com', 'John Client');
    expect(db.emailMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clientId: 'client-from-contact' }),
    });
  });

  it('does not call resolveContact when primary email lookup succeeds', async () => {
    (db.client.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'client-primary' });

    const resolveContact = vi.fn();
    await syncEmails(db, { resolveContact });

    expect(resolveContact).not.toHaveBeenCalled();
  });

  it('does not call resolveContact when clientEmailAddress lookup succeeds', async () => {
    (db.client.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (db.clientEmailAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      clientId: 'client-via-address',
    });

    const resolveContact = vi.fn();
    await syncEmails(db, { resolveContact });

    expect(resolveContact).not.toHaveBeenCalled();
  });

  it('uses clientId from resolveContact result when contact has a linked client', async () => {
    (db.client.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (db.clientEmailAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const resolveContact = vi.fn().mockResolvedValue({ id: 'contact-2', clientId: 'client-99' });
    await syncEmails(db, { resolveContact });

    expect(db.emailMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clientId: 'client-99' }),
    });
  });

  it('ignores a null clientId from the resolveContact result', async () => {
    (db.client.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (db.clientEmailAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const resolveContact = vi.fn().mockResolvedValue({ id: 'contact-3', clientId: null });
    await syncEmails(db, { resolveContact });

    expect(db.emailMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clientId: null }),
    });
  });

  it('continues sync when resolveContact callback throws — contact resolution is non-critical', async () => {
    (db.client.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (db.clientEmailAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const resolveContact = vi.fn().mockRejectedValue(new Error('contact service down'));
    await expect(syncEmails(db, { resolveContact })).resolves.toBeDefined();

    // Email is still created, just without a client link
    expect(db.emailMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clientId: null }),
    });
  });

  // -------------------------------------------------------------------------
  // EmailAccountNotFoundError
  // -------------------------------------------------------------------------

  it('throws EmailAccountNotFoundError when no active account is found', async () => {
    vi.mocked(getActiveAccount).mockResolvedValue(null);

    await expect(syncEmails(db)).rejects.toThrow(EmailAccountNotFoundError);
  });

  it('throws EmailAccountNotFoundError with the default message when account is missing', async () => {
    vi.mocked(getActiveAccount).mockResolvedValue(null);

    await expect(syncEmails(db)).rejects.toThrow('No email account configured');
  });

  it('EmailAccountNotFoundError is a subclass of Error', async () => {
    vi.mocked(getActiveAccount).mockResolvedValue(null);

    await expect(syncEmails(db)).rejects.toBeInstanceOf(Error);
  });

  it('does not call getProvider or listMessages when no account is found', async () => {
    vi.mocked(getActiveAccount).mockResolvedValue(null);

    await expect(syncEmails(db)).rejects.toThrow(EmailAccountNotFoundError);
    expect(getProvider).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Events and onEmailSynced callback
  // -------------------------------------------------------------------------

  it('emits an email.received event for each new message synced', async () => {
    (db.client.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'client-99' });

    const onEvent = vi.fn();
    await syncEmails(db, { onEvent });

    expect(onEvent).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledWith({
      eventType: 'email.received',
      entityType: 'EmailMessage',
      entityId: 'email-db-001',
      data: {
        subject: 'Re: Your suit fitting',
        fromEmail: 'client@example.com',
        fromName: 'John Client',
        clientId: 'client-99',
      },
    });
  });

  it('does not emit events for skipped (already-existing) messages', async () => {
    (db.emailMessage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'existing' });

    const onEvent = vi.fn();
    await syncEmails(db, { onEvent });

    expect(onEvent).not.toHaveBeenCalled();
  });

  it('calls onEmailSynced callback with the created email data', async () => {
    (db.client.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'client-99' });

    const onEmailSynced = vi.fn().mockResolvedValue(undefined);
    await syncEmails(db, { onEmailSynced });

    expect(onEmailSynced).toHaveBeenCalledOnce();
    expect(onEmailSynced).toHaveBeenCalledWith(db, {
      id: 'email-db-001',
      subject: 'Re: Your suit fitting',
      bodyText: 'Looking forward to it!',
      fromEmail: 'client@example.com',
      clientId: 'client-99',
    });
  });

  it('does not call onEmailSynced for skipped messages', async () => {
    (db.emailMessage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'existing' });

    const onEmailSynced = vi.fn();
    await syncEmails(db, { onEmailSynced });

    expect(onEmailSynced).not.toHaveBeenCalled();
  });

  it('continues sync when onEmailSynced throws — context extraction is non-critical', async () => {
    const onEmailSynced = vi.fn().mockRejectedValue(new Error('context extraction failed'));

    const result = await syncEmails(db, { onEmailSynced });

    expect(result.synced).toBe(1);
  });

  it('calls both onEvent and onEmailSynced for each new message', async () => {
    const onEvent = vi.fn();
    const onEmailSynced = vi.fn().mockResolvedValue(undefined);

    await syncEmails(db, { onEvent, onEmailSynced });

    expect(onEvent).toHaveBeenCalledOnce();
    expect(onEmailSynced).toHaveBeenCalledOnce();
  });

  it('does not throw when no callbacks are provided', async () => {
    await expect(syncEmails(db)).resolves.toBeDefined();
  });

  // -------------------------------------------------------------------------
  // updateSyncTimestamp
  // -------------------------------------------------------------------------

  it('calls updateSyncTimestamp after processing all messages', async () => {
    await syncEmails(db);

    expect(updateSyncTimestamp).toHaveBeenCalledWith(db, 'acct-1', undefined);
  });

  it('passes the nextCursor from the provider result to updateSyncTimestamp', async () => {
    vi.mocked(getProvider).mockReturnValue(makeProvider([BASE_MESSAGE], 'next-page-cursor') as never);

    await syncEmails(db);

    expect(updateSyncTimestamp).toHaveBeenCalledWith(db, 'acct-1', 'next-page-cursor');
  });

  it('always calls updateSyncTimestamp even when no new messages were found', async () => {
    vi.mocked(getProvider).mockReturnValue(makeProvider([]) as never);

    await syncEmails(db);

    expect(updateSyncTimestamp).toHaveBeenCalledOnce();
  });

  it('always calls updateSyncTimestamp even when all messages are skipped', async () => {
    (db.emailMessage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'existing' });

    await syncEmails(db);

    expect(updateSyncTimestamp).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // onActivity callback
  // -------------------------------------------------------------------------

  it('calls onActivity with EMAIL_SYNCED when at least one message was synced', async () => {
    const onActivity = vi.fn();
    await syncEmails(db, { onActivity });

    expect(onActivity).toHaveBeenCalledWith(
      'EMAIL_SYNCED',
      expect.stringContaining('1'),
      expect.objectContaining({ synced: 1, accountId: 'acct-1' })
    );
  });

  it('does not call onActivity when no new messages were synced', async () => {
    vi.mocked(getProvider).mockReturnValue(makeProvider([]) as never);

    const onActivity = vi.fn();
    await syncEmails(db, { onActivity });

    expect(onActivity).not.toHaveBeenCalled();
  });

  it('does not call onActivity when all messages were already existing', async () => {
    (db.emailMessage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'existing' });

    const onActivity = vi.fn();
    await syncEmails(db, { onActivity });

    expect(onActivity).not.toHaveBeenCalled();
  });

  it('includes the correct synced count in the onActivity metadata', async () => {
    const messages = [
      { ...BASE_MESSAGE, providerId: 'p-1' },
      { ...BASE_MESSAGE, providerId: 'p-2' },
    ];
    vi.mocked(getProvider).mockReturnValue(makeProvider(messages) as never);
    (db.emailMessage.create as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_CREATED_EMAIL);

    const onActivity = vi.fn();
    await syncEmails(db, { onActivity });

    expect(onActivity).toHaveBeenCalledWith(
      'EMAIL_SYNCED',
      expect.any(String),
      expect.objectContaining({ synced: 2 })
    );
  });
});

// ===========================================================================
// logSyncFailure
// ===========================================================================

describe('logSyncFailure', () => {
  it('calls onActivity with EMAIL_SYNC_FAILED action', async () => {
    const onActivity = vi.fn();
    await logSyncFailure(new Error('connection refused'), { onActivity });

    expect(onActivity).toHaveBeenCalledWith(
      'EMAIL_SYNC_FAILED',
      expect.any(String),
      expect.any(Object)
    );
  });

  it('formats the description using the error message', async () => {
    const onActivity = vi.fn();
    await logSyncFailure(new Error('connection refused'), { onActivity });

    expect(onActivity).toHaveBeenCalledWith(
      'EMAIL_SYNC_FAILED',
      expect.stringContaining('connection refused'),
      expect.any(Object)
    );
  });

  it('includes the error message string in the metadata', async () => {
    const onActivity = vi.fn();
    await logSyncFailure(new Error('timeout after 30s'), { onActivity });

    expect(onActivity).toHaveBeenCalledWith(
      'EMAIL_SYNC_FAILED',
      expect.any(String),
      expect.objectContaining({ error: 'timeout after 30s' })
    );
  });

  it('handles non-Error objects gracefully, using "Unknown error" as the message', async () => {
    const onActivity = vi.fn();
    await logSyncFailure('something went wrong', { onActivity });

    expect(onActivity).toHaveBeenCalledWith(
      'EMAIL_SYNC_FAILED',
      expect.stringContaining('Unknown error'),
      expect.objectContaining({ error: 'Unknown error' })
    );
  });

  it('handles null thrown value with "Unknown error"', async () => {
    const onActivity = vi.fn();
    await logSyncFailure(null, { onActivity });

    expect(onActivity).toHaveBeenCalledWith(
      'EMAIL_SYNC_FAILED',
      expect.stringContaining('Unknown error'),
      expect.objectContaining({ error: 'Unknown error' })
    );
  });

  it('does not throw when no callbacks are provided', async () => {
    await expect(logSyncFailure(new Error('oops'))).resolves.toBeUndefined();
  });

  it('returns undefined (void) on success', async () => {
    const onActivity = vi.fn();
    const result = await logSyncFailure(new Error('some error'), { onActivity });

    expect(result).toBeUndefined();
  });
});
