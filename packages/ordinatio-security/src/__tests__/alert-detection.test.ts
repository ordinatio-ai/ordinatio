import { describe, it, expect, beforeEach } from 'vitest';
import { checkSecurityPatterns, checkForBruteForce, checkForSuspiciousPatterns } from '../alert-detection';
import { logSecurityEvent } from '../event-logger';
import { SECURITY_EVENT_TYPES, type SecurityEvent } from '../types';
import { createMockDb, createMockCallbacks, resetIdCounter } from './test-helpers';

describe('Alert Detection', () => {
  let db: ReturnType<typeof createMockDb>;
  let callbacks: ReturnType<typeof createMockCallbacks>;

  beforeEach(() => {
    resetIdCounter();
    db = createMockDb();
    callbacks = createMockCallbacks();
  });

  describe('checkForBruteForce', () => {
    it('returns null when below threshold', async () => {
      // Only 2 failures (threshold is 5)
      await logSecurityEvent(db, { eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED, ip: '1.2.3.4' });
      await logSecurityEvent(db, { eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED, ip: '1.2.3.4' });

      const alert = await checkForBruteForce(db, undefined, '1.2.3.4', callbacks);
      expect(alert).toBeNull();
    });

    it('returns null when no identifiers', async () => {
      const alert = await checkForBruteForce(db, undefined, undefined, callbacks);
      expect(alert).toBeNull();
    });

    it('creates alert when threshold exceeded', async () => {
      // Create 5 failures from same IP
      for (let i = 0; i < 6; i++) {
        await logSecurityEvent(db, { eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED, ip: '1.2.3.4' });
      }

      const alert = await checkForBruteForce(db, undefined, '1.2.3.4', callbacks);
      expect(alert).not.toBeNull();
      expect(alert!.alertType).toBe('brute_force_ip');
      expect(alert!.riskLevel).toBe('HIGH');
    });

    it('does not duplicate alerts', async () => {
      for (let i = 0; i < 6; i++) {
        await logSecurityEvent(db, { eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED, ip: '1.2.3.4' });
      }

      const alert1 = await checkForBruteForce(db, undefined, '1.2.3.4', callbacks);
      const alert2 = await checkForBruteForce(db, undefined, '1.2.3.4', callbacks);

      expect(alert1).not.toBeNull();
      expect(alert2).toBeNull(); // Deduplicated
    });
  });

  describe('checkForSuspiciousPatterns', () => {
    it('detects privilege escalation attempts', async () => {
      // Create 5+ permission denials
      for (let i = 0; i < 6; i++) {
        await logSecurityEvent(db, {
          eventType: SECURITY_EVENT_TYPES.PERMISSION_DENIED,
          userId: 'user-1',
        });
      }

      const event: SecurityEvent = {
        id: 'test-event',
        eventType: SECURITY_EVENT_TYPES.PERMISSION_DENIED,
        userId: 'user-1',
        targetUserId: null,
        ip: null,
        userAgent: null,
        riskLevel: 'MEDIUM',
        details: {},
        resourceId: null,
        resourceType: null,
        requestId: null,
        createdAt: new Date(),
      };

      const alerts = await checkForSuspiciousPatterns(db, [event], callbacks);
      expect(alerts.length).toBeGreaterThanOrEqual(1);
      expect(alerts[0].alertType).toBe('privilege_escalation_attempt');
    });

    it('detects data exfiltration', async () => {
      for (let i = 0; i < 4; i++) {
        await logSecurityEvent(db, {
          eventType: SECURITY_EVENT_TYPES.SENSITIVE_DATA_EXPORTED,
          userId: 'user-1',
        });
      }

      const event: SecurityEvent = {
        id: 'test-event',
        eventType: SECURITY_EVENT_TYPES.SENSITIVE_DATA_EXPORTED,
        userId: 'user-1',
        targetUserId: null,
        ip: null,
        userAgent: null,
        riskLevel: 'HIGH',
        details: {},
        resourceId: null,
        resourceType: null,
        requestId: null,
        createdAt: new Date(),
      };

      const alerts = await checkForSuspiciousPatterns(db, [event], callbacks);
      expect(alerts.length).toBeGreaterThanOrEqual(1);
      expect(alerts[0].alertType).toBe('data_exfiltration_risk');
    });

    it('returns empty array for normal events', async () => {
      const event: SecurityEvent = {
        id: 'test-event',
        eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
        userId: 'user-1',
        targetUserId: null,
        ip: null,
        userAgent: null,
        riskLevel: 'LOW',
        details: {},
        resourceId: null,
        resourceType: null,
        requestId: null,
        createdAt: new Date(),
      };

      const alerts = await checkForSuspiciousPatterns(db, [event], callbacks);
      expect(alerts).toHaveLength(0);
    });
  });

  describe('checkSecurityPatterns', () => {
    it('runs all checks without throwing', async () => {
      const event: SecurityEvent = {
        id: 'test-event',
        eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
        userId: 'user-1',
        targetUserId: null,
        ip: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
        riskLevel: 'LOW',
        details: {},
        resourceId: null,
        resourceType: null,
        requestId: null,
        createdAt: new Date(),
      };

      const alerts = await checkSecurityPatterns(db, event, callbacks);
      expect(Array.isArray(alerts)).toBe(true);
    });
  });
});
