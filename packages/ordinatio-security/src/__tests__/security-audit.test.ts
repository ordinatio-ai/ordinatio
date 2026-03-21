import { describe, it, expect, beforeEach } from 'vitest';
import { runSecurityAudit, getLastSecurityAudit } from '../security-audit';
import type { AuditRunner } from '../types';
import { createMockDb, createMockCallbacks, resetIdCounter } from './test-helpers';

describe('Security Audit', () => {
  let db: ReturnType<typeof createMockDb>;
  let callbacks: ReturnType<typeof createMockCallbacks>;

  const mockRunner: AuditRunner = {
    runVulnerabilityCheck: async () => ({
      critical: 1, high: 2, moderate: 3, low: 4, total: 10,
    }),
    runOutdatedCheck: async () => [
      { name: 'lodash', current: '4.17.20', wanted: '4.17.21', latest: '4.17.21', location: 'dependencies' },
    ],
  };

  const cleanRunner: AuditRunner = {
    runVulnerabilityCheck: async () => ({
      critical: 0, high: 0, moderate: 0, low: 0, total: 0,
    }),
    runOutdatedCheck: async () => [],
  };

  beforeEach(() => {
    resetIdCounter();
    db = createMockDb();
    callbacks = createMockCallbacks();
  });

  it('runs audit and returns results', async () => {
    const result = await runSecurityAudit(db, mockRunner, 'test', callbacks);

    expect(result.success).toBe(true);
    expect(result.vulnerabilities.critical).toBe(1);
    expect(result.vulnerabilities.total).toBe(10);
    expect(result.outdatedPackages).toHaveLength(1);
  });

  it('logs to activity feed', async () => {
    await runSecurityAudit(db, mockRunner, 'test', callbacks);
    expect(db._records).toHaveLength(1);
    expect(db._records[0].action).toBe('security.audit_completed');
    expect(db._records[0].severity).toBe('ERROR'); // has critical vulns
  });

  it('marks clean audits as INFO severity', async () => {
    await runSecurityAudit(db, cleanRunner, 'test', callbacks);
    expect(db._records[0].severity).toBe('INFO');
  });

  it('handles runner failure', async () => {
    const failRunner: AuditRunner = {
      runVulnerabilityCheck: async () => { throw new Error('pnpm not found'); },
      runOutdatedCheck: async () => [],
    };

    const result = await runSecurityAudit(db, failRunner, 'test', callbacks);
    expect(result.success).toBe(false);
    expect(result.error).toContain('pnpm not found');
  });

  it('getLastSecurityAudit retrieves previous audit', async () => {
    await runSecurityAudit(db, mockRunner, 'test', callbacks);
    const last = await getLastSecurityAudit(db);

    expect(last).not.toBeNull();
    expect(last!.success).toBe(true);
    expect(last!.vulnerabilities.critical).toBe(1);
  });

  it('getLastSecurityAudit returns null when no audits exist', async () => {
    const last = await getLastSecurityAudit(db);
    expect(last).toBeNull();
  });
});
