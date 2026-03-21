import { describe, it, expect } from 'vitest';
import { validateWorkerResult } from '../worker-validation';
import { DEFAULT_RETRY_POLICY } from '../job-registry';
import type { JobTypeDefinition, WorkerResult } from '../types';

function makeDef(overrides: Partial<JobTypeDefinition> = {}): JobTypeDefinition {
  return {
    type: 'TEST', description: 'test', spec: 'job-v1',
    retry: DEFAULT_RETRY_POLICY, defaultPriority: 5,
    intent: 'update_state',
    definitionOfDone: { checks: ['done'] },
    sideEffects: { writes: ['orders'], externalCalls: ['gocreate'], irreversible: false },
    safeToRetry: true, idempotent: true,
    requiresHumanApproval: false, riskLevel: 'low', replayPolicy: 'allow',
    ...overrides,
  };
}

describe('Worker Result Validator', () => {
  it('accepts valid success result', () => {
    const result: WorkerResult = { success: true, result: { id: '123' } };
    const v = validateWorkerResult(result, makeDef());
    expect(v.valid).toBe(true);
    expect(v.violations).toEqual([]);
  });

  it('accepts valid failure with recovery plan', () => {
    const result: WorkerResult = {
      success: false,
      error: 'connection failed',
      errorClassification: 'retryable',
      recovery: {
        recoverable: true, retryRecommended: true,
        nextAction: 'retry', humanInterventionRequired: false, reasonCode: 'ECONNREFUSED',
      },
    };
    const v = validateWorkerResult(result, makeDef());
    expect(v.valid).toBe(true);
  });

  it('rejects failure missing recovery plan', () => {
    const result: WorkerResult = { success: false, error: 'boom' };
    const v = validateWorkerResult(result, makeDef());
    expect(v.valid).toBe(false);
    expect(v.violations).toContain('Failed result missing required RecoveryPlan');
  });

  it('rejects failure missing errorClassification', () => {
    const result: WorkerResult = {
      success: false, error: 'boom',
      recovery: {
        recoverable: true, retryRecommended: true,
        nextAction: 'retry', humanInterventionRequired: false, reasonCode: 'X',
      },
    };
    const v = validateWorkerResult(result, makeDef());
    expect(v.valid).toBe(false);
    expect(v.violations.some(v => v.includes('errorClassification'))).toBe(true);
  });

  it('rejects when actual side effects exceed declared', () => {
    const result: WorkerResult = {
      success: true,
      actualSideEffects: ['orders', 'clients', 'stripe'],
    };
    const v = validateWorkerResult(result, makeDef());
    expect(v.valid).toBe(false);
    expect(v.violations.some(v => v.includes('undeclared'))).toBe(true);
  });

  it('accepts when actual side effects are within declared', () => {
    const result: WorkerResult = {
      success: true,
      actualSideEffects: ['orders', 'gocreate'],
    };
    const v = validateWorkerResult(result, makeDef());
    expect(v.valid).toBe(true);
  });

  it('rejects quarantine classification without humanInterventionRequired', () => {
    const result: WorkerResult = {
      success: false,
      error: 'suspicious',
      errorClassification: 'quarantine',
      recovery: {
        recoverable: false, retryRecommended: false,
        nextAction: 'abort', humanInterventionRequired: false, reasonCode: 'SUSPICIOUS',
      },
    };
    const v = validateWorkerResult(result, makeDef());
    expect(v.valid).toBe(false);
    expect(v.violations.some(v => v.includes('Quarantine'))).toBe(true);
  });

  it('accepts quarantine with humanInterventionRequired=true', () => {
    const result: WorkerResult = {
      success: false,
      error: 'suspicious',
      errorClassification: 'quarantine',
      recovery: {
        recoverable: false, retryRecommended: false,
        nextAction: 'abort', humanInterventionRequired: true, reasonCode: 'SUSPICIOUS',
      },
    };
    const v = validateWorkerResult(result, makeDef());
    expect(v.valid).toBe(true);
  });

  it('rejects structurally invalid recovery plan', () => {
    const result: WorkerResult = {
      success: false,
      error: 'boom',
      errorClassification: 'fatal',
      recovery: { recoverable: true } as any, // Missing fields
    };
    const v = validateWorkerResult(result, makeDef());
    expect(v.violations.some(v => v.includes('structurally invalid'))).toBe(true);
  });

  it('accumulates multiple violations', () => {
    const result: WorkerResult = {
      success: false,
      error: 'boom',
      // Missing: recovery, errorClassification
      actualSideEffects: ['stripe'], // Undeclared
    };
    const v = validateWorkerResult(result, makeDef());
    expect(v.violations.length).toBeGreaterThanOrEqual(3);
  });
});
