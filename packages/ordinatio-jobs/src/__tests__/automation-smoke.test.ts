// ===========================================
// Automation Merge Smoke Test
// ===========================================
// Verifies automation exports are accessible
// through the unified @ordinatio/jobs barrel.
// ===========================================

import { describe, it, expect } from 'vitest';

describe('Automation Merge Smoke Test', () => {
  it('exports trigger registry', async () => {
    const mod = await import('../automation/trigger-registry');
    expect(mod.emit).toBeTypeOf('function');
  });

  it('exports condition evaluator', async () => {
    const mod = await import('../automation/condition-evaluator');
    expect(mod.evaluateConditions).toBeTypeOf('function');
  });

  it('exports action executor', async () => {
    const mod = await import('../automation/action-executor');
    expect(mod.executeActions).toBeTypeOf('function');
  });

  it('exports action registry', async () => {
    const mod = await import('../automation/actions/registry');
    expect(mod.registerAction).toBeTypeOf('function');
    expect(mod.getActionHandler).toBeTypeOf('function');
  });

  it('exports automation CRUD', async () => {
    const mod = await import('../automation/crud');
    expect(mod).toBeDefined();
  });

  it('exports automation errors with v2 builder', async () => {
    const { autoError } = await import('../automation/errors');
    const err = autoError('AUTO_100', { test: true });
    expect(err.code).toBe('AUTO_100');
    expect(err.ref).toMatch(/^AUTO_100-/);
    expect(err.timestamp).toBeTruthy();
    expect(err.module).toBe('AUTOMATION');
    expect(err.description).toBeTruthy();
    expect(err.context).toEqual({ test: true });
  });

  it('exports resilience modules', async () => {
    const mod = await import('../automation/resilience/index');
    expect(mod).toBeDefined();
  });

  it('exports automation types', async () => {
    const mod = await import('../automation/db-types');
    expect(mod.AUTOMATION_ACTIVITY_ACTIONS).toBeDefined();
  });

  it('exports queue client', async () => {
    const mod = await import('../automation/queue-client');
    expect(mod).toBeDefined();
  });

  it('coexists with jobs exports without conflicts', async () => {
    // Jobs exports
    const jobs = await import('../index');
    expect(jobs.registerJobType).toBeTypeOf('function');
    expect(jobs.planJob).toBeTypeOf('function');
    expect(jobs.createEventBus).toBeUndefined(); // That's in domus, not jobs

    // Automation exports via same barrel
    expect(jobs.autoError).toBeTypeOf('function');
    expect(jobs.registerAction).toBeTypeOf('function');
  });

  it('jobs error builder and automation error builder are both v2', async () => {
    const { jobsError } = await import('../errors');
    const { autoError } = await import('../automation/errors');

    const jobErr = jobsError('JOBS_100', { x: 1 });
    const autoErr = autoError('AUTO_100', { y: 2 });

    // Both return full v2 diagnostic objects
    for (const err of [jobErr, autoErr]) {
      expect(err.code).toBeTruthy();
      expect(err.ref).toBeTruthy();
      expect(err.timestamp).toBeTruthy();
      expect(err.module).toBeTruthy();
      expect(err.description).toBeTruthy();
      expect(err.severity).toBeTruthy();
      expect(typeof err.recoverable).toBe('boolean');
      expect(Array.isArray(err.diagnosis)).toBe(true);
      expect(err.context).toBeDefined();
    }

    // Different modules
    expect(jobErr.module).toBe('JOBS');
    expect(autoErr.module).toBe('AUTOMATION');
  });
});
