import { describe, it, expect } from 'vitest';
import { buildExecutionArtifact, summarizeArtifact } from '../automation/memory-artifact';
import type { DagExecutionResult } from '../automation/dag-types';

function makeResult(overrides: Partial<DagExecutionResult> = {}): DagExecutionResult {
  return {
    status: 'completed',
    nodeResults: [
      { nodeId: 'action-1', status: 'completed', result: { contactId: 'c-1' }, retryCount: 0 },
      { nodeId: 'action-2', status: 'completed', result: { tagged: true }, retryCount: 0 },
    ],
    nodesExecuted: 2,
    actionsCompleted: 2,
    actionsFailed: 0,
    nodesSkipped: 0,
    durationMs: 1200,
    finalContext: {},
    log: [],
    ...overrides,
  };
}

describe('Memory Artifacts', () => {
  describe('buildExecutionArtifact', () => {
    it('builds artifact for successful execution', () => {
      const artifact = buildExecutionArtifact({
        automationId: 'auto-1',
        automationName: 'Lead Capture',
        executionId: 'exec-1',
        triggerReason: 'Email received from prospect@example.com',
        dagResult: makeResult(),
      });

      expect(artifact.artifactType).toBe('automation_execution');
      expect(artifact.automationName).toBe('Lead Capture');
      expect(artifact.intentSatisfied).toBe(true);
      expect(artifact.failures).toHaveLength(0);
      expect(artifact.changes.length).toBeGreaterThan(0);
      expect(artifact.summary).toContain('Lead Capture');
      expect(artifact.summary).toContain('successfully');
      expect(artifact.metadata.durationMs).toBe(1200);
    });

    it('builds artifact for failed execution', () => {
      const artifact = buildExecutionArtifact({
        automationId: 'auto-1',
        automationName: 'Lead Capture',
        executionId: 'exec-2',
        triggerReason: 'Email received',
        dagResult: makeResult({
          status: 'failed',
          nodeResults: [
            { nodeId: 'action-1', status: 'failed', error: 'Connection refused', retryCount: 2 },
          ],
          actionsFailed: 1,
          actionsCompleted: 0,
        }),
      });

      expect(artifact.intentSatisfied).toBe(false);
      expect(artifact.failures).toContain('action-1: Connection refused');
      expect(artifact.summary).toContain('failed');
    });

    it('includes DoD results when provided', () => {
      const artifact = buildExecutionArtifact({
        automationId: 'auto-1',
        automationName: 'Lead Capture',
        executionId: 'exec-3',
        triggerReason: 'Email',
        dagResult: makeResult(),
        dodResult: {
          satisfied: false,
          satisfiedCount: 1,
          totalChecks: 2,
          checks: [
            { description: 'Contact exists', passed: true },
            { description: 'Contact tagged', passed: false, reason: 'Tag not found' },
          ],
        },
      });

      expect(artifact.intentSatisfied).toBe(false);
      expect(artifact.dodResults?.passed).toContain('Contact exists');
      expect(artifact.dodResults?.failed).toContain('Contact tagged');
    });

    it('builds artifact for waiting execution', () => {
      const artifact = buildExecutionArtifact({
        automationId: 'auto-1',
        automationName: 'Order Process',
        executionId: 'exec-4',
        triggerReason: 'Order created',
        dagResult: makeResult({ status: 'waiting', actionsCompleted: 1 }),
      });

      expect(artifact.summary).toContain('paused');
      expect(artifact.nextSteps.some(s => s.includes('awaiting'))).toBe(true);
    });

    it('next steps recommend investigating when completed but unsatisfied', () => {
      const artifact = buildExecutionArtifact({
        automationId: 'auto-1',
        automationName: 'Test',
        executionId: 'exec-5',
        triggerReason: 'Test',
        dagResult: makeResult(),
        dodResult: { satisfied: false, satisfiedCount: 0, totalChecks: 1, checks: [{ description: 'X', passed: false }] },
      });

      expect(artifact.nextSteps.some(s => s.includes('definition of done'))).toBe(true);
    });

    it('includes trigger reason', () => {
      const artifact = buildExecutionArtifact({
        automationId: 'auto-1',
        automationName: 'Test',
        executionId: 'exec-6',
        triggerReason: 'Email from vip@client.com',
        dagResult: makeResult(),
      });

      expect(artifact.triggerReason).toBe('Email from vip@client.com');
    });
  });

  describe('summarizeArtifact', () => {
    it('produces compact summary', () => {
      const artifact = buildExecutionArtifact({
        automationId: 'auto-1',
        automationName: 'Lead Capture',
        executionId: 'exec-1',
        triggerReason: 'Email',
        dagResult: makeResult(),
      });

      const summary = summarizeArtifact(artifact);
      expect(summary).toContain('Lead Capture');
      expect(summary).toContain('Changes:');
      expect(typeof summary).toBe('string');
    });

    it('includes failures in summary', () => {
      const artifact = buildExecutionArtifact({
        automationId: 'auto-1',
        automationName: 'Test',
        executionId: 'exec-2',
        triggerReason: 'Email',
        dagResult: makeResult({
          status: 'failed',
          nodeResults: [{ nodeId: 'a', status: 'failed', error: 'boom', retryCount: 0 }],
          actionsFailed: 1,
        }),
      });

      expect(summarizeArtifact(artifact)).toContain('Failures:');
    });
  });
});
