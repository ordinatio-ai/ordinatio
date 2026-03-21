import { describe, it, expect } from 'vitest';
import { ACTIVITY_CONFIG } from '../activity-display-config';
import { ACTIVITY_ACTIONS, type ActivityAction } from '../activity-actions';
import type { Severity } from '../types';

describe('ACTIVITY_CONFIG', () => {
  const allActions = Object.values(ACTIVITY_ACTIONS);
  const validSeverities: Severity[] = ['INFO', 'WARNING', 'ERROR', 'CRITICAL', 'SECURITY'];

  it('should have a config entry for every action', () => {
    for (const action of allActions) {
      const config = ACTIVITY_CONFIG[action];
      expect(config, `Missing config for action: ${action}`).toBeDefined();
    }
  });

  it('should have no extra config entries beyond defined actions', () => {
    const configKeys = Object.keys(ACTIVITY_CONFIG);
    const actionValues = new Set(allActions);
    for (const key of configKeys) {
      expect(actionValues.has(key as ActivityAction), `Extra config key: ${key}`).toBe(true);
    }
  });

  it('should have valid severity for every entry', () => {
    for (const [action, config] of Object.entries(ACTIVITY_CONFIG)) {
      expect(
        validSeverities.includes(config.severity),
        `Invalid severity "${config.severity}" for ${action}`
      ).toBe(true);
    }
  });

  it('should have non-empty label for every entry', () => {
    for (const [action, config] of Object.entries(ACTIVITY_CONFIG)) {
      expect(config.label.length, `Empty label for ${action}`).toBeGreaterThan(0);
    }
  });

  it('should have non-empty icon for every entry', () => {
    for (const [action, config] of Object.entries(ACTIVITY_CONFIG)) {
      expect(config.icon.length, `Empty icon for ${action}`).toBeGreaterThan(0);
    }
  });

  it('should have Tailwind color class for every entry', () => {
    for (const [action, config] of Object.entries(ACTIVITY_CONFIG)) {
      expect(config.colorClass, `Missing colorClass for ${action}`).toMatch(/^text-/);
    }
  });

  it('should have requiresResolution as boolean for every entry', () => {
    for (const [action, config] of Object.entries(ACTIVITY_CONFIG)) {
      expect(typeof config.requiresResolution, `Non-boolean requiresResolution for ${action}`).toBe('boolean');
    }
  });

  it('should mark placement failures as requiring resolution', () => {
    expect(ACTIVITY_CONFIG[ACTIVITY_ACTIONS.PLACEMENT_FAILED].requiresResolution).toBe(true);
    expect(ACTIVITY_CONFIG[ACTIVITY_ACTIONS.PLACEMENT_REJECTED].requiresResolution).toBe(true);
  });

  it('should mark automation failures as requiring resolution', () => {
    expect(ACTIVITY_CONFIG[ACTIVITY_ACTIONS.AUTOMATION_FAILED].requiresResolution).toBe(true);
    expect(ACTIVITY_CONFIG[ACTIVITY_ACTIONS.AUTOMATION_DEAD_LETTER].requiresResolution).toBe(true);
  });

  it('should mark security events with SECURITY severity', () => {
    expect(ACTIVITY_CONFIG[ACTIVITY_ACTIONS.SECURITY_AUTH_LOGIN_SUCCESS].severity).toBe('SECURITY');
    expect(ACTIVITY_CONFIG[ACTIVITY_ACTIONS.SECURITY_CSRF_FAILED].severity).toBe('SECURITY');
    expect(ACTIVITY_CONFIG[ACTIVITY_ACTIONS.SECURITY_ANOMALY].severity).toBe('SECURITY');
  });

  it('should not mark regular INFO actions as requiring resolution', () => {
    expect(ACTIVITY_CONFIG[ACTIVITY_ACTIONS.ORDER_CREATED].requiresResolution).toBe(false);
    expect(ACTIVITY_CONFIG[ACTIVITY_ACTIONS.CLIENT_CREATED].requiresResolution).toBe(false);
    expect(ACTIVITY_CONFIG[ACTIVITY_ACTIONS.TASK_COMPLETED].requiresResolution).toBe(false);
  });
});
