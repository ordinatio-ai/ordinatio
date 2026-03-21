import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  checkSessionValidity,
  invalidateUserSessions,
  detectSuspiciousActivity,
  AUTH_SESSION_CONFIG,
  AUTH_SUSPICIOUS_CONFIG,
  _resetSessionActivityStore,
  _getSessionActivity,
} from './session';
import type { Session } from './types';

describe('session', () => {
  beforeEach(() => {
    _resetSessionActivityStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-07T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createSession = (overrides?: Partial<Session>): Session => ({
    id: 'session-123',
    userId: 'user-456',
    createdAt: new Date(),
    lastActiveAt: new Date(),
    ip: '192.168.1.1',
    ...overrides,
  });

  describe('checkSessionValidity', () => {
    it('returns valid for fresh session', () => {
      const result = checkSessionValidity(createSession());
      expect(result.valid).toBe(true);
      expect(result.remainingTime).toBeDefined();
    });

    it('invalidates session after inactivity timeout', () => {
      const session = createSession({
        lastActiveAt: new Date(Date.now() - AUTH_SESSION_CONFIG.inactivityTimeoutMs - 1000),
      });
      const result = checkSessionValidity(session);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SESSION_INACTIVE');
    });

    it('invalidates session after absolute lifetime', () => {
      const session = createSession({
        createdAt: new Date(Date.now() - AUTH_SESSION_CONFIG.absoluteLifetimeMs - 1000),
        lastActiveAt: new Date(),
      });
      const result = checkSessionValidity(session);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SESSION_EXPIRED');
    });

    it('indicates when session should be refreshed', () => {
      const session = createSession({
        lastActiveAt: new Date(Date.now() - AUTH_SESSION_CONFIG.activityRefreshThresholdMs - 1000),
      });
      const result = checkSessionValidity(session);
      expect(result.valid).toBe(true);
      expect(result.shouldRefresh).toBe(true);
    });

    it('does not indicate refresh for very recent activity', () => {
      const session = createSession({ lastActiveAt: new Date(Date.now() - 1000) });
      const result = checkSessionValidity(session);
      expect(result.valid).toBe(true);
      expect(result.shouldRefresh).toBe(false);
    });

    it('returns correct remaining time', () => {
      const session = createSession({
        lastActiveAt: new Date(Date.now() - 10 * 60 * 1000),
      });
      const result = checkSessionValidity(session);
      expect(result.valid).toBe(true);
      expect(result.remainingTime).toBeLessThanOrEqual(20 * 60 * 1000);
      expect(result.remainingTime).toBeGreaterThan(19 * 60 * 1000);
    });

    it('invokes log callback on expiration', () => {
      const log = vi.fn();
      const session = createSession({
        createdAt: new Date(Date.now() - AUTH_SESSION_CONFIG.absoluteLifetimeMs - 1000),
        lastActiveAt: new Date(),
      });
      checkSessionValidity(session, { log });
      expect(log).toHaveBeenCalledWith('info', 'Session expired (absolute lifetime)', expect.any(Object));
    });
  });

  describe('session manifests', () => {
    it('returns ALLOW manifest for fresh session', () => {
      const result = checkSessionValidity(createSession());
      expect(result.manifest).toBeDefined();
      expect(result.manifest!.suggestedAction).toBe('ALLOW');
      expect(result.manifest!.confidence).toBe(1.0);
    });

    it('returns REQUIRE_REAUTHENTICATION manifest for expired session', () => {
      const session = createSession({
        createdAt: new Date(Date.now() - AUTH_SESSION_CONFIG.absoluteLifetimeMs - 1000),
        lastActiveAt: new Date(),
      });
      const result = checkSessionValidity(session);
      expect(result.manifest!.suggestedAction).toBe('REQUIRE_REAUTHENTICATION');
    });

    it('returns REQUIRE_REAUTHENTICATION manifest for inactive session', () => {
      const session = createSession({
        lastActiveAt: new Date(Date.now() - AUTH_SESSION_CONFIG.inactivityTimeoutMs - 1000),
      });
      const result = checkSessionValidity(session);
      expect(result.manifest!.suggestedAction).toBe('REQUIRE_REAUTHENTICATION');
    });

    it('returns ROTATE_TOKEN manifest when nearing timeout', () => {
      const session = createSession({
        lastActiveAt: new Date(Date.now() - AUTH_SESSION_CONFIG.inactivityTimeoutMs + 2 * 60 * 1000),
      });
      const result = checkSessionValidity(session);
      expect(result.manifest!.suggestedAction).toBe('ROTATE_TOKEN');
    });
  });

  describe('suspicious activity manifests', () => {
    it('returns ALLOW manifest for normal activity', () => {
      const result = detectSuspiciousActivity(createSession(), '192.168.1.1');
      expect(result.manifest!.suggestedAction).toBe('ALLOW');
      expect(result.manifest!.confidence).toBe(1.0);
      expect(result.manifest!.requiresHumanReview).toBe(false);
    });

    it('returns REQUEST_MFA_CHALLENGE manifest for high risk', () => {
      const session = createSession();
      detectSuspiciousActivity(session, '192.168.1.1', { country: 'US' });
      vi.advanceTimersByTime(60 * 1000);
      const result = detectSuspiciousActivity(session, '10.0.0.1', { country: 'CN' });
      expect(result.manifest!.suggestedAction).toBe('REQUEST_MFA_CHALLENGE');
      expect(result.manifest!.requiresHumanReview).toBe(true);
    });

    it('returns TERMINATE_SESSION manifest for critical risk', () => {
      const session = createSession();
      detectSuspiciousActivity(session, '192.168.1.1', { country: 'US' });
      vi.advanceTimersByTime(60 * 1000);
      detectSuspiciousActivity(session, '10.0.0.1', { country: 'RU' });
      vi.advanceTimersByTime(60 * 1000);
      const result = detectSuspiciousActivity(session, '172.16.0.1', { country: 'CN' });
      expect(result.manifest!.suggestedAction).toBe('TERMINATE_SESSION');
      expect(result.manifest!.requiresHumanReview).toBe(true);
    });
  });

  describe('invalidateUserSessions', () => {
    it('clears session activity store', () => {
      expect(() => invalidateUserSessions('user-123', 'password_change')).not.toThrow();
    });

    it('invokes log callback', () => {
      const log = vi.fn();
      invalidateUserSessions('user-123', 'password_change', { log });
      expect(log).toHaveBeenCalledWith('info', 'Invalidating user sessions', expect.objectContaining({ userId: 'user-123' }));
    });
  });

  describe('detectSuspiciousActivity', () => {
    it('returns not suspicious for normal activity', () => {
      const result = detectSuspiciousActivity(createSession(), '192.168.1.1');
      expect(result.suspicious).toBe(false);
      expect(result.riskLevel).toBe('low');
      expect(result.recommendation).toBe('allow');
    });

    it('detects multiple IPs for same session', () => {
      const session = createSession();
      detectSuspiciousActivity(session, '192.168.1.1');
      detectSuspiciousActivity(session, '10.0.0.1');
      const result = detectSuspiciousActivity(session, '172.16.0.1');
      expect(result.suspicious).toBe(true);
      expect(result.flags.some(f => f.type === 'MULTIPLE_IPS')).toBe(true);
    });

    it('detects impossible travel', () => {
      const session = createSession();
      detectSuspiciousActivity(session, '192.168.1.1', { country: 'US' });
      vi.advanceTimersByTime(60 * 1000);
      const result = detectSuspiciousActivity(session, '10.0.0.1', { country: 'CN' });
      expect(result.suspicious).toBe(true);
      expect(result.flags.some(f => f.type === 'IMPOSSIBLE_TRAVEL')).toBe(true);
      expect(result.riskLevel).toBe('high');
    });

    it('detects unusual login times', () => {
      vi.setSystemTime(new Date('2026-02-07T03:00:00.000Z'));
      const session = createSession({ createdAt: new Date(), lastActiveAt: new Date() });
      const result = detectSuspiciousActivity(session, '192.168.1.1');
      expect(result.flags.some(f => f.type === 'UNUSUAL_TIME')).toBe(true);
      expect(result.suspicious).toBe(true);
    });

    it('does not flag normal business hours', () => {
      vi.setSystemTime(new Date('2026-02-07T10:00:00.000Z'));
      const session = createSession({ createdAt: new Date(), lastActiveAt: new Date() });
      const result = detectSuspiciousActivity(session, '192.168.1.1');
      expect(result.flags.filter(f => f.type === 'UNUSUAL_TIME')).toHaveLength(0);
    });

    it('detects rapid requests', () => {
      const session = createSession();
      for (let i = 0; i < AUTH_SUSPICIOUS_CONFIG.rapidRequestThreshold + 10; i++) {
        detectSuspiciousActivity(session, '192.168.1.1');
      }
      const result = detectSuspiciousActivity(session, '192.168.1.1');
      expect(result.suspicious).toBe(true);
      expect(result.flags.some(f => f.type === 'RAPID_REQUESTS')).toBe(true);
    });

    it('recommends notify for low-medium risk', () => {
      const session = createSession();
      detectSuspiciousActivity(session, '192.168.1.1');
      detectSuspiciousActivity(session, '10.0.0.1');
      const result = detectSuspiciousActivity(session, '172.16.0.1');
      expect(result.recommendation).toBe('notify');
    });

    it('recommends challenge for high risk', () => {
      const session = createSession();
      detectSuspiciousActivity(session, '192.168.1.1', { country: 'US' });
      vi.advanceTimersByTime(60 * 1000);
      const result = detectSuspiciousActivity(session, '10.0.0.1', { country: 'CN' });
      expect(result.riskLevel).toBe('high');
      expect(result.recommendation).toBe('challenge');
    });

    it('recommends block for critical risk', () => {
      const session = createSession();
      detectSuspiciousActivity(session, '192.168.1.1', { country: 'US' });
      vi.advanceTimersByTime(60 * 1000);
      detectSuspiciousActivity(session, '10.0.0.1', { country: 'RU' });
      vi.advanceTimersByTime(60 * 1000);
      const result = detectSuspiciousActivity(session, '172.16.0.1', { country: 'CN' });
      expect(result.riskLevel).toBe('critical');
      expect(result.recommendation).toBe('block');
    });

    it('tracks flags with metadata', () => {
      const session = createSession();
      detectSuspiciousActivity(session, '192.168.1.1');
      detectSuspiciousActivity(session, '10.0.0.1');
      const result = detectSuspiciousActivity(session, '172.16.0.1');
      const ipFlag = result.flags.find(f => f.type === 'MULTIPLE_IPS');
      expect(ipFlag).toBeDefined();
      expect(ipFlag!.metadata).toHaveProperty('ips');
      expect((ipFlag!.metadata!.ips as string[]).length).toBe(3);
    });

    it('stores session activity for analysis', () => {
      const session = createSession();
      detectSuspiciousActivity(session, '192.168.1.1', { country: 'US' });
      const activity = _getSessionActivity(session.id);
      expect(activity).toBeDefined();
      expect(activity!.ips.has('192.168.1.1')).toBe(true);
      expect(activity!.locations).toHaveLength(1);
    });

    it('invokes log callback on suspicious activity', () => {
      const log = vi.fn();
      const session = createSession();
      detectSuspiciousActivity(session, '192.168.1.1', undefined, { log });
      detectSuspiciousActivity(session, '10.0.0.1', undefined, { log });
      detectSuspiciousActivity(session, '172.16.0.1', undefined, { log });
      expect(log).toHaveBeenCalledWith('warn', 'Suspicious activity detected', expect.any(Object));
    });
  });
});
