// ===========================================
// Enforcement Tests
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryBlacklist, CompositeBlacklist } from '../enforcement/blacklist';
import { shouldBlockAction, getThrottleDelay } from '../enforcement/action-gate';
import { InMemoryNonceStore } from '../replay/nonce-store';
import { createMockDb, createMockCallbacks, resetIdCounter } from './test-helpers';

describe('InMemoryBlacklist', () => {
  let bl: InMemoryBlacklist;

  beforeEach(() => {
    bl = new InMemoryBlacklist();
  });

  it('is not blacklisted by default', () => {
    expect(bl.isBlacklisted('1.2.3.4')).toBe(false);
  });

  it('blocks after add', () => {
    bl.add('1.2.3.4');
    expect(bl.isBlacklisted('1.2.3.4')).toBe(true);
  });

  it('unblocks after remove', () => {
    bl.add('1.2.3.4');
    bl.remove('1.2.3.4');
    expect(bl.isBlacklisted('1.2.3.4')).toBe(false);
  });

  it('respects TTL expiry', () => {
    const past = new Date(Date.now() - 1000);
    bl.add('1.2.3.4', past);
    expect(bl.isBlacklisted('1.2.3.4')).toBe(false);
  });

  it('blocks before TTL expiry', () => {
    const future = new Date(Date.now() + 60_000);
    bl.add('1.2.3.4', future);
    expect(bl.isBlacklisted('1.2.3.4')).toBe(true);
  });

  it('tracks size', () => {
    bl.add('a');
    bl.add('b');
    expect(bl.size).toBe(2);
  });

  it('clear removes all', () => {
    bl.add('a');
    bl.add('b');
    bl.clear();
    expect(bl.size).toBe(0);
  });
});

describe('CompositeBlacklist', () => {
  let composite: CompositeBlacklist;

  beforeEach(() => {
    composite = new CompositeBlacklist();
  });

  it('returns not blocked by default', () => {
    const result = composite.isBlacklisted({ ip: '1.2.3.4' });
    expect(result.blocked).toBe(false);
  });

  it('blocks by IP', () => {
    composite.blockIp('1.2.3.4');
    const result = composite.isBlacklisted({ ip: '1.2.3.4' });
    expect(result.blocked).toBe(true);
    expect(result.dimension).toBe('ip');
  });

  it('blocks by principal', () => {
    composite.blockPrincipal('user-bad');
    const result = composite.isBlacklisted({ principalId: 'user-bad' });
    expect(result.blocked).toBe(true);
    expect(result.dimension).toBe('principal');
  });

  it('blocks by org', () => {
    composite.blockOrg('org-bad');
    const result = composite.isBlacklisted({ orgId: 'org-bad' });
    expect(result.blocked).toBe(true);
    expect(result.dimension).toBe('org');
  });

  it('unblocks correctly', () => {
    composite.blockIp('1.2.3.4');
    composite.unblockIp('1.2.3.4');
    expect(composite.isBlacklisted({ ip: '1.2.3.4' }).blocked).toBe(false);
  });

  it('clear removes all dimensions', () => {
    composite.blockIp('1.2.3.4');
    composite.blockPrincipal('user-bad');
    composite.clear();
    expect(composite.isBlacklisted({ ip: '1.2.3.4', principalId: 'user-bad' }).blocked).toBe(false);
  });
});

describe('shouldBlockAction', () => {
  let db: ReturnType<typeof createMockDb>;
  let callbacks: ReturnType<typeof createMockCallbacks>;

  beforeEach(() => {
    resetIdCounter();
    db = createMockDb();
    callbacks = createMockCallbacks();
  });

  it('allows when no gates are configured', async () => {
    const result = await shouldBlockAction(db, {
      principal: { principalId: 'user-1', principalType: 'user' },
      action: 'read',
    }, {}, callbacks);
    expect(result.blocked).toBe(false);
  });

  it('blocks blacklisted IP', async () => {
    const blacklist = new CompositeBlacklist();
    blacklist.blockIp('1.2.3.4');

    const result = await shouldBlockAction(db, {
      principal: { principalId: 'user-1', principalType: 'user' },
      action: 'read',
      ip: '1.2.3.4',
    }, { blacklist }, callbacks);
    expect(result.blocked).toBe(true);
    expect(result.recovery).toBeDefined();
  });

  it('blocks replay nonce', async () => {
    const nonceStore = new InMemoryNonceStore();
    nonceStore.checkAndSet('nonce-1'); // Pre-record

    const result = await shouldBlockAction(db, {
      principal: { principalId: 'user-1', principalType: 'user' },
      action: 'read',
      nonce: 'nonce-1',
    }, { nonceStore }, callbacks);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('nonce');
  });

  it('blocks by deny policy', async () => {
    const result = await shouldBlockAction(db, {
      principal: { principalId: 'user-1', principalType: 'user' },
      action: 'delete',
    }, {
      policies: [{
        id: 'p1',
        name: 'No deletes',
        conditions: [{ field: 'action', operator: 'eq', value: 'delete' }],
        decision: 'deny',
        priority: 10,
      }],
    }, callbacks);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('policy');
  });

  it('does not block on escalate policy', async () => {
    const result = await shouldBlockAction(db, {
      principal: { principalId: 'user-1', principalType: 'user' },
      action: 'risky',
    }, {
      policies: [{
        id: 'p1',
        name: 'Escalate risky',
        conditions: [{ field: 'action', operator: 'eq', value: 'risky' }],
        decision: 'escalate',
        priority: 10,
      }],
    }, callbacks);
    expect(result.blocked).toBe(false);
    expect(result.recovery).toBeDefined();
  });
});

describe('getThrottleDelay', () => {
  it('returns base delay for 0 excess', () => {
    expect(getThrottleDelay(0, 1000)).toBe(1000);
  });

  it('doubles for each excess', () => {
    expect(getThrottleDelay(1, 1000)).toBe(2000);
    expect(getThrottleDelay(2, 1000)).toBe(4000);
    expect(getThrottleDelay(3, 1000)).toBe(8000);
  });

  it('caps at 60 seconds', () => {
    expect(getThrottleDelay(100, 1000)).toBe(60_000);
  });

  it('uses custom base', () => {
    expect(getThrottleDelay(0, 500)).toBe(500);
    expect(getThrottleDelay(1, 500)).toBe(1000);
  });
});
