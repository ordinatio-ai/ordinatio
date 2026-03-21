// ===========================================
// ENTERPRISE TEST: Durability & Scale
// ===========================================
// Register 1,000 tools, 50 roles, 10,000
// memories. Prove the system doesn't degrade.
// Measure that operations stay fast.
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import { registerTool, registerTools, getTool, getToolsByModule, getToolsForRole, getAllTools, clearTools } from '../../registry/tool-registry';
import { registerRole, getRole, getAllRoles, buildCompositeRole, clearRoles } from '../../registry/role-registry';
import { assessMemoryQuality, detectContradictions } from '../../cognition/memory-quality';
import { planContextBudget } from '../../cognition/context-budget';
import { resolveAgentIntent } from '../../cognition/agent-intent';
import { planAgentTurn } from '../../cognition/agent-plan';
import { filterToolsByGuardrails } from '../../guardrails/agent-guardrails';
import type { AgentTool, AgentRole } from '../../types';

function makeTool(i: number): AgentTool {
  const modules = ['email', 'orders', 'clients', 'tasks', 'fabric', 'tax', 'settings', 'activities'];
  return {
    name: `tool_${i}`, description: `Tool ${i}`, module: modules[i % modules.length],
    method: i % 2 === 0 ? 'GET' : 'POST',
    endpoint: `/api/tool/${i}`, auth: 'session_cookie',
    params: [{ name: 'id', type: 'string', required: true, description: 'Entity ID' }],
    example: { id: 'x' }, responseShape: '{}', whenToUse: `When need ${i}`,
    dataSensitivity: (['none', 'internal', 'sensitive', 'critical'] as const)[i % 4],
  };
}

function makeRole(i: number): AgentRole {
  return {
    id: `role_${i}`, name: `Role ${i}`, description: `Role ${i}`,
    goals: [`Goal ${i}`], constraints: [`Constraint ${i}`],
    modules: ['email', 'orders'], toolNames: Array.from({ length: 20 }, (_, j) => `tool_${(i * 20 + j) % 1000}`),
    approvalGates: [{ action: `action_${i}`, reason: 'test', prompt: 'Approve?' }],
    contextDocument: `/role_${i}.md`,
  };
}

describe('Durability & Scale Tests', () => {
  beforeEach(() => { clearTools(); clearRoles(); });

  describe('tool registry at scale', () => {
    it('registers 1,000 tools without error', () => {
      const tools = Array.from({ length: 1000 }, (_, i) => makeTool(i));
      registerTools(tools);
      expect(getAllTools()).toHaveLength(1000);
    });

    it('lookup by name is fast at 1,000 tools', () => {
      registerTools(Array.from({ length: 1000 }, (_, i) => makeTool(i)));

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        getTool(`tool_${i}`);
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50); // 1000 lookups in < 50ms
    });

    it('filter by module is fast at 1,000 tools', () => {
      registerTools(Array.from({ length: 1000 }, (_, i) => makeTool(i)));

      const start = performance.now();
      const emailTools = getToolsByModule('email');
      const elapsed = performance.now() - start;

      expect(emailTools.length).toBe(125); // 1000/8 modules
      expect(elapsed).toBeLessThan(20);
    });

    it('getToolsForRole filters from 1,000 tools fast', () => {
      registerTools(Array.from({ length: 1000 }, (_, i) => makeTool(i)));

      const start = performance.now();
      const tools = getToolsForRole('role', { roleToolNames: Array.from({ length: 50 }, (_, i) => `tool_${i}`) });
      const elapsed = performance.now() - start;

      expect(tools).toHaveLength(50);
      expect(elapsed).toBeLessThan(20);
    });
  });

  describe('role registry at scale', () => {
    it('registers 50 roles without error', () => {
      for (let i = 0; i < 50; i++) registerRole(makeRole(i));
      expect(getAllRoles()).toHaveLength(50);
    });

    it('buildCompositeRole from 10 roles is fast', () => {
      for (let i = 0; i < 50; i++) registerRole(makeRole(i));

      const start = performance.now();
      const composite = buildCompositeRole('mega', Array.from({ length: 10 }, (_, i) => `role_${i}`));
      const elapsed = performance.now() - start;

      expect(composite).toBeDefined();
      expect(composite!.toolNames.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(10);
    });
  });

  describe('guardrail filtering at scale', () => {
    it('filters 1,000 tools through 8 guardrails fast', () => {
      const tools = Array.from({ length: 1000 }, (_, i) => makeTool(i));
      const guardrails = [
        { module: 'email', enabled: true },
        { module: 'orders', enabled: false },
        { module: 'clients', enabled: true },
        { module: 'tasks', enabled: false },
        { module: 'fabric', enabled: true },
        { module: 'tax', enabled: true },
        { module: 'settings', enabled: false },
        { module: 'activities', enabled: true },
      ];

      const start = performance.now();
      const filtered = filterToolsByGuardrails(tools, guardrails);
      const elapsed = performance.now() - start;

      // 3 of 8 modules disabled → ~625 tools remain
      expect(filtered.length).toBeLessThan(1000);
      expect(filtered.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(20);
    });
  });

  describe('memory quality at scale', () => {
    it('assesses 10,000 memories fast', () => {
      const now = new Date();
      const memories = Array.from({ length: 10000 }, (_, i) => ({
        createdAt: new Date(now.getTime() - i * 3600000),
        accessCount: i % 10,
        source: 'conversation',
        layer: 'DEEP',
      }));

      const start = performance.now();
      const assessments = memories.map(m => assessMemoryQuality(m, { now }));
      const elapsed = performance.now() - start;

      expect(assessments).toHaveLength(10000);
      expect(elapsed).toBeLessThan(200); // 10K assessments in < 200ms
    });

    it('contradiction detection handles many memories', () => {
      // Generate memories at scale — mix of contradicting and non-contradicting
      const memories: Array<{ id: string; summary: string; clientId: string; tags: string[] }> = [];
      for (let client = 0; client < 10; client++) {
        for (let i = 0; i < 20; i++) {
          memories.push({
            id: `m-${client}-${i}`,
            summary: i < 10 ? 'Prefers navy' : 'Prefers gray',
            clientId: `c-${client}`,
            tags: ['preference'],
          });
        }
      }

      const start = performance.now();
      const contradictions = detectContradictions(memories);
      const elapsed = performance.now() - start;

      // Each client has 10 "navy" + 10 "gray" = 100 contradiction pairs per client × 10 clients
      expect(contradictions.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(2000);
    });
  });

  describe('context budget at scale', () => {
    it('plans budget for 100 tools + 50 memories fast', () => {
      const start = performance.now();
      const budget = planContextBudget({ toolCount: 100, memoryCount: 50, hasEntityContext: true, conversationLength: 20 });
      const elapsed = performance.now() - start;

      expect(budget.totalBudget).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(5);
    });
  });

  describe('plan generation at scale', () => {
    it('generates plan with 500 available tools fast', () => {
      const tools = Array.from({ length: 500 }, (_, i) => makeTool(i));
      const intent = resolveAgentIntent({ userMessage: 'Complex operation', roleId: 'coo', roleName: 'COO' });

      const start = performance.now();
      const plan = planAgentTurn({
        intent, role: makeRole(0),
        providerId: 'claude', providerName: 'Claude', providerTrustLevel: 'critical',
        availableTools: tools,
        blockedByGuardrails: Array.from({ length: 20 }, (_, i) => `blocked_${i}`),
        blockedByTrust: Array.from({ length: 10 }, (_, i) => `trust_blocked_${i}`),
        relevantMemoryCount: 50, memoryTokenEstimate: 5000,
        hasEntityContext: true, config: { maxIterations: 10 },
      });
      const elapsed = performance.now() - start;

      expect(plan.tools.available).toBe(500);
      expect(elapsed).toBeLessThan(50);
    });
  });
});
