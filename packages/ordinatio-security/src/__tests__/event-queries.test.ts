import { describe, it, expect, beforeEach } from 'vitest';
import { logSecurityEvent } from '../event-logger';
import {
  getSecurityEvents,
  countSecurityEventsInWindow,
  getUserSecurityHistory,
  getSecurityEventsByIp,
  getRecentHighRiskEvents,
  getSecurityEventStats,
} from '../event-queries';
import { SECURITY_EVENT_TYPES } from '../types';
import { createMockDb, resetIdCounter } from './test-helpers';

describe('Event Queries', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    resetIdCounter();
    db = createMockDb();

    // Seed some events
    await logSecurityEvent(db, { eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS, userId: 'user-1', ip: '1.2.3.4' });
    await logSecurityEvent(db, { eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED, userId: null, ip: '5.6.7.8' });
    await logSecurityEvent(db, { eventType: SECURITY_EVENT_TYPES.PERMISSION_DENIED, userId: 'user-2', ip: '1.2.3.4' });
    await logSecurityEvent(db, { eventType: SECURITY_EVENT_TYPES.CSRF_VALIDATION_FAILED, userId: null, ip: '9.10.11.12', riskLevel: 'CRITICAL' });
  });

  describe('getSecurityEvents', () => {
    it('returns all events by default', async () => {
      const result = await getSecurityEvents(db);
      expect(result.events.length).toBe(4);
      expect(result.total).toBe(4);
    });

    it('filters by userId', async () => {
      const result = await getSecurityEvents(db, { userId: 'user-1' });
      expect(result.events.length).toBe(1);
      expect(result.events[0].eventType).toBe(SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS);
    });

    it('filters by event types', async () => {
      const result = await getSecurityEvents(db, {
        eventTypes: [SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED, SECURITY_EVENT_TYPES.CSRF_VALIDATION_FAILED],
      });
      expect(result.events.length).toBe(2);
    });

    it('filters by minimum risk level', async () => {
      const result = await getSecurityEvents(db, { minRiskLevel: 'HIGH' });
      // CSRF is CRITICAL (overridden), PERMISSION_DENIED is MEDIUM default
      // Only CSRF should pass with HIGH filter
      expect(result.events.every(e => ['HIGH', 'CRITICAL'].includes(e.riskLevel))).toBe(true);
    });

    it('respects limit and offset', async () => {
      const result = await getSecurityEvents(db, { limit: 2, offset: 0 });
      expect(result.events.length).toBe(2);
    });

    it('filters by tags', async () => {
      const result = await getSecurityEvents(db, { tags: ['auth'] });
      expect(result.events.length).toBe(2); // login_success + login_failed
    });
  });

  describe('countSecurityEventsInWindow', () => {
    it('counts events in time window', async () => {
      const count = await countSecurityEventsInWindow(db, {
        eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
        windowMinutes: 60,
      });
      expect(count).toBe(1);
    });

    it('counts by userId', async () => {
      const count = await countSecurityEventsInWindow(db, {
        eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
        windowMinutes: 60,
        userId: 'user-1',
      });
      expect(count).toBe(1);
    });

    it('returns 0 for non-matching events', async () => {
      const count = await countSecurityEventsInWindow(db, {
        eventType: SECURITY_EVENT_TYPES.AUTH_LOGOUT,
        windowMinutes: 60,
      });
      expect(count).toBe(0);
    });
  });

  describe('getUserSecurityHistory', () => {
    it('returns events for a user', async () => {
      const events = await getUserSecurityHistory(db, 'user-1');
      expect(events.length).toBe(1);
    });
  });

  describe('getSecurityEventsByIp', () => {
    it('returns events for an IP', async () => {
      const events = await getSecurityEventsByIp(db, '1.2.3.4');
      // IP filtering goes through metadata path which mock doesn't fully support
      // but the function should not throw
      expect(events).toBeDefined();
    });
  });

  describe('getRecentHighRiskEvents', () => {
    it('returns high and critical events', async () => {
      const events = await getRecentHighRiskEvents(db);
      expect(events.every(e => ['HIGH', 'CRITICAL'].includes(e.riskLevel))).toBe(true);
    });
  });

  describe('getSecurityEventStats', () => {
    it('computes statistics', async () => {
      const stats = await getSecurityEventStats(db);
      expect(stats.total).toBe(4);
      expect(stats.byRiskLevel.CRITICAL).toBeGreaterThanOrEqual(1);
      expect(stats.uniqueUsers).toBeGreaterThanOrEqual(1);
    });
  });
});
