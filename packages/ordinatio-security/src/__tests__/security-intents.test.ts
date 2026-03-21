// ===========================================
// Security Intents Tests
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import { resolveIntent, getPlaybookForIntent } from '../policy/security-intents';
import { SecurityIntent } from '../policy/policy-types';
import { createMockDb, createMockCallbacks, resetIdCounter } from './test-helpers';

describe('resolveIntent', () => {
  let db: ReturnType<typeof createMockDb>;
  let callbacks: ReturnType<typeof createMockCallbacks>;

  beforeEach(() => {
    resetIdCounter();
    db = createMockDb();
    callbacks = createMockCallbacks();
  });

  it('VERIFY_IDENTITY succeeds with valid principal', async () => {
    const result = await resolveIntent(
      SecurityIntent.VERIFY_IDENTITY,
      { principal: { principalId: 'user-1', principalType: 'user' } },
      db, callbacks
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain('user:user-1');
  });

  it('VERIFY_IDENTITY fails without principal', async () => {
    const result = await resolveIntent(
      SecurityIntent.VERIFY_IDENTITY,
      {},
      db, callbacks
    );
    expect(result.success).toBe(false);
  });

  it('EVALUATE_TRUST returns trust evaluation', async () => {
    const result = await resolveIntent(
      SecurityIntent.EVALUATE_TRUST,
      { trustInput: { signatureValid: true, dmarcStatus: 'pass' } },
      db, callbacks
    );
    expect(result.success).toBe(true);
    expect(result.data?.trustTier).toBeDefined();
    expect(result.data?.trustScore).toBeDefined();
  });

  it('EVALUATE_TRUST fails without input', async () => {
    const result = await resolveIntent(
      SecurityIntent.EVALUATE_TRUST,
      {},
      db, callbacks
    );
    expect(result.success).toBe(false);
  });

  it('APPROVE_HIGH_RISK always requires human', async () => {
    const result = await resolveIntent(
      SecurityIntent.APPROVE_HIGH_RISK,
      { reason: 'critical operation' },
      db, callbacks
    );
    expect(result.success).toBe(false); // Needs human
    expect(result.data?.requiresHuman).toBe(true);
  });

  it('QUARANTINE_EVENT quarantines an existing event', async () => {
    // Create an event first
    await db.activityLog.create({
      data: {
        action: 'security.test',
        description: 'test',
        severity: 'INFO',
        requiresResolution: false,
        system: true,
        userId: null,
        metadata: {},
      },
    });
    const eventId = db._records[0].id;

    const result = await resolveIntent(
      SecurityIntent.QUARANTINE_EVENT,
      { eventId, reason: 'suspicious' },
      db, callbacks
    );
    expect(result.success).toBe(true);

    // Verify quarantine metadata
    const updated = await db.activityLog.findUnique({ where: { id: eventId } });
    const meta = updated?.metadata as Record<string, unknown>;
    expect(meta?.quarantined).toBe(true);
  });

  it('QUARANTINE_EVENT fails with missing eventId', async () => {
    const result = await resolveIntent(
      SecurityIntent.QUARANTINE_EVENT,
      {},
      db, callbacks
    );
    expect(result.success).toBe(false);
  });

  it('ROTATE_KEYS returns advisory', async () => {
    const result = await resolveIntent(
      SecurityIntent.ROTATE_KEYS,
      { reason: 'scheduled rotation' },
      db, callbacks
    );
    expect(result.success).toBe(false); // Advisory only
    expect(result.data?.advisory).toBeTruthy();
  });

  it('ESCALATE_TO_HUMAN succeeds', async () => {
    const result = await resolveIntent(
      SecurityIntent.ESCALATE_TO_HUMAN,
      { reason: 'complex situation' },
      db, callbacks
    );
    expect(result.success).toBe(true);
    expect(result.data?.requiresHuman).toBe(true);
  });
});

describe('getPlaybookForIntent', () => {
  it('returns playbook for known alert type', () => {
    const playbook = getPlaybookForIntent(SecurityIntent.QUARANTINE_EVENT, 'brute_force');
    expect(playbook).toBeDefined();
    expect(playbook?.id).toBe('playbook-brute-force');
  });

  it('returns null without alert type', () => {
    const playbook = getPlaybookForIntent(SecurityIntent.VERIFY_IDENTITY);
    expect(playbook).toBeNull();
  });
});
