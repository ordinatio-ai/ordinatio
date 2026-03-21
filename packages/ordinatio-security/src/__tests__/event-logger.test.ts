import { describe, it, expect, beforeEach } from 'vitest';
import { logSecurityEvent, sanitizeIp, sanitizeUserAgent } from '../event-logger';
import { SECURITY_EVENT_TYPES } from '../types';
import { createMockDb, createMockCallbacks, resetIdCounter } from './test-helpers';

describe('sanitizeIp', () => {
  it('returns null for null/undefined', () => {
    expect(sanitizeIp(null)).toBeNull();
    expect(sanitizeIp(undefined)).toBeNull();
  });

  it('extracts first IP from x-forwarded-for', () => {
    expect(sanitizeIp('1.2.3.4, 5.6.7.8')).toBe('1.2.3.4');
  });

  it('handles IPv4 with port', () => {
    const result = sanitizeIp('192.168.1.1:8080');
    expect(result).toBe('192.168.1.1');
  });

  it('handles bracketed IPv6', () => {
    expect(sanitizeIp('[::1]:3000')).toBe('::1');
  });

  it('returns as-is for localhost', () => {
    expect(sanitizeIp('localhost')).toBe('localhost');
  });
});

describe('sanitizeUserAgent', () => {
  it('returns null for null/undefined', () => {
    expect(sanitizeUserAgent(null)).toBeNull();
    expect(sanitizeUserAgent(undefined)).toBeNull();
  });

  it('removes control characters', () => {
    expect(sanitizeUserAgent('Mozilla\x00/5.0')).toBe('Mozilla/5.0');
  });

  it('truncates long user agents to 256 chars', () => {
    const longUA = 'A'.repeat(300);
    const result = sanitizeUserAgent(longUA);
    expect(result!.length).toBeLessThanOrEqual(260); // 256 + '...'
    expect(result).toContain('...');
  });
});

describe('logSecurityEvent', () => {
  let db: ReturnType<typeof createMockDb>;
  let callbacks: ReturnType<typeof createMockCallbacks>;

  beforeEach(() => {
    resetIdCounter();
    db = createMockDb();
    callbacks = createMockCallbacks();
  });

  it('creates an activity log entry', async () => {
    const event = await logSecurityEvent(db, {
      eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
      userId: 'user-1',
      ip: '1.2.3.4',
    }, callbacks);

    expect(event.id).toBeTruthy();
    expect(event.eventType).toBe(SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS);
    expect(event.userId).toBe('user-1');
    expect(event.ip).toBe('1.2.3.4');
    expect(event.riskLevel).toBe('LOW');
    expect(db._records).toHaveLength(1);
  });

  it('uses default risk level from config', async () => {
    const event = await logSecurityEvent(db, {
      eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
    }, callbacks);

    expect(event.riskLevel).toBe('MEDIUM');
  });

  it('allows risk level override', async () => {
    const event = await logSecurityEvent(db, {
      eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
      riskLevel: 'CRITICAL',
    }, callbacks);

    expect(event.riskLevel).toBe('CRITICAL');
  });

  it('calls onEventLogged callback', async () => {
    await logSecurityEvent(db, {
      eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
      userId: 'user-1',
    }, callbacks);

    expect(callbacks._events).toHaveLength(1);
  });

  it('logs to console via callback', async () => {
    await logSecurityEvent(db, {
      eventType: SECURITY_EVENT_TYPES.VULNERABILITY_DETECTED,
    }, callbacks);

    const errorLog = callbacks._logs.find(l => l.level === 'error');
    expect(errorLog?.message).toContain('SECURITY ALERT');
  });

  it('throws on unknown event type', async () => {
    await expect(logSecurityEvent(db, {
      eventType: 'security.unknown.fake' as any,
    }, callbacks)).rejects.toThrow('Unknown security event type');
  });

  it('returns placeholder on db error', async () => {
    const brokenDb = createMockDb();
    brokenDb.activityLog.create = async () => { throw new Error('DB down'); };

    const event = await logSecurityEvent(brokenDb, {
      eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
    }, callbacks);

    expect(event.id).toBe('failed-to-log');
  });

  it('builds description with login failure details', async () => {
    const event = await logSecurityEvent(db, {
      eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
      details: { email: 'attacker@evil.com', reason: 'user_not_found' },
    }, callbacks);

    expect(db._records[0].description).toContain('attacker@evil.com');
    expect(db._records[0].description).toContain('user_not_found');
  });

  it('sanitizes IP and user agent', async () => {
    const event = await logSecurityEvent(db, {
      eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
      ip: '1.2.3.4, 5.6.7.8',
      userAgent: 'Mozilla\x00/5.0',
    }, callbacks);

    expect(event.ip).toBe('1.2.3.4');
    expect(event.userAgent).toBe('Mozilla/5.0');
  });
});
