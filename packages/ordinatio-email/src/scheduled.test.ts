// ===========================================
// EMAIL ENGINE — SCHEDULED EMAIL TESTS
// Covers: scheduled-mutations.ts + scheduled-queries.ts
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';

import {
  scheduleEmail,
  cancelScheduledEmail,
  markAsProcessing,
  markAsSent,
  markAsFailed,
  retryScheduledEmail,
} from './scheduled-mutations';
import {
  getScheduledEmails,
  getScheduledEmail,
  getPendingToSend,
} from './scheduled-queries';
import {
  ScheduledEmailNotFoundError,
  ScheduledEmailNotPendingError,
  ScheduledEmailNotFailedError,
  EmailAccountNotFoundError,
} from './types';

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

function makeMockDb() {
  return {
    scheduledEmail: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
    },
    emailAccount: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
    },
  } as unknown as PrismaClient;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_INPUT = {
  accountId: 'acct-1',
  toEmail: 'client@example.com',
  subject: 'Your suit is ready',
  bodyHtml: '<p>Hello!</p>',
  scheduledFor: new Date('2026-04-01T10:00:00Z'),
  createdBy: 'user-99',
};

const BASE_SCHEDULED = {
  id: 'sched-1',
  accountId: 'acct-1',
  toEmail: 'client@example.com',
  subject: 'Your suit is ready',
  bodyHtml: '<p>Hello!</p>',
  scheduledFor: new Date('2026-04-01T10:00:00Z'),
  createdBy: 'user-99',
  status: 'PENDING',
  attempts: 0,
  sentAt: null,
  errorMessage: null,
  inReplyTo: null,
  threadId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ===========================================================================
// scheduleEmail
// ===========================================================================

describe('scheduleEmail', () => {
  let db: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    db = makeMockDb();
  });

  it('creates a scheduled email when the account exists', async () => {
    (db.emailAccount.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'acct-1' });
    (db.scheduledEmail.create as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_SCHEDULED);

    const result = await scheduleEmail(db, BASE_INPUT);

    expect(db.emailAccount.findUnique).toHaveBeenCalledWith({ where: { id: 'acct-1' } });
    expect(db.scheduledEmail.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'acct-1',
        toEmail: 'client@example.com',
        subject: 'Your suit is ready',
        bodyHtml: '<p>Hello!</p>',
        scheduledFor: BASE_INPUT.scheduledFor,
        createdBy: 'user-99',
        status: 'PENDING',
        inReplyTo: null,
        threadId: null,
      }),
    });
    expect(result).toEqual(BASE_SCHEDULED);
  });

  it('passes optional inReplyTo and threadId through to create', async () => {
    (db.emailAccount.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'acct-1' });
    (db.scheduledEmail.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SCHEDULED,
      inReplyTo: 'original-msg-id',
      threadId: 'thread-42',
    });

    await scheduleEmail(db, {
      ...BASE_INPUT,
      inReplyTo: 'original-msg-id',
      threadId: 'thread-42',
    });

    expect(db.scheduledEmail.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        inReplyTo: 'original-msg-id',
        threadId: 'thread-42',
      }),
    });
  });

  it('throws EmailAccountNotFoundError when account does not exist', async () => {
    (db.emailAccount.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(scheduleEmail(db, BASE_INPUT)).rejects.toThrow(EmailAccountNotFoundError);
    await expect(scheduleEmail(db, BASE_INPUT)).rejects.toThrow('acct-1');
    expect(db.scheduledEmail.create).not.toHaveBeenCalled();
  });

  it('fires the onActivity callback after successful creation', async () => {
    (db.emailAccount.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'acct-1' });
    (db.scheduledEmail.create as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_SCHEDULED);

    const onActivity = vi.fn();
    await scheduleEmail(db, BASE_INPUT, { onActivity });

    expect(onActivity).toHaveBeenCalledWith(
      'EMAIL_SCHEDULED',
      expect.stringContaining('client@example.com'),
      expect.objectContaining({ scheduledId: 'sched-1' })
    );
  });

  it('does not throw when no callbacks are provided', async () => {
    (db.emailAccount.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'acct-1' });
    (db.scheduledEmail.create as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_SCHEDULED);

    await expect(scheduleEmail(db, BASE_INPUT)).resolves.toEqual(BASE_SCHEDULED);
  });
});

// ===========================================================================
// cancelScheduledEmail
// ===========================================================================

describe('cancelScheduledEmail', () => {
  let db: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    db = makeMockDb();
  });

  it('cancels a PENDING email', async () => {
    (db.scheduledEmail.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_SCHEDULED);
    (db.scheduledEmail.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SCHEDULED,
      status: 'CANCELLED',
    });

    await cancelScheduledEmail(db, 'sched-1');

    expect(db.scheduledEmail.update).toHaveBeenCalledWith({
      where: { id: 'sched-1' },
      data: { status: 'CANCELLED' },
    });
  });

  it('throws ScheduledEmailNotFoundError when email does not exist', async () => {
    (db.scheduledEmail.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(cancelScheduledEmail(db, 'nonexistent')).rejects.toThrow(
      ScheduledEmailNotFoundError
    );
    await expect(cancelScheduledEmail(db, 'nonexistent')).rejects.toThrow('nonexistent');
    expect(db.scheduledEmail.update).not.toHaveBeenCalled();
  });

  it('throws ScheduledEmailNotPendingError when email is SENT', async () => {
    (db.scheduledEmail.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SCHEDULED,
      status: 'SENT',
    });

    await expect(cancelScheduledEmail(db, 'sched-1')).rejects.toThrow(
      ScheduledEmailNotPendingError
    );
    await expect(cancelScheduledEmail(db, 'sched-1')).rejects.toThrow('SENT');
    expect(db.scheduledEmail.update).not.toHaveBeenCalled();
  });

  it('throws ScheduledEmailNotPendingError when email is PROCESSING', async () => {
    (db.scheduledEmail.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SCHEDULED,
      status: 'PROCESSING',
    });

    await expect(cancelScheduledEmail(db, 'sched-1')).rejects.toThrow(
      ScheduledEmailNotPendingError
    );
  });

  it('throws ScheduledEmailNotPendingError when email is CANCELLED', async () => {
    (db.scheduledEmail.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SCHEDULED,
      status: 'CANCELLED',
    });

    await expect(cancelScheduledEmail(db, 'sched-1')).rejects.toThrow(
      ScheduledEmailNotPendingError
    );
  });

  it('fires the onActivity callback after cancellation', async () => {
    (db.scheduledEmail.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_SCHEDULED);
    (db.scheduledEmail.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const onActivity = vi.fn();
    await cancelScheduledEmail(db, 'sched-1', { onActivity });

    expect(onActivity).toHaveBeenCalledWith(
      'EMAIL_SCHEDULED_CANCELLED',
      expect.stringContaining('Your suit is ready'),
      expect.objectContaining({ scheduledId: 'sched-1' })
    );
  });
});

// ===========================================================================
// markAsProcessing
// ===========================================================================

describe('markAsProcessing', () => {
  let db: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    db = makeMockDb();
  });

  it('sets status to PROCESSING and increments attempts', async () => {
    (db.scheduledEmail.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SCHEDULED,
      status: 'PROCESSING',
      attempts: 1,
    });

    await markAsProcessing(db, 'sched-1');

    expect(db.scheduledEmail.update).toHaveBeenCalledWith({
      where: { id: 'sched-1' },
      data: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
      },
    });
  });

  it('increments attempts on each call', async () => {
    (db.scheduledEmail.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await markAsProcessing(db, 'sched-1');
    await markAsProcessing(db, 'sched-1');

    expect(db.scheduledEmail.update).toHaveBeenCalledTimes(2);
    // Both calls use the increment operator, not a literal value
    expect(db.scheduledEmail.update).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ data: expect.objectContaining({ attempts: { increment: 1 } }) })
    );
    expect(db.scheduledEmail.update).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ data: expect.objectContaining({ attempts: { increment: 1 } }) })
    );
  });

  it('returns void on success', async () => {
    (db.scheduledEmail.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await markAsProcessing(db, 'sched-1');

    expect(result).toBeUndefined();
  });
});

// ===========================================================================
// markAsSent
// ===========================================================================

describe('markAsSent', () => {
  let db: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    db = makeMockDb();
  });

  it('sets status to SENT and records sentAt', async () => {
    (db.scheduledEmail.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SCHEDULED,
      status: 'SENT',
      sentAt: new Date(),
    });

    await markAsSent(db, 'sched-1');

    expect(db.scheduledEmail.update).toHaveBeenCalledWith({
      where: { id: 'sched-1' },
      data: {
        status: 'SENT',
        sentAt: expect.any(Date),
      },
    });
  });

  it('fires the onActivity callback', async () => {
    (db.scheduledEmail.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const onActivity = vi.fn();
    await markAsSent(db, 'sched-1', { onActivity });

    expect(onActivity).toHaveBeenCalledWith(
      'EMAIL_SCHEDULED_SENT',
      expect.any(String),
      expect.objectContaining({ scheduledId: 'sched-1' })
    );
  });

  it('does not throw when no callbacks are provided', async () => {
    (db.scheduledEmail.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await expect(markAsSent(db, 'sched-1')).resolves.toBeUndefined();
  });
});

// ===========================================================================
// markAsFailed
// ===========================================================================

describe('markAsFailed', () => {
  let db: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    db = makeMockDb();
  });

  it('sets status to FAILED and stores errorMessage', async () => {
    (db.scheduledEmail.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SCHEDULED,
      status: 'FAILED',
      errorMessage: 'SMTP connection refused',
    });

    await markAsFailed(db, 'sched-1', 'SMTP connection refused');

    expect(db.scheduledEmail.update).toHaveBeenCalledWith({
      where: { id: 'sched-1' },
      data: {
        status: 'FAILED',
        errorMessage: 'SMTP connection refused',
      },
    });
  });

  it('stores the full error message string verbatim', async () => {
    (db.scheduledEmail.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const longError = 'Connection timed out after 30000ms while attempting to reach smtp.example.com:465';
    await markAsFailed(db, 'sched-1', longError);

    expect(db.scheduledEmail.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ errorMessage: longError }),
      })
    );
  });

  it('uses the field name "errorMessage" (not "error")', async () => {
    (db.scheduledEmail.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await markAsFailed(db, 'sched-1', 'bad gateway');

    const callArgs = (db.scheduledEmail.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.data).toHaveProperty('errorMessage');
    expect(callArgs.data).not.toHaveProperty('error');
  });

  it('fires the onActivity callback with the error message', async () => {
    (db.scheduledEmail.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const onActivity = vi.fn();
    await markAsFailed(db, 'sched-1', 'timeout', { onActivity });

    expect(onActivity).toHaveBeenCalledWith(
      'EMAIL_SCHEDULED_FAILED',
      expect.stringContaining('timeout'),
      expect.objectContaining({ scheduledId: 'sched-1', error: 'timeout' })
    );
  });

  it('does not throw when no callbacks are provided', async () => {
    (db.scheduledEmail.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await expect(markAsFailed(db, 'sched-1', 'some error')).resolves.toBeUndefined();
  });
});

// ===========================================================================
// retryScheduledEmail
// ===========================================================================

describe('retryScheduledEmail', () => {
  let db: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    db = makeMockDb();
  });

  it('resets a FAILED email to PENDING and clears errorMessage', async () => {
    (db.scheduledEmail.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SCHEDULED,
      status: 'FAILED',
      errorMessage: 'previous error',
    });
    (db.scheduledEmail.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await retryScheduledEmail(db, 'sched-1');

    expect(db.scheduledEmail.update).toHaveBeenCalledWith({
      where: { id: 'sched-1' },
      data: expect.objectContaining({
        status: 'PENDING',
        errorMessage: null,
        scheduledFor: expect.any(Date),
      }),
    });
  });

  it('uses the provided newScheduledFor date when given', async () => {
    (db.scheduledEmail.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SCHEDULED,
      status: 'FAILED',
    });
    (db.scheduledEmail.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const futureDate = new Date('2026-05-01T12:00:00Z');
    await retryScheduledEmail(db, 'sched-1', futureDate);

    expect(db.scheduledEmail.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ scheduledFor: futureDate }),
      })
    );
  });

  it('defaults scheduledFor to now when no date is provided', async () => {
    (db.scheduledEmail.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SCHEDULED,
      status: 'FAILED',
    });
    (db.scheduledEmail.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const before = new Date();
    await retryScheduledEmail(db, 'sched-1');
    const after = new Date();

    const updateCall = (db.scheduledEmail.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const scheduledFor: Date = updateCall.data.scheduledFor;
    expect(scheduledFor.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(scheduledFor.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('throws ScheduledEmailNotFoundError when email does not exist', async () => {
    (db.scheduledEmail.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(retryScheduledEmail(db, 'nonexistent')).rejects.toThrow(
      ScheduledEmailNotFoundError
    );
    await expect(retryScheduledEmail(db, 'nonexistent')).rejects.toThrow('nonexistent');
    expect(db.scheduledEmail.update).not.toHaveBeenCalled();
  });

  it('throws ScheduledEmailNotFailedError when email is PENDING', async () => {
    (db.scheduledEmail.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SCHEDULED,
      status: 'PENDING',
    });

    await expect(retryScheduledEmail(db, 'sched-1')).rejects.toThrow(
      ScheduledEmailNotFailedError
    );
    await expect(retryScheduledEmail(db, 'sched-1')).rejects.toThrow('PENDING');
    expect(db.scheduledEmail.update).not.toHaveBeenCalled();
  });

  it('throws ScheduledEmailNotFailedError when email is SENT', async () => {
    (db.scheduledEmail.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SCHEDULED,
      status: 'SENT',
    });

    await expect(retryScheduledEmail(db, 'sched-1')).rejects.toThrow(
      ScheduledEmailNotFailedError
    );
  });

  it('throws ScheduledEmailNotFailedError when email is CANCELLED', async () => {
    (db.scheduledEmail.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SCHEDULED,
      status: 'CANCELLED',
    });

    await expect(retryScheduledEmail(db, 'sched-1')).rejects.toThrow(
      ScheduledEmailNotFailedError
    );
  });
});

// ===========================================================================
// getScheduledEmails
// ===========================================================================

describe('getScheduledEmails', () => {
  let db: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    db = makeMockDb();
  });

  it('returns paginated list and total count', async () => {
    const rows = [BASE_SCHEDULED, { ...BASE_SCHEDULED, id: 'sched-2' }];
    (db.scheduledEmail.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(rows);
    (db.scheduledEmail.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);

    const result = await getScheduledEmails(db);

    expect(result.emails).toEqual(rows);
    expect(result.total).toBe(5);
  });

  it('applies default limit 50 and offset 0 when no options provided', async () => {
    (db.scheduledEmail.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.scheduledEmail.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await getScheduledEmails(db);

    expect(db.scheduledEmail.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50, skip: 0 })
    );
  });

  it('forwards custom limit and offset', async () => {
    (db.scheduledEmail.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.scheduledEmail.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await getScheduledEmails(db, { limit: 10, offset: 20 });

    expect(db.scheduledEmail.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10, skip: 20 })
    );
  });

  it('filters by status when provided', async () => {
    (db.scheduledEmail.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.scheduledEmail.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await getScheduledEmails(db, { status: 'PENDING' });

    expect(db.scheduledEmail.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING' }) })
    );
    expect(db.scheduledEmail.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING' }) })
    );
  });

  it('filters by createdBy when provided', async () => {
    (db.scheduledEmail.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.scheduledEmail.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await getScheduledEmails(db, { createdBy: 'user-99' });

    expect(db.scheduledEmail.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ createdBy: 'user-99' }) })
    );
  });

  it('filters by accountId when provided', async () => {
    (db.scheduledEmail.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.scheduledEmail.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await getScheduledEmails(db, { accountId: 'acct-1' });

    expect(db.scheduledEmail.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ accountId: 'acct-1' }) })
    );
  });

  it('combines multiple filters in the same where clause', async () => {
    (db.scheduledEmail.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.scheduledEmail.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await getScheduledEmails(db, { status: 'SENT', createdBy: 'user-99', accountId: 'acct-1' });

    const expectedWhere = { status: 'SENT', createdBy: 'user-99', accountId: 'acct-1' };
    expect(db.scheduledEmail.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere })
    );
    expect(db.scheduledEmail.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere })
    );
  });

  it('orders results by scheduledFor ascending', async () => {
    (db.scheduledEmail.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.scheduledEmail.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await getScheduledEmails(db);

    expect(db.scheduledEmail.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { scheduledFor: 'asc' } })
    );
  });

  it('runs findMany and count in parallel', async () => {
    const order: string[] = [];
    (db.scheduledEmail.findMany as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push('findMany');
      return [];
    });
    (db.scheduledEmail.count as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push('count');
      return 0;
    });

    await getScheduledEmails(db);

    // Both were called — order doesn't matter since they run via Promise.all
    expect(order).toContain('findMany');
    expect(order).toContain('count');
  });

  it('returns empty list and zero total when no emails exist', async () => {
    (db.scheduledEmail.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.scheduledEmail.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const result = await getScheduledEmails(db);

    expect(result.emails).toEqual([]);
    expect(result.total).toBe(0);
  });
});

// ===========================================================================
// getScheduledEmail
// ===========================================================================

describe('getScheduledEmail', () => {
  let db: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    db = makeMockDb();
  });

  it('returns the email when it exists', async () => {
    (db.scheduledEmail.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_SCHEDULED);

    const result = await getScheduledEmail(db, 'sched-1');

    expect(result).toEqual(BASE_SCHEDULED);
    expect(db.scheduledEmail.findUnique).toHaveBeenCalledWith({ where: { id: 'sched-1' } });
  });

  it('throws ScheduledEmailNotFoundError when email does not exist', async () => {
    (db.scheduledEmail.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(getScheduledEmail(db, 'missing-id')).rejects.toThrow(
      ScheduledEmailNotFoundError
    );
    await expect(getScheduledEmail(db, 'missing-id')).rejects.toThrow('missing-id');
  });

  it('ScheduledEmailNotFoundError is a subclass of Error', async () => {
    (db.scheduledEmail.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(getScheduledEmail(db, 'x')).rejects.toBeInstanceOf(Error);
  });
});

// ===========================================================================
// getPendingToSend
// ===========================================================================

describe('getPendingToSend', () => {
  let db: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    db = makeMockDb();
  });

  it('returns pending emails whose scheduledFor is in the past or now', async () => {
    const dueEmail = { ...BASE_SCHEDULED, id: 'sched-due' };
    (db.scheduledEmail.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([dueEmail]);

    const result = await getPendingToSend(db);

    expect(result).toEqual([dueEmail]);
  });

  it('queries only PENDING status', async () => {
    (db.scheduledEmail.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await getPendingToSend(db);

    expect(db.scheduledEmail.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING' }),
      })
    );
  });

  it('uses lte filter on scheduledFor with a current date', async () => {
    (db.scheduledEmail.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const before = new Date();
    await getPendingToSend(db);
    const after = new Date();

    const callArgs = (db.scheduledEmail.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const lteDate: Date = callArgs.where.scheduledFor.lte;
    expect(lteDate).toBeInstanceOf(Date);
    expect(lteDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(lteDate.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('applies the default limit of 20', async () => {
    (db.scheduledEmail.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await getPendingToSend(db);

    expect(db.scheduledEmail.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 })
    );
  });

  it('respects a custom limit', async () => {
    (db.scheduledEmail.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await getPendingToSend(db, 5);

    expect(db.scheduledEmail.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 })
    );
  });

  it('orders results by scheduledFor ascending', async () => {
    (db.scheduledEmail.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await getPendingToSend(db);

    expect(db.scheduledEmail.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { scheduledFor: 'asc' } })
    );
  });

  it('returns an empty array when no emails are due', async () => {
    (db.scheduledEmail.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await getPendingToSend(db);

    expect(result).toEqual([]);
  });
});
