import { describe, it, expect } from 'vitest';
import {
  RESOLUTION_MAPPING,
  getActivityConfig,
  isActionSticky,
  getActionsToResolve,
  sortBySeverity,
} from '../activity-resolution';
import { ACTIVITY_ACTIONS } from '../activity-actions';
import type { Severity } from '../types';

describe('RESOLUTION_MAPPING', () => {
  it('should have placement verified resolve awaiting verification', () => {
    const resolves = RESOLUTION_MAPPING[ACTIVITY_ACTIONS.PLACEMENT_VERIFIED];
    expect(resolves).toContain(ACTIVITY_ACTIONS.PLACEMENT_AWAITING_VERIFICATION);
  });

  it('should have placement completed resolve both verified and awaiting', () => {
    const resolves = RESOLUTION_MAPPING[ACTIVITY_ACTIONS.PLACEMENT_COMPLETED];
    expect(resolves).toContain(ACTIVITY_ACTIONS.PLACEMENT_VERIFIED);
    expect(resolves).toContain(ACTIVITY_ACTIONS.PLACEMENT_AWAITING_VERIFICATION);
  });

  it('should have email sync completed resolve sync failed', () => {
    const resolves = RESOLUTION_MAPPING[ACTIVITY_ACTIONS.EMAIL_SYNC_COMPLETED];
    expect(resolves).toContain(ACTIVITY_ACTIONS.EMAIL_SYNC_FAILED);
  });

  it('should have automation triggered resolve dead letter and failed', () => {
    const resolves = RESOLUTION_MAPPING[ACTIVITY_ACTIONS.AUTOMATION_TRIGGERED];
    expect(resolves).toContain(ACTIVITY_ACTIONS.AUTOMATION_DEAD_LETTER);
    expect(resolves).toContain(ACTIVITY_ACTIONS.AUTOMATION_FAILED);
  });

  it('should only resolve actions that exist in ACTIVITY_CONFIG', () => {
    for (const [, resolved] of Object.entries(RESOLUTION_MAPPING)) {
      if (!resolved) continue;
      for (const action of resolved) {
        expect(getActivityConfig(action), `${action} should exist in config`).not.toBeNull();
      }
    }
  });
});

describe('getActivityConfig', () => {
  it('should return config for known actions', () => {
    const config = getActivityConfig('order.created');
    expect(config).not.toBeNull();
    expect(config!.label).toBe('Order Created');
  });

  it('should return null for unknown actions', () => {
    expect(getActivityConfig('nonexistent.action')).toBeNull();
    expect(getActivityConfig('')).toBeNull();
  });
});

describe('isActionSticky', () => {
  it('should return true for sticky actions', () => {
    expect(isActionSticky('placement.failed')).toBe(true);
    expect(isActionSticky('placement.rejected')).toBe(true);
    expect(isActionSticky('automation.dead_letter')).toBe(true);
  });

  it('should return false for non-sticky actions', () => {
    expect(isActionSticky('order.created')).toBe(false);
    expect(isActionSticky('client.created')).toBe(false);
  });

  it('should return false for unknown actions', () => {
    expect(isActionSticky('unknown.action')).toBe(false);
  });
});

describe('getActionsToResolve', () => {
  it('should return actions for known resolvers', () => {
    const result = getActionsToResolve('placement.verified');
    expect(result).toContain('placement.awaiting_verification');
  });

  it('should return empty array for non-resolver actions', () => {
    expect(getActionsToResolve('order.created')).toEqual([]);
    expect(getActionsToResolve('unknown')).toEqual([]);
  });
});

describe('sortBySeverity', () => {
  it('should sort CRITICAL before ERROR before WARNING before INFO', () => {
    const items = [
      { severity: 'INFO' as Severity, id: 1 },
      { severity: 'CRITICAL' as Severity, id: 2 },
      { severity: 'WARNING' as Severity, id: 3 },
      { severity: 'ERROR' as Severity, id: 4 },
    ];
    const sorted = sortBySeverity(items);
    expect(sorted.map(i => i.severity)).toEqual(['CRITICAL', 'ERROR', 'WARNING', 'INFO']);
  });

  it('should not mutate the original array', () => {
    const items = [
      { severity: 'INFO' as Severity, id: 1 },
      { severity: 'CRITICAL' as Severity, id: 2 },
    ];
    const sorted = sortBySeverity(items);
    expect(sorted).not.toBe(items);
    expect(items[0].severity).toBe('INFO');
  });

  it('should handle empty arrays', () => {
    expect(sortBySeverity([])).toEqual([]);
  });

  it('should place SECURITY between CRITICAL and ERROR', () => {
    const items = [
      { severity: 'ERROR' as Severity },
      { severity: 'SECURITY' as Severity },
      { severity: 'CRITICAL' as Severity },
    ];
    const sorted = sortBySeverity(items);
    expect(sorted.map(i => i.severity)).toEqual(['CRITICAL', 'SECURITY', 'ERROR']);
  });
});
