import { describe, it, expect, beforeEach } from 'vitest';
import {
  logLoginSuccess,
  logLoginFailure,
  logRateLimitExceeded,
  logPermissionDenied,
  logSuspiciousActivity,
} from '../event-convenience';
import { SECURITY_EVENT_TYPES } from '../types';
import { createMockDb, createMockCallbacks, resetIdCounter } from './test-helpers';

describe('Event Convenience Functions', () => {
  let db: ReturnType<typeof createMockDb>;
  let callbacks: ReturnType<typeof createMockCallbacks>;

  beforeEach(() => {
    resetIdCounter();
    db = createMockDb();
    callbacks = createMockCallbacks();
  });

  it('logLoginSuccess creates correct event', async () => {
    const event = await logLoginSuccess(db, {
      userId: 'user-1',
      ip: '1.2.3.4',
      method: 'oauth',
    }, callbacks);

    expect(event.eventType).toBe(SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS);
    expect(event.userId).toBe('user-1');
    expect(event.details.method).toBe('oauth');
  });

  it('logLoginSuccess defaults to password method', async () => {
    const event = await logLoginSuccess(db, { userId: 'user-1' }, callbacks);
    expect(event.details.method).toBe('password');
  });

  it('logLoginFailure creates correct event', async () => {
    const event = await logLoginFailure(db, {
      email: 'bad@evil.com',
      reason: 'invalid_password',
      ip: '5.6.7.8',
    }, callbacks);

    expect(event.eventType).toBe(SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED);
    expect(event.details.email).toBe('bad@evil.com');
    expect(event.details.reason).toBe('invalid_password');
  });

  it('logRateLimitExceeded creates correct event', async () => {
    const event = await logRateLimitExceeded(db, {
      endpoint: '/api/login',
      limit: 10,
      ip: '1.2.3.4',
    }, callbacks);

    expect(event.eventType).toBe(SECURITY_EVENT_TYPES.RATE_LIMIT_EXCEEDED);
    expect(event.details.endpoint).toBe('/api/login');
    expect(event.details.limit).toBe(10);
  });

  it('logPermissionDenied creates correct event', async () => {
    const event = await logPermissionDenied(db, {
      userId: 'user-1',
      resource: '/admin/settings',
      permission: 'admin',
    }, callbacks);

    expect(event.eventType).toBe(SECURITY_EVENT_TYPES.PERMISSION_DENIED);
    expect(event.details.resource).toBe('/admin/settings');
  });

  it('logSuspiciousActivity creates HIGH risk event', async () => {
    const event = await logSuspiciousActivity(db, {
      userId: 'user-1',
      reason: 'impossible travel',
      details: { fromCountry: 'US', toCountry: 'RU', minutes: 5 },
    }, callbacks);

    expect(event.eventType).toBe(SECURITY_EVENT_TYPES.AUTH_SUSPICIOUS_ACTIVITY);
    expect(event.riskLevel).toBe('HIGH');
    expect(event.details.reason).toBe('impossible travel');
    expect(event.details.fromCountry).toBe('US');
  });

  it('all convenience functions trigger onEventLogged callback', async () => {
    await logLoginSuccess(db, { userId: 'u1' }, callbacks);
    await logLoginFailure(db, { reason: 'bad' }, callbacks);
    await logRateLimitExceeded(db, { endpoint: '/x', limit: 5 }, callbacks);
    await logPermissionDenied(db, { userId: 'u1', resource: '/x', permission: 'admin' }, callbacks);
    await logSuspiciousActivity(db, { reason: 'test' }, callbacks);

    expect(callbacks._events).toHaveLength(5);
  });
});
