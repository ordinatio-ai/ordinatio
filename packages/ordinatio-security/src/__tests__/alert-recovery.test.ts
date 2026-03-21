// ===========================================
// Alert Recovery Tests
// ===========================================

import { describe, it, expect } from 'vitest';
import { buildAlertRecovery, getAllRecoveryTemplates } from '../alert-recovery';

describe('buildAlertRecovery', () => {
  it('returns recovery for brute_force alert', () => {
    const recovery = buildAlertRecovery({ alertType: 'brute_force', riskLevel: 'HIGH' });
    expect(recovery.impact).toBe('degrade_gracefully');
    expect(recovery.action).toBeTruthy();
    expect(recovery.allowedFollowups.length).toBeGreaterThan(0);
  });

  it('returns recovery for account_takeover alert', () => {
    const recovery = buildAlertRecovery({ alertType: 'account_takeover', riskLevel: 'CRITICAL' });
    expect(recovery.impact).toBe('halt_execution');
  });

  it('returns recovery for data_exfiltration alert', () => {
    const recovery = buildAlertRecovery({ alertType: 'data_exfiltration', riskLevel: 'CRITICAL' });
    expect(recovery.impact).toBe('halt_execution');
  });

  it('returns recovery for privilege_escalation alert', () => {
    const recovery = buildAlertRecovery({ alertType: 'privilege_escalation', riskLevel: 'HIGH' });
    expect(recovery.impact).toBe('halt_execution');
  });

  it('returns default recovery for unknown alert type', () => {
    const recovery = buildAlertRecovery({ alertType: 'unknown_alert', riskLevel: 'MEDIUM' });
    expect(recovery.impact).toBe('continue_monitoring');
    expect(recovery.action).toBeTruthy();
  });

  it('matches by prefix (brute_force_ip matches brute_force)', () => {
    const recovery = buildAlertRecovery({ alertType: 'brute_force_ip', riskLevel: 'HIGH' });
    expect(recovery.action).toContain('Throttle');
  });

  it('overrides impact to halt_execution for CRITICAL risk', () => {
    const recovery = buildAlertRecovery({ alertType: 'suspicious_patterns', riskLevel: 'CRITICAL' });
    expect(recovery.impact).toBe('halt_execution'); // Template says continue_monitoring, CRITICAL overrides
  });

  it('keeps halt_execution for CRITICAL alert that already has it', () => {
    const recovery = buildAlertRecovery({ alertType: 'account_takeover', riskLevel: 'CRITICAL' });
    expect(recovery.impact).toBe('halt_execution');
  });

  it('includes reason in all recoveries', () => {
    const templates = getAllRecoveryTemplates();
    for (const [key, template] of Object.entries(templates)) {
      expect(template.reason).toBeTruthy();
    }
  });

  it('all recovery templates have allowedFollowups', () => {
    const templates = getAllRecoveryTemplates();
    for (const [key, template] of Object.entries(templates)) {
      expect(template.allowedFollowups.length).toBeGreaterThan(0);
    }
  });

  it('handles csrf_attack type', () => {
    const recovery = buildAlertRecovery({ alertType: 'csrf_attack', riskLevel: 'CRITICAL' });
    expect(recovery.impact).toBe('halt_execution');
    expect(recovery.action).toContain('CSRF');
  });

  it('handles injection_attack type', () => {
    const recovery = buildAlertRecovery({ alertType: 'injection_attack', riskLevel: 'HIGH' });
    expect(recovery.impact).toBe('degrade_gracefully');
  });
});

describe('getAllRecoveryTemplates', () => {
  it('returns all templates', () => {
    const templates = getAllRecoveryTemplates();
    expect(Object.keys(templates).length).toBeGreaterThanOrEqual(10);
  });

  it('returns a copy', () => {
    const a = getAllRecoveryTemplates();
    delete a['brute_force'];
    const b = getAllRecoveryTemplates();
    expect(b['brute_force']).toBeDefined();
  });
});
