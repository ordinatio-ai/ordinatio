import { describe, it, expect, beforeEach } from 'vitest';
import {
  createAlert,
  findExistingAlert,
  getActiveAlerts,
  getAlerts,
  acknowledgeAlert,
  resolveAlert,
  getAlertStats,
  activityToAlert,
} from '../alert-management';
import { SECURITY_EVENT_TYPES } from '../types';
import { createMockDb, createMockCallbacks, resetIdCounter } from './test-helpers';

describe('Alert Management', () => {
  let db: ReturnType<typeof createMockDb>;
  let callbacks: ReturnType<typeof createMockCallbacks>;

  beforeEach(() => {
    resetIdCounter();
    db = createMockDb();
    callbacks = createMockCallbacks();
  });

  describe('createAlert', () => {
    it('creates an alert in ActivityLog', async () => {
      const alert = await createAlert(db, {
        alertType: 'brute_force_ip',
        riskLevel: 'HIGH',
        title: 'Brute Force from 1.2.3.4',
        description: '5 failures in 15 min',
        triggerEventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
        affectedIp: '1.2.3.4',
        eventCount: 5,
        windowMinutes: 15,
      }, callbacks);

      expect(alert).not.toBeNull();
      expect(alert!.alertType).toBe('brute_force_ip');
      expect(alert!.riskLevel).toBe('HIGH');
      expect(alert!.status).toBe('ACTIVE');
      expect(db._records).toHaveLength(1);
    });

    it('calls onAlertCreated callback', async () => {
      await createAlert(db, {
        alertType: 'test',
        riskLevel: 'LOW',
        title: 'Test',
        description: 'Test',
        triggerEventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
        eventCount: 1,
        windowMinutes: 5,
      }, callbacks);

      expect(callbacks._alerts).toHaveLength(1);
    });

    it('returns null on db error', async () => {
      const brokenDb = createMockDb();
      brokenDb.activityLog.create = async () => { throw new Error('DB down'); };

      const alert = await createAlert(brokenDb, {
        alertType: 'test',
        riskLevel: 'HIGH',
        title: 'Test',
        description: 'Test',
        triggerEventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
        eventCount: 1,
        windowMinutes: 5,
      }, callbacks);

      expect(alert).toBeNull();
    });
  });

  describe('findExistingAlert', () => {
    it('finds an existing active alert', async () => {
      await createAlert(db, {
        alertType: 'brute_force_ip',
        riskLevel: 'HIGH',
        title: 'Brute Force',
        description: 'Test',
        triggerEventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
        affectedIp: '1.2.3.4',
        eventCount: 5,
        windowMinutes: 15,
      });

      const found = await findExistingAlert(db, {
        alertType: 'brute_force_ip',
        affectedIp: '1.2.3.4',
        windowMinutes: 15,
      });

      expect(found).not.toBeNull();
      expect(found!.alertType).toBe('brute_force_ip');
    });

    it('returns null when no matching alert exists', async () => {
      const found = await findExistingAlert(db, {
        alertType: 'nonexistent',
        windowMinutes: 15,
      });

      expect(found).toBeNull();
    });
  });

  describe('getActiveAlerts', () => {
    it('returns only unresolved alerts', async () => {
      const alert = await createAlert(db, {
        alertType: 'test1',
        riskLevel: 'HIGH',
        title: 'Active',
        description: 'Test',
        triggerEventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
        eventCount: 1,
        windowMinutes: 5,
      });

      await createAlert(db, {
        alertType: 'test2',
        riskLevel: 'LOW',
        title: 'Will Resolve',
        description: 'Test',
        triggerEventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
        eventCount: 1,
        windowMinutes: 5,
      });

      // Resolve the second one
      if (db._records[1]) {
        db._records[1].resolvedAt = new Date();
      }

      const active = await getActiveAlerts(db);
      expect(active).toHaveLength(1);
      expect(active[0].title).toBe('Active');
    });
  });

  describe('acknowledgeAlert', () => {
    it('acknowledges an alert', async () => {
      const alert = await createAlert(db, {
        alertType: 'test',
        riskLevel: 'HIGH',
        title: 'Test',
        description: 'Test',
        triggerEventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
        eventCount: 1,
        windowMinutes: 5,
      });

      const acked = await acknowledgeAlert(db, alert!.id, 'admin-1', callbacks);
      expect(acked).not.toBeNull();
      expect(acked!.status).toBe('ACKNOWLEDGED');
      expect(acked!.acknowledgedBy).toBe('admin-1');
    });

    it('returns null for non-existent alert', async () => {
      const result = await acknowledgeAlert(db, 'nonexistent', 'admin');
      expect(result).toBeNull();
    });
  });

  describe('resolveAlert', () => {
    it('resolves an alert', async () => {
      const alert = await createAlert(db, {
        alertType: 'test',
        riskLevel: 'HIGH',
        title: 'Test',
        description: 'Test',
        triggerEventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
        eventCount: 1,
        windowMinutes: 5,
      });

      const resolved = await resolveAlert(db, alert!.id, 'admin-1', 'Was a false alarm', false, callbacks);
      expect(resolved).not.toBeNull();
      expect(resolved!.status).toBe('RESOLVED');
      expect(callbacks._resolved).toHaveLength(1);
    });

    it('marks as false positive', async () => {
      const alert = await createAlert(db, {
        alertType: 'test',
        riskLevel: 'HIGH',
        title: 'Test',
        description: 'Test',
        triggerEventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
        eventCount: 1,
        windowMinutes: 5,
      });

      const resolved = await resolveAlert(db, alert!.id, 'admin-1', 'Not real', true, callbacks);
      expect(resolved!.status).toBe('FALSE_POSITIVE');
    });
  });

  describe('getAlertStats', () => {
    it('computes alert statistics', async () => {
      await createAlert(db, {
        alertType: 'test1', riskLevel: 'HIGH', title: 'A', description: 'T',
        triggerEventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED, eventCount: 1, windowMinutes: 5,
      });
      await createAlert(db, {
        alertType: 'test2', riskLevel: 'CRITICAL', title: 'B', description: 'T',
        triggerEventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED, eventCount: 1, windowMinutes: 5,
      });

      const stats = await getAlertStats(db);
      expect(stats.active).toBe(2);
      expect(stats.byRiskLevel.HIGH).toBe(1);
      expect(stats.byRiskLevel.CRITICAL).toBe(1);
    });
  });

  describe('activityToAlert', () => {
    it('returns null for non-alert activity', () => {
      const result = activityToAlert({
        id: 'x', action: 'something', description: 'test',
        userId: null, metadata: {}, createdAt: new Date(),
        resolvedAt: null, resolvedBy: null,
      });
      expect(result).toBeNull();
    });
  });
});
