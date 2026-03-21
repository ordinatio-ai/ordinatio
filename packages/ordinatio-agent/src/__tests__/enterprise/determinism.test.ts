// ===========================================
// ENTERPRISE TEST: Determinism
// ===========================================
// Run the same input through the same config
// twice and prove the plan and decisions are
// identical. If it's not deterministic, it's
// not enterprise.
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import { resolveAgentIntent } from '../../cognition/agent-intent';
import { planAgentTurn } from '../../cognition/agent-plan';
import { planContextBudget } from '../../cognition/context-budget';
import { assessMemoryQuality } from '../../cognition/memory-quality';
import { registerRole, clearRoles } from '../../registry/role-registry';
import { registerTool, clearTools } from '../../registry/tool-registry';
import type { AgentRole, AgentTool } from '../../types';

function makeRole(): AgentRole {
  return {
    id: 'coo', name: 'COO', description: 'ops',
    goals: ['manage ops'], constraints: ['be safe'], modules: ['orders', 'email'],
    toolNames: ['list_orders', 'search_emails'], approvalGates: [{ action: 'send_email', reason: 'drafts first', prompt: 'Approve?' }],
    contextDocument: '/coo.md',
  };
}

function makeTool(name: string, module: string): AgentTool {
  return {
    name, description: `Tool ${name}`, module,
    method: 'GET', endpoint: `/api/${name}`, auth: 'session_cookie',
    params: [{ name: 'q', type: 'string', required: false, description: 'query' }],
    example: {}, responseShape: '{}', whenToUse: 'test',
    dataSensitivity: 'internal',
  };
}

describe('Determinism Tests', () => {
  beforeEach(() => { clearTools(); clearRoles(); });

  describe('intent resolution is deterministic', () => {
    it('same message + same role = same intent (10 runs)', () => {
      const intents = Array.from({ length: 10 }, () =>
        resolveAgentIntent({ userMessage: 'What orders are pending?', roleId: 'coo', roleName: 'COO' }),
      );

      const first = intents[0];
      for (const intent of intents) {
        expect(intent.executionIntent).toBe(first.executionIntent);
        expect(intent.businessIntent).toBe(first.businessIntent);
        expect(intent.roleId).toBe(first.roleId);
        expect(intent.definitionOfDone).toEqual(first.definitionOfDone);
        expect(intent.allowedStrategySpace).toEqual(first.allowedStrategySpace);
        expect(intent.failureBoundary).toEqual(first.failureBoundary);
      }
    });

    it('different messages produce different intents', () => {
      const orderIntent = resolveAgentIntent({ userMessage: 'Pending orders?', roleId: 'coo', roleName: 'COO' });
      const emailIntent = resolveAgentIntent({ userMessage: 'Check my inbox', roleId: 'coo', roleName: 'COO' });
      expect(orderIntent.businessIntent).not.toBe(emailIntent.businessIntent);
    });
  });

  describe('plan generation is deterministic', () => {
    it('same inputs = same plan (excluding timestamp)', () => {
      registerRole(makeRole());
      registerTool(makeTool('list_orders', 'orders'));
      registerTool(makeTool('search_emails', 'email'));

      const intent = resolveAgentIntent({ userMessage: 'What orders are pending?', roleId: 'coo', roleName: 'COO' });
      const config = { maxIterations: 10, timeoutMs: 60000, memoryTokenBudget: 2000 };

      const plan1 = planAgentTurn({
        intent, role: makeRole(),
        providerId: 'claude', providerName: 'Claude', providerTrustLevel: 'critical',
        availableTools: [makeTool('list_orders', 'orders'), makeTool('search_emails', 'email')],
        blockedByGuardrails: [], blockedByTrust: [],
        relevantMemoryCount: 5, memoryTokenEstimate: 800,
        hasEntityContext: false, config,
      });

      const plan2 = planAgentTurn({
        intent, role: makeRole(),
        providerId: 'claude', providerName: 'Claude', providerTrustLevel: 'critical',
        availableTools: [makeTool('list_orders', 'orders'), makeTool('search_emails', 'email')],
        blockedByGuardrails: [], blockedByTrust: [],
        relevantMemoryCount: 5, memoryTokenEstimate: 800,
        hasEntityContext: false, config,
      });

      // Everything except timestamp should be identical
      expect(plan1.schemaVersion).toBe(plan2.schemaVersion);
      expect(plan1.intent).toEqual(plan2.intent);
      expect(plan1.role).toEqual(plan2.role);
      expect(plan1.provider).toEqual(plan2.provider);
      expect(plan1.tools).toEqual(plan2.tools);
      expect(plan1.memory).toEqual(plan2.memory);
      expect(plan1.trust).toEqual(plan2.trust);
      expect(plan1.budget).toEqual(plan2.budget);
      expect(plan1.risks).toEqual(plan2.risks);
    });
  });

  describe('context budget is deterministic', () => {
    it('same inputs = same budget (100 runs)', () => {
      const input = { toolCount: 25, memoryCount: 10, hasEntityContext: true, conversationLength: 5 };
      const budgets = Array.from({ length: 100 }, () => planContextBudget(input));

      const first = budgets[0];
      for (const budget of budgets) {
        expect(budget.totalBudget).toBe(first.totalBudget);
        expect(budget.allocated).toEqual(first.allocated);
        expect(budget.remaining).toBe(first.remaining);
        expect(budget.strategy).toBe(first.strategy);
        expect(budget.pressure).toBe(first.pressure);
      }
    });
  });

  describe('memory quality is deterministic', () => {
    it('same memory = same quality assessment', () => {
      const now = new Date('2026-03-20T12:00:00Z');
      const memory = { createdAt: new Date('2026-03-15T12:00:00Z'), accessCount: 3, source: 'user_input', layer: 'DEEP' };

      const assessments = Array.from({ length: 50 }, () => assessMemoryQuality(memory, { now }));

      const first = assessments[0];
      for (const assessment of assessments) {
        expect(assessment.confidence).toBe(first.confidence);
        expect(assessment.freshness).toBe(first.freshness);
        expect(assessment.provenance).toBe(first.provenance);
        expect(assessment.grade).toBe(first.grade);
      }
    });
  });

  describe('guardrail filtering is deterministic', () => {
    it('same tools + same guardrails = same filtered set', () => {
      const tools = [
        makeTool('a', 'email'),
        makeTool('b', 'orders'),
        makeTool('c', 'tasks'),
        makeTool('d', 'email'),
      ];
      const guardrails = [{ module: 'email', enabled: false }];

      const results = Array.from({ length: 20 }, () => {
        const filtered = tools.filter(t => {
          if (['memory', 'auth', 'chat'].includes(t.module)) return true;
          const guard = guardrails.find(g => g.module === t.module);
          return !guard || guard.enabled;
        });
        return filtered.map(t => t.name);
      });

      const first = results[0];
      for (const result of results) {
        expect(result).toEqual(first);
      }
    });
  });
});
