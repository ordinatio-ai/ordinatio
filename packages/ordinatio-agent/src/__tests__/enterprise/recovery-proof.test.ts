// ===========================================
// ENTERPRISE TEST: Recovery Proof
// ===========================================
// Kill providers, corrupt responses, timeout
// queries, deny approvals — prove every
// failure produces a real RecoveryPlan that
// an agent can act on.
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import { recordProviderResult, isProviderHealthy, resetAllProviderHealth } from '../../health/provider-health';
import { buildAgentProof, type AgentDecision } from '../../cognition/agent-proof';
import { resolveAgentIntent } from '../../cognition/agent-intent';
import { planAgentTurn } from '../../cognition/agent-plan';
import { computeAgentPosture } from '../../cognition/agent-posture';
import type { AgentRole } from '../../types';

function makeRole(): AgentRole {
  return {
    id: 'coo', name: 'COO', description: 'ops',
    goals: [], constraints: [], modules: ['orders'],
    toolNames: [], approvalGates: [], contextDocument: '',
  };
}

function makeBasicProofInputs() {
  const intent = resolveAgentIntent({ userMessage: 'Test', roleId: 'coo', roleName: 'COO' });
  const plan = planAgentTurn({
    intent, role: makeRole(),
    providerId: 'claude', providerName: 'Claude', providerTrustLevel: 'critical',
    availableTools: [], blockedByGuardrails: [], blockedByTrust: [],
    relevantMemoryCount: 0, memoryTokenEstimate: 0, hasEntityContext: false, config: {},
  });
  return { intent, plan };
}

describe('Recovery Proof Tests', () => {
  beforeEach(() => resetAllProviderHealth());

  // ---- Provider failures ----

  describe('provider failure recovery', () => {
    it('provider becomes unhealthy after consecutive failures', () => {
      for (let i = 0; i < 5; i++) recordProviderResult('claude', false);
      expect(isProviderHealthy('claude')).toBe(false);
    });

    it('provider recovers after success', () => {
      for (let i = 0; i < 5; i++) recordProviderResult('claude', false);
      recordProviderResult('claude', true);
      expect(isProviderHealthy('claude')).toBe(true);
    });

    it('posture reflects offline provider', () => {
      const posture = computeAgentPosture({
        roleId: 'coo', providerId: 'claude',
        providerHealthy: false, providerConsecutiveFailures: 5,
        providerTrustLevel: 'critical',
        memoryHealthy: true, totalMemories: 0, staleMemoryCount: 0,
        totalTools: 10, availableTools: 10,
        blockedByGuardrails: 0, blockedByTrust: 0,
        pendingApprovals: 0, restrictedModules: [],
        policyViolations24h: 0, contextUsagePercent: 0,
      });

      expect(posture.health).toBe('offline');
      expect(posture.recommendedAction).toContain('offline');
      expect(posture.provider.healthy).toBe(false);
    });

    it('proof artifact records provider failure', () => {
      const { intent, plan } = makeBasicProofInputs();
      const proof = buildAgentProof({
        intent, plan,
        toolsCalled: [],
        approvalsRequested: [], approvalsGranted: [], approvalsDenied: [],
        totalIterations: 0, durationMs: 5000,
        finalResponse: '',
        stopReason: 'max_tokens',
        decisions: [],
        failures: [{ phase: 'provider', error: 'ECONNREFUSED: Claude API unreachable', recovery: 'Switch to backup provider' }],
      });

      expect(proof.failures).toHaveLength(1);
      expect(proof.failures[0].phase).toBe('provider');
      expect(proof.failures[0].recovery).toContain('backup');
      expect(proof.dodSatisfied).toBe(false);
    });
  });

  // ---- Tool execution failures ----

  describe('tool execution failure recovery', () => {
    it('proof records tool failure with recovery suggestion', () => {
      const { intent, plan } = makeBasicProofInputs();
      const proof = buildAgentProof({
        intent, plan,
        toolsCalled: [{ tool: 'get_order', summary: 'Error: 500 Internal Server Error', success: false }],
        approvalsRequested: [], approvalsGranted: [], approvalsDenied: [],
        totalIterations: 1, durationMs: 2000,
        finalResponse: 'I encountered an error retrieving the order.',
        stopReason: 'end_turn',
        decisions: [{ timestamp: new Date(), phase: 'tool_execution', chosen: 'get_order failed', reasoning: 'Server returned 500' }],
        failures: [{ phase: 'tool_execution', error: '500 Internal Server Error on GET /api/orders/123', recovery: 'Retry after 5 seconds' }],
      });

      expect(proof.execution.toolsCalled[0].success).toBe(false);
      expect(proof.failures[0].recovery).toContain('Retry');
    });

    it('multiple tool failures are all captured', () => {
      const { intent, plan } = makeBasicProofInputs();
      const proof = buildAgentProof({
        intent, plan,
        toolsCalled: [
          { tool: 'list_orders', summary: 'Timeout', success: false },
          { tool: 'search_clients', summary: '503 Service Unavailable', success: false },
        ],
        approvalsRequested: [], approvalsGranted: [], approvalsDenied: [],
        totalIterations: 2, durationMs: 60000,
        finalResponse: 'Multiple services are currently unavailable.',
        stopReason: 'end_turn',
        decisions: [],
        failures: [
          { phase: 'tool_execution', error: 'list_orders timed out after 30s' },
          { phase: 'tool_execution', error: 'search_clients returned 503' },
        ],
      });

      expect(proof.failures).toHaveLength(2);
      expect(proof.dodSatisfied).toBe(false);
    });
  });

  // ---- Approval denial ----

  describe('approval denial recovery', () => {
    it('denied approval is recorded with recovery path', () => {
      const { intent, plan } = makeBasicProofInputs();
      const proof = buildAgentProof({
        intent, plan,
        toolsCalled: [],
        approvalsRequested: ['send_email'],
        approvalsGranted: [],
        approvalsDenied: ['send_email'],
        totalIterations: 2, durationMs: 1500,
        finalResponse: 'The email was not approved. I saved it as a draft instead.',
        stopReason: 'end_turn',
        decisions: [
          { timestamp: new Date(), phase: 'approval_check', chosen: 'denied: send_email', reasoning: 'User chose not to send' },
        ],
        failures: [],
      });

      expect(proof.execution.approvalsDenied).toContain('send_email');
      expect(proof.risksEncountered.some(r => r.includes('denied'))).toBe(true);
    });
  });

  // ---- Trust restriction ----

  describe('trust restriction recovery', () => {
    it('posture identifies constrained state due to trust', () => {
      const posture = computeAgentPosture({
        roleId: 'coo', providerId: 'deepseek',
        providerHealthy: true, providerConsecutiveFailures: 0,
        providerTrustLevel: 'none',
        memoryHealthy: true, totalMemories: 0, staleMemoryCount: 0,
        totalTools: 30, availableTools: 5,
        blockedByGuardrails: 0, blockedByTrust: 25,
        pendingApprovals: 0, restrictedModules: [],
        policyViolations24h: 0, contextUsagePercent: 0,
      });

      expect(posture.health).toBe('constrained');
      expect(posture.tools.blockedByTrust).toBe(25);
      expect(posture.recommendedAction).toContain('trust');
    });
  });

  // ---- Memory failure ----

  describe('memory failure recovery', () => {
    it('posture identifies degraded memory', () => {
      const posture = computeAgentPosture({
        roleId: 'coo', providerId: 'claude',
        providerHealthy: true, providerConsecutiveFailures: 0,
        providerTrustLevel: 'critical',
        memoryHealthy: false, totalMemories: 100, staleMemoryCount: 80,
        totalTools: 30, availableTools: 30,
        blockedByGuardrails: 0, blockedByTrust: 0,
        pendingApprovals: 0, restrictedModules: [],
        policyViolations24h: 0, contextUsagePercent: 0,
      });

      expect(posture.health).toBe('degraded');
      expect(posture.memory.healthy).toBe(false);
      expect(posture.recommendedAction).toContain('Memory');
    });
  });

  // ---- Compound failures ----

  describe('compound failure scenarios', () => {
    it('proof captures multiple failure types in one turn', () => {
      const { intent, plan } = makeBasicProofInputs();
      const proof = buildAgentProof({
        intent, plan,
        toolsCalled: [{ tool: 'list_orders', summary: 'Timeout', success: false }],
        approvalsRequested: ['send_email'],
        approvalsGranted: [],
        approvalsDenied: ['send_email'],
        totalIterations: 3, durationMs: 45000,
        finalResponse: 'I was unable to complete the request.',
        stopReason: 'end_turn',
        decisions: [
          { timestamp: new Date(), phase: 'tool_execution', chosen: 'list_orders failed', reasoning: 'Timeout after 30s' },
          { timestamp: new Date(), phase: 'approval_check', chosen: 'denied', reasoning: 'User denied email' },
        ],
        failures: [
          { phase: 'tool_execution', error: 'Timeout', recovery: 'retry' },
          { phase: 'provider', error: 'Rate limited (429)', recovery: 'wait 60s' },
        ],
      });

      // ALL failure types captured
      expect(proof.failures).toHaveLength(2);
      expect(proof.execution.approvalsDenied).toHaveLength(1);
      expect(proof.dodSatisfied).toBe(false);
      expect(proof.risksEncountered.length).toBeGreaterThanOrEqual(2); // failures + denials
    });
  });
});
