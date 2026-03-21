import { describe, it, expect } from 'vitest';
import {
  getSecurityEventConfig,
  getAlertThresholdsForEvent,
  shouldAlwaysAlert,
  getEventTypesByTag,
  getEventTypesByMinRiskLevel,
} from '../event-helpers';
import { SECURITY_EVENT_TYPES } from '../types';

describe('Event Helpers', () => {
  it('getSecurityEventConfig returns config for known event', () => {
    const config = getSecurityEventConfig(SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED);
    expect(config.label).toBe('Login Failed');
    expect(config.defaultRiskLevel).toBe('MEDIUM');
    expect(config.tags).toContain('auth');
  });

  it('getAlertThresholdsForEvent returns thresholds', () => {
    const thresholds = getAlertThresholdsForEvent(SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED);
    expect(thresholds.length).toBeGreaterThanOrEqual(1);
    expect(thresholds[0].threshold).toBe(5);
  });

  it('shouldAlwaysAlert returns true for account locked', () => {
    expect(shouldAlwaysAlert(SECURITY_EVENT_TYPES.AUTH_ACCOUNT_LOCKED)).toBe(true);
  });

  it('shouldAlwaysAlert returns false for login success', () => {
    expect(shouldAlwaysAlert(SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS)).toBe(false);
  });

  it('getEventTypesByTag returns auth events', () => {
    const authEvents = getEventTypesByTag('auth');
    expect(authEvents).toContain(SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS);
    expect(authEvents).toContain(SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED);
    expect(authEvents).not.toContain(SECURITY_EVENT_TYPES.RATE_LIMIT_EXCEEDED);
  });

  it('getEventTypesByMinRiskLevel returns HIGH+ events', () => {
    const highEvents = getEventTypesByMinRiskLevel('HIGH');
    expect(highEvents).toContain(SECURITY_EVENT_TYPES.AUTH_ACCOUNT_LOCKED);
    expect(highEvents).toContain(SECURITY_EVENT_TYPES.VULNERABILITY_DETECTED);
    expect(highEvents).not.toContain(SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS);
  });
});
