import { describe, it, expect } from 'vitest';
import { ACTIVITY_ACTIONS, type ActivityAction } from '../activity-actions';

describe('ACTIVITY_ACTIONS', () => {
  it('should have all action values as non-empty strings', () => {
    const values = Object.values(ACTIVITY_ACTIONS);
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it('should have no duplicate action values', () => {
    const values = Object.values(ACTIVITY_ACTIONS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('should have dotted notation for all actions', () => {
    const values = Object.values(ACTIVITY_ACTIONS);
    for (const v of values) {
      expect(v).toMatch(/^[a-z]+\.[a-z_.]+$/);
    }
  });

  it('should include order lifecycle actions', () => {
    expect(ACTIVITY_ACTIONS.ORDER_CREATED).toBe('order.created');
    expect(ACTIVITY_ACTIONS.ORDER_STATUS_CHANGED).toBe('order.status_changed');
    expect(ACTIVITY_ACTIONS.ORDER_CANCELLED).toBe('order.cancelled');
  });

  it('should include placement lifecycle actions', () => {
    expect(ACTIVITY_ACTIONS.PLACEMENT_PENDING).toBe('placement.pending');
    expect(ACTIVITY_ACTIONS.PLACEMENT_COMPLETED).toBe('placement.completed');
    expect(ACTIVITY_ACTIONS.PLACEMENT_FAILED).toBe('placement.failed');
  });

  it('should include email lifecycle actions', () => {
    expect(ACTIVITY_ACTIONS.EMAIL_SYNC_COMPLETED).toBe('email.sync_completed');
    expect(ACTIVITY_ACTIONS.EMAIL_SYNC_FAILED).toBe('email.sync_failed');
  });

  it('should include security event actions', () => {
    expect(ACTIVITY_ACTIONS.SECURITY_AUTH_LOGIN_SUCCESS).toBe('security.auth.login_success');
    expect(ACTIVITY_ACTIONS.SECURITY_CSRF_FAILED).toBe('security.api.csrf_failed');
  });

  it('should include organization lifecycle actions', () => {
    expect(ACTIVITY_ACTIONS.ORG_CREATED).toBe('org.created');
    expect(ACTIVITY_ACTIONS.ORG_SWITCHED).toBe('org.switched');
  });

  it('should include OAEM protocol actions', () => {
    expect(ACTIVITY_ACTIONS.OAEM_CAPSULE_RECEIVED).toBe('oaem.capsule_received');
    expect(ACTIVITY_ACTIONS.OAEM_TRUST_POLICY_UPDATED).toBe('oaem.trust_policy_updated');
  });

  it('should be readonly (as const)', () => {
    // TypeScript enforces this, but we verify the values are stable
    const action: ActivityAction = ACTIVITY_ACTIONS.ORDER_CREATED;
    expect(action).toBe('order.created');
  });
});
