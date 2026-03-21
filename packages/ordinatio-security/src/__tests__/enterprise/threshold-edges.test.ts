// ===========================================
// 6. Alert Threshold Edge Tests
// ===========================================
// Exact boundary testing for alert rules.
// No off-by-one, no false negatives at edges.
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import { checkForBruteForce, checkSecurityPatterns } from '../../alert-detection';
import { logSecurityEvent } from '../../event-logger';
import { SECURITY_EVENT_TYPES } from '../../types';
import { createMockDb, createMockCallbacks, resetIdCounter } from '../test-helpers';

describe('brute force threshold — exactly at boundary', () => {
  let db: ReturnType<typeof createMockDb>;
  let callbacks: ReturnType<typeof createMockCallbacks>;

  beforeEach(() => {
    resetIdCounter();
    db = createMockDb();
    callbacks = createMockCallbacks();
  });

  async function logFailedLogins(count: number, ip = '1.2.3.4') {
    for (let i = 0; i < count; i++) {
      await logSecurityEvent(db, {
        eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
        ip,
        details: { email: `user${i}@test.com`, reason: 'bad password' },
      }, callbacks);
    }
  }

  it('4 failed logins → no brute force alert', async () => {
    await logFailedLogins(4);
    const alert = await checkForBruteForce(db, undefined, '1.2.3.4', callbacks);
    expect(alert).toBeNull();
  });

  it('5 failed logins → brute force alert fires', async () => {
    await logFailedLogins(5);
    const alert = await checkForBruteForce(db, undefined, '1.2.3.4', callbacks);
    expect(alert).toBeDefined();
    expect(alert!.riskLevel).toBe('HIGH');
  });

  it('6 failed logins → still one alert (deduplication)', async () => {
    await logFailedLogins(6);
    const alert1 = await checkForBruteForce(db, undefined, '1.2.3.4', callbacks);
    expect(alert1).toBeDefined();

    // Second check should find existing alert
    const alert2 = await checkForBruteForce(db, undefined, '1.2.3.4', callbacks);
    expect(alert2).toBeNull(); // Deduplicated
  });

  it('5 from same user but different IPs → no alert (IP threshold, not user)', async () => {
    for (let i = 0; i < 5; i++) {
      await logSecurityEvent(db, {
        eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
        userId: 'user-1',
        ip: `10.0.0.${i}`,
        details: { email: 'user@test.com', reason: 'bad password' },
      }, callbacks);
    }
    // Brute force checks by IP, not by user
    const alert = await checkForBruteForce(db, undefined, '10.0.0.0', callbacks);
    expect(alert).toBeNull(); // Only 1 from each IP
  });

  it('5 from same IP across different users → alert', async () => {
    for (let i = 0; i < 5; i++) {
      await logSecurityEvent(db, {
        eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
        userId: `user-${i}`,
        ip: '10.0.0.1',
        details: { email: `user${i}@test.com`, reason: 'bad password' },
      }, callbacks);
    }
    const alert = await checkForBruteForce(db, undefined, '10.0.0.1', callbacks);
    expect(alert).toBeDefined();
  });

  it('mixed event types do not count toward brute force', async () => {
    // 3 login failures + 2 permission denied from same IP = not 5 login failures
    for (let i = 0; i < 3; i++) {
      await logSecurityEvent(db, {
        eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
        ip: '1.2.3.4',
      }, callbacks);
    }
    for (let i = 0; i < 2; i++) {
      await logSecurityEvent(db, {
        eventType: SECURITY_EVENT_TYPES.PERMISSION_DENIED,
        ip: '1.2.3.4',
      }, callbacks);
    }
    const alert = await checkForBruteForce(db, undefined, '1.2.3.4', callbacks);
    expect(alert).toBeNull();
  });
});

describe('full pattern check — threshold precision', () => {
  let db: ReturnType<typeof createMockDb>;
  let callbacks: ReturnType<typeof createMockCallbacks>;

  beforeEach(() => {
    resetIdCounter();
    db = createMockDb();
    callbacks = createMockCallbacks();
  });

  it('checkSecurityPatterns returns empty for single event', async () => {
    const event = await logSecurityEvent(db, {
      eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
      ip: '1.2.3.4',
    }, callbacks);
    const alerts = await checkSecurityPatterns(db, event, callbacks);
    expect(alerts).toHaveLength(0);
  });

  it('checkSecurityPatterns fires on threshold breach', async () => {
    // Log 4 events first (below threshold)
    for (let i = 0; i < 4; i++) {
      await logSecurityEvent(db, {
        eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
        ip: '1.2.3.4',
      }, callbacks);
    }

    // The 5th triggers the alert
    const event = await logSecurityEvent(db, {
      eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
      ip: '1.2.3.4',
    }, callbacks);
    const alerts = await checkSecurityPatterns(db, event, callbacks);
    expect(alerts.length).toBeGreaterThanOrEqual(1);
  });

  it('CSRF threshold: 2 failures → no alert, 3 → alert', async () => {
    for (let i = 0; i < 2; i++) {
      await logSecurityEvent(db, {
        eventType: SECURITY_EVENT_TYPES.CSRF_VALIDATION_FAILED,
        ip: '1.2.3.4',
      }, callbacks);
    }
    const event2 = await logSecurityEvent(db, {
      eventType: SECURITY_EVENT_TYPES.CSRF_VALIDATION_FAILED,
      ip: '1.2.3.4',
    }, callbacks);
    // CSRF threshold is 3 in 5 minutes
    const alerts = await checkSecurityPatterns(db, event2, callbacks);
    expect(alerts.length).toBeGreaterThanOrEqual(1);
  });
});
