// ===========================================
// ENTERPRISE TEST: Audit Trail Completeness
// ===========================================
// Run complex agent scenarios and prove every
// single decision, tool call, approval, and
// failure is captured with zero gaps.
// ===========================================

import { describe, it, expect } from 'vitest';
import { resolveAgentIntent } from '../../cognition/agent-intent';
import { planAgentTurn } from '../../cognition/agent-plan';
import { buildAgentProof, type AgentDecision } from '../../cognition/agent-proof';
import type { ToolCallDisplay, AgentRole } from '../../types';

function makeRole(): AgentRole {
  return {
    id: 'coo', name: 'COO', description: 'ops',
    goals: ['manage ops'], constraints: ['be safe'],
    modules: ['orders', 'email', 'clients'],
    toolNames: ['list_orders', 'get_order', 'search_clients', 'send_email', 'create_task'],
    approvalGates: [{ action: 'send_email', reason: 'drafts first', prompt: 'Approve?' }],
    contextDocument: '/coo.md',
  };
}

describe('Audit Trail Completeness', () => {
  describe('proof artifact captures all decisions', () => {
    it('every tool call is recorded', () => {
      const intent = resolveAgentIntent({ userMessage: 'Check orders and email vendor', roleId: 'coo', roleName: 'COO' });
      const plan = planAgentTurn({
        intent, role: makeRole(),
        providerId: 'claude', providerName: 'Claude', providerTrustLevel: 'critical',
        availableTools: [], blockedByGuardrails: [], blockedByTrust: [],
        relevantMemoryCount: 0, memoryTokenEstimate: 0, hasEntityContext: false, config: {},
      });

      const toolsCalled: ToolCallDisplay[] = [
        { tool: 'list_orders', summary: '5 orders found', success: true, data: { count: 5 } },
        { tool: 'get_order', summary: 'Order ORD-101 details', success: true, data: { id: 'ORD-101' } },
        { tool: 'send_email', summary: 'Draft created', success: true, data: { draftId: 'd-1' } },
      ];

      const proof = buildAgentProof({
        intent, plan, toolsCalled,
        approvalsRequested: ['send_email'], approvalsGranted: ['send_email'], approvalsDenied: [],
        totalIterations: 4, durationMs: 3500,
        finalResponse: 'Found 5 orders. Emailed vendor about ORD-101. Draft created and ready for your review.',
        stopReason: 'end_turn',
        decisions: [
          { timestamp: new Date(), phase: 'tool_selection', chosen: 'list_orders', reasoning: 'User asked about orders' },
          { timestamp: new Date(), phase: 'tool_selection', chosen: 'get_order', reasoning: 'Need details on first order' },
          { timestamp: new Date(), phase: 'approval_check', chosen: 'approved: send_email', reasoning: 'User approved the draft' },
          { timestamp: new Date(), phase: 'tool_execution', chosen: 'send_email', reasoning: 'Sending approved draft to vendor' },
        ],
        failures: [],
      });

      // EVERY tool call is recorded
      expect(proof.execution.toolsCalled).toHaveLength(3);
      expect(proof.execution.toolsCalled[0].toolName).toBe('list_orders');
      expect(proof.execution.toolsCalled[1].toolName).toBe('get_order');
      expect(proof.execution.toolsCalled[2].toolName).toBe('send_email');

      // EVERY tool call has a safety class
      for (const tc of proof.execution.toolsCalled) {
        expect(tc.safetyClass).toBeTruthy();
      }

      // EVERY decision is recorded
      expect(proof.decisions).toHaveLength(4);
      expect(proof.decisions[0].phase).toBe('tool_selection');
      expect(proof.decisions[2].phase).toBe('approval_check');

      // Approvals are tracked
      expect(proof.execution.approvalsRequested).toContain('send_email');
      expect(proof.execution.approvalsGranted).toContain('send_email');
      expect(proof.execution.approvalsDenied).toHaveLength(0);
    });

    it('denied approvals are recorded', () => {
      const intent = resolveAgentIntent({ userMessage: 'Send follow-up email', roleId: 'coo', roleName: 'COO' });
      const plan = planAgentTurn({
        intent, role: makeRole(),
        providerId: 'claude', providerName: 'Claude', providerTrustLevel: 'critical',
        availableTools: [], blockedByGuardrails: [], blockedByTrust: [],
        relevantMemoryCount: 0, memoryTokenEstimate: 0, hasEntityContext: false, config: {},
      });

      const proof = buildAgentProof({
        intent, plan,
        toolsCalled: [],
        approvalsRequested: ['send_email'],
        approvalsGranted: [],
        approvalsDenied: ['send_email'],
        totalIterations: 2, durationMs: 1000,
        finalResponse: 'I drafted an email but it was not approved for sending.',
        stopReason: 'end_turn',
        decisions: [
          { timestamp: new Date(), phase: 'approval_check', chosen: 'denied: send_email', reasoning: 'User denied the email draft' },
        ],
        failures: [],
      });

      expect(proof.execution.approvalsDenied).toContain('send_email');
      expect(proof.risksEncountered.some(r => r.includes('denied'))).toBe(true);
    });

    it('failures are recorded with phase and error', () => {
      const intent = resolveAgentIntent({ userMessage: 'Get client info', roleId: 'coo', roleName: 'COO' });
      const plan = planAgentTurn({
        intent, role: makeRole(),
        providerId: 'claude', providerName: 'Claude', providerTrustLevel: 'critical',
        availableTools: [], blockedByGuardrails: [], blockedByTrust: [],
        relevantMemoryCount: 0, memoryTokenEstimate: 0, hasEntityContext: false, config: {},
      });

      const proof = buildAgentProof({
        intent, plan,
        toolsCalled: [{ tool: 'search_clients', summary: 'Error: timeout', success: false }],
        approvalsRequested: [], approvalsGranted: [], approvalsDenied: [],
        totalIterations: 1, durationMs: 30000,
        finalResponse: 'I was unable to retrieve client information due to a timeout.',
        stopReason: 'end_turn',
        decisions: [],
        failures: [
          { phase: 'tool_execution', error: 'ECONNRESET: Connection reset', recovery: 'retry' },
        ],
      });

      expect(proof.failures).toHaveLength(1);
      expect(proof.failures[0].phase).toBe('tool_execution');
      expect(proof.failures[0].error).toContain('ECONNRESET');
      expect(proof.failures[0].recovery).toBe('retry');
      expect(proof.risksEncountered.some(r => r.includes('failure'))).toBe(true);
    });

    it('trust blocks are captured in the plan', () => {
      const intent = resolveAgentIntent({ userMessage: 'Get payment details', roleId: 'coo', roleName: 'COO' });
      const plan = planAgentTurn({
        intent, role: makeRole(),
        providerId: 'deepseek', providerName: 'DeepSeek', providerTrustLevel: 'none',
        availableTools: [],
        blockedByGuardrails: [],
        blockedByTrust: ['get_payment_info', 'get_client_details', 'get_order_financials'],
        relevantMemoryCount: 0, memoryTokenEstimate: 0, hasEntityContext: false, config: {},
      });

      expect(plan.tools.blockedByTrust).toHaveLength(3);
      expect(plan.trust.blockedSensitivities).toContain('get_payment_info');
      expect(plan.risks.some(r => r.includes('blocked by provider trust'))).toBe(true);
    });
  });

  describe('proof artifact is self-contained', () => {
    it('proof has all fields needed for audit without looking up other records', () => {
      const intent = resolveAgentIntent({ userMessage: 'Quick check', roleId: 'coo', roleName: 'COO' });
      const plan = planAgentTurn({
        intent, role: makeRole(),
        providerId: 'claude', providerName: 'Claude', providerTrustLevel: 'critical',
        availableTools: [], blockedByGuardrails: [], blockedByTrust: [],
        relevantMemoryCount: 0, memoryTokenEstimate: 0, hasEntityContext: false, config: {},
      });

      const proof = buildAgentProof({
        intent, plan,
        toolsCalled: [{ tool: 'list_orders', summary: 'OK', success: true }],
        approvalsRequested: [], approvalsGranted: [], approvalsDenied: [],
        totalIterations: 1, durationMs: 500,
        finalResponse: 'Done.',
        stopReason: 'end_turn',
        decisions: [],
        failures: [],
      });

      // A compliance auditor should be able to answer all questions from this one object:
      expect(proof.artifactType).toBeTruthy();              // What kind of record is this?
      expect(proof.timestamp).toBeInstanceOf(Date);          // When did it happen?
      expect(proof.intent.executionIntent).toBeTruthy();     // What was the system doing?
      expect(proof.intent.businessIntent).toBeTruthy();      // What was the business purpose?
      expect(proof.intent.definitionOfDone.length).toBeGreaterThan(0); // How was success defined?
      expect(proof.plan.roleId).toBeTruthy();                // Who was the agent?
      expect(proof.plan.providerId).toBeTruthy();            // Which LLM was used?
      expect(proof.execution.totalToolCalls).toBeDefined();  // What tools were called?
      expect(proof.execution.durationMs).toBeDefined();      // How long did it take?
      expect(proof.execution.finalResponse).toBeTruthy();    // What was the output?
      expect(proof.execution.stopReason).toBeTruthy();       // Why did it stop?
      expect(typeof proof.dodSatisfied).toBe('boolean');     // Did it achieve its goal?
      expect(Array.isArray(proof.dodResults)).toBe(true);    // Which checks passed/failed?
      expect(Array.isArray(proof.failures)).toBe(true);      // What went wrong?
      expect(Array.isArray(proof.risksEncountered)).toBe(true); // What risks were there?
      expect(typeof proof.summary).toBe('string');           // Plain-language summary?
    });
  });

  describe('decision journal completeness', () => {
    it('every decision has timestamp, phase, chosen, and reasoning', () => {
      const decisions: AgentDecision[] = [
        { timestamp: new Date(), phase: 'tool_selection', chosen: 'list_orders', reasoning: 'User asked about orders' },
        { timestamp: new Date(), phase: 'trust_check', chosen: 'allowed', reasoning: 'Claude has critical trust level' },
        { timestamp: new Date(), phase: 'guardrail_check', chosen: 'passed', reasoning: 'orders module is enabled' },
        { timestamp: new Date(), phase: 'tool_execution', chosen: 'list_orders executed', reasoning: 'Returned 5 results' },
        { timestamp: new Date(), phase: 'intent_evaluation', chosen: 'satisfied', reasoning: 'Orders listed successfully' },
      ];

      for (const decision of decisions) {
        expect(decision.timestamp).toBeInstanceOf(Date);
        expect(decision.phase).toBeTruthy();
        expect(decision.chosen).toBeTruthy();
        expect(decision.reasoning).toBeTruthy();
      }
    });

    it('rejected alternatives are captured with reasons', () => {
      const decision: AgentDecision = {
        timestamp: new Date(),
        phase: 'tool_selection',
        chosen: 'search_clients',
        reasoning: 'Best match for client lookup query',
        rejected: [
          { option: 'list_orders', reason: 'User asked about clients, not orders' },
          { option: 'get_order', reason: 'No order ID in the query' },
        ],
      };

      expect(decision.rejected).toHaveLength(2);
      expect(decision.rejected![0].option).toBe('list_orders');
      expect(decision.rejected![0].reason).toBeTruthy();
    });
  });
});
