// ===========================================
// ENTERPRISE TEST: Contract Violations
// ===========================================
// Deliberately break every contract and prove
// the system catches it. If you can't break
// it, it's not enforcing anything.
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import { registerTool, registerTools, getTool, clearTools, getToolsForRole } from '../../registry/tool-registry';
import { registerRole, getRole, clearRoles, buildCompositeRole } from '../../registry/role-registry';
import { filterToolsByGuardrails, isModuleEnabled } from '../../guardrails/agent-guardrails';
import { canProviderAccessTool } from '../../guardrails/provider-policy';
import { resolveAgentIntent } from '../../cognition/agent-intent';
import { planAgentTurn } from '../../cognition/agent-plan';
import { assessMemoryQuality, detectContradictions } from '../../cognition/memory-quality';
import type { AgentTool, AgentRole } from '../../types';

function makeTool(overrides: Partial<AgentTool> = {}): AgentTool {
  return {
    name: 'test_tool', description: 'test', module: 'test',
    method: 'GET', endpoint: '/api/test', auth: 'session_cookie',
    params: [], example: {}, responseShape: '{}', whenToUse: 'test',
    ...overrides,
  };
}

function makeRole(overrides: Partial<AgentRole> = {}): AgentRole {
  return {
    id: 'test', name: 'Test', description: 'test',
    goals: [], constraints: [], modules: ['test'],
    toolNames: ['test_tool'], approvalGates: [], contextDocument: '',
    ...overrides,
  };
}

describe('Contract Violation Tests', () => {
  beforeEach(() => { clearTools(); clearRoles(); });

  // ---- Tool contract violations ----

  describe('tool contract enforcement', () => {
    it('tool with empty name is still registered (no crash)', () => {
      registerTool(makeTool({ name: '' }));
      expect(getTool('')).toBeDefined();
    });

    it('tool with missing module returns in unfiltered queries', () => {
      registerTool(makeTool({ name: 'orphan', module: '' }));
      expect(getTool('orphan')!.module).toBe('');
    });

    it('tools with duplicate names — last wins', () => {
      registerTool(makeTool({ name: 'dup', description: 'first' }));
      registerTool(makeTool({ name: 'dup', description: 'second' }));
      expect(getTool('dup')!.description).toBe('second');
    });

    it('registering 0 tools does not crash', () => {
      registerTools([]);
      expect(() => getToolsForRole('any')).not.toThrow();
    });

    it('getToolsForRole with no matching tools returns empty', () => {
      registerTool(makeTool({ name: 'x' }));
      const tools = getToolsForRole('role', { roleToolNames: ['nonexistent'] });
      expect(tools).toHaveLength(0);
    });
  });

  // ---- Role contract violations ----

  describe('role contract enforcement', () => {
    it('role with empty id is registered', () => {
      registerRole(makeRole({ id: '' }));
      expect(getRole('')).toBeDefined();
    });

    it('role with no tools still resolves', () => {
      registerRole(makeRole({ id: 'empty', toolNames: [], modules: [] }));
      const role = getRole('empty')!;
      expect(role.toolNames).toEqual([]);
    });

    it('buildCompositeRole with one nonexistent role returns empty composite', () => {
      registerRole(makeRole({ id: 'real' }));
      const composite = buildCompositeRole('combo', ['real', 'ghost']);
      expect(composite).toBeDefined();
      // Should include real's tools but not crash on ghost
      expect(composite!.modules).toContain('test');
    });

    it('buildCompositeRole with all nonexistent roles returns empty', () => {
      const composite = buildCompositeRole('empty', ['a', 'b', 'c']);
      expect(composite!.toolNames).toEqual([]);
      expect(composite!.modules).toEqual([]);
    });
  });

  // ---- Guardrail contract violations ----

  describe('guardrail contract enforcement', () => {
    it('empty guardrails list allows all tools', () => {
      const tools = [makeTool({ module: 'anything' })];
      expect(filterToolsByGuardrails(tools, [])).toHaveLength(1);
    });

    it('guardrails with unknown module names do not crash', () => {
      const tools = [makeTool({ module: 'real' })];
      const guardrails = [{ module: 'nonexistent', enabled: false }];
      expect(filterToolsByGuardrails(tools, guardrails)).toHaveLength(1);
    });

    it('all modules disabled still keeps memory/auth/chat', () => {
      const tools = [
        makeTool({ name: 'a', module: 'memory' }),
        makeTool({ name: 'b', module: 'auth' }),
        makeTool({ name: 'c', module: 'chat' }),
        makeTool({ name: 'd', module: 'email' }),
      ];
      const guardrails = [
        { module: 'memory', enabled: false },
        { module: 'auth', enabled: false },
        { module: 'chat', enabled: false },
        { module: 'email', enabled: false },
      ];
      const filtered = filterToolsByGuardrails(tools, guardrails);
      expect(filtered.map(t => t.module)).toEqual(['memory', 'auth', 'chat']);
    });
  });

  // ---- Provider trust violations ----

  describe('provider trust enforcement', () => {
    it('restricts sensitive tools from untrusted providers', () => {
      const trustMap = { untrusted: { maxDataSensitivity: 'none' as const } };
      expect(canProviderAccessTool('untrusted', 'none', trustMap)).toBe(true);
      expect(canProviderAccessTool('untrusted', 'internal', trustMap)).toBe(false);
      expect(canProviderAccessTool('untrusted', 'sensitive', trustMap)).toBe(false);
      expect(canProviderAccessTool('untrusted', 'critical', trustMap)).toBe(false);
    });

    it('internal-only provider blocks sensitive and critical', () => {
      const trustMap = { limited: { maxDataSensitivity: 'internal' as const } };
      expect(canProviderAccessTool('limited', 'none', trustMap)).toBe(true);
      expect(canProviderAccessTool('limited', 'internal', trustMap)).toBe(true);
      expect(canProviderAccessTool('limited', 'sensitive', trustMap)).toBe(false);
      expect(canProviderAccessTool('limited', 'critical', trustMap)).toBe(false);
    });

    it('sensitivity hierarchy is strictly enforced: none < internal < sensitive < critical', () => {
      const levels = ['none', 'internal', 'sensitive', 'critical'] as const;
      for (let maxLevel = 0; maxLevel < levels.length; maxLevel++) {
        const trustMap = { test: { maxDataSensitivity: levels[maxLevel] } };
        for (let requestLevel = 0; requestLevel < levels.length; requestLevel++) {
          const allowed = canProviderAccessTool('test', levels[requestLevel], trustMap);
          expect(allowed, `max=${levels[maxLevel]}, request=${levels[requestLevel]}`).toBe(requestLevel <= maxLevel);
        }
      }
    });
  });

  // ---- Intent contract violations ----

  describe('intent contract enforcement', () => {
    it('empty message produces valid intent', () => {
      const intent = resolveAgentIntent({ userMessage: '', roleId: 'coo', roleName: 'COO' });
      expect(intent.executionIntent).toBeTruthy();
      expect(intent.businessIntent).toBeTruthy();
      expect(intent.definitionOfDone.length).toBeGreaterThan(0);
    });

    it('extremely long message does not crash', () => {
      const longMsg = 'a'.repeat(100_000);
      expect(() => resolveAgentIntent({ userMessage: longMsg, roleId: 'coo', roleName: 'COO' })).not.toThrow();
    });

    it('malicious message does not crash', () => {
      const messages = [
        '<script>alert("xss")</script>',
        "'; DROP TABLE agents; --",
        '{{__proto__.polluted}}',
        '${process.exit(1)}',
      ];
      for (const msg of messages) {
        expect(() => resolveAgentIntent({ userMessage: msg, roleId: 'coo', roleName: 'COO' })).not.toThrow();
      }
    });
  });

  // ---- Plan contract enforcement ----

  describe('plan contract enforcement', () => {
    it('plan with zero tools is still valid', () => {
      const intent = resolveAgentIntent({ userMessage: 'Test', roleId: 'coo', roleName: 'COO' });
      const plan = planAgentTurn({
        intent, role: makeRole(),
        providerId: 'claude', providerName: 'Claude', providerTrustLevel: 'critical',
        availableTools: [], blockedByGuardrails: [], blockedByTrust: [],
        relevantMemoryCount: 0, memoryTokenEstimate: 0, hasEntityContext: false, config: {},
      });
      expect(plan.schemaVersion).toBe('agent-turn-plan-v1');
      expect(plan.tools.available).toBe(0);
    });

    it('plan always has a generated timestamp', () => {
      const intent = resolveAgentIntent({ userMessage: 'Test', roleId: 'x', roleName: 'X' });
      const plan = planAgentTurn({
        intent, role: makeRole(),
        providerId: 'claude', providerName: 'Claude', providerTrustLevel: 'critical',
        availableTools: [], blockedByGuardrails: [], blockedByTrust: [],
        relevantMemoryCount: 0, memoryTokenEstimate: 0, hasEntityContext: false, config: {},
      });
      expect(plan.generatedAt).toBeInstanceOf(Date);
    });
  });

  // ---- Memory quality violations ----

  describe('memory quality enforcement', () => {
    it('memory from the future has freshness > 1 (detectable anomaly)', () => {
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const quality = assessMemoryQuality({
        createdAt: futureDate, accessCount: 0, source: 'conversation', layer: 'DEEP',
      });
      // Freshness > 1 is a signal that the timestamp is wrong
      expect(quality.freshness).toBeGreaterThan(1);
    });

    it('unknown source gets lowest confidence', () => {
      const quality = assessMemoryQuality({
        createdAt: new Date(), accessCount: 0, source: 'garbage_source', layer: 'DEEP',
      });
      expect(quality.provenance).toBe('unknown');
      expect(quality.confidence).toBeLessThan(0.5);
    });

    it('detects contradictions across many memories', () => {
      const memories = Array.from({ length: 100 }, (_, i) => ({
        id: `m-${i}`,
        summary: i % 2 === 0 ? 'Prefers navy' : 'Prefers gray',
        clientId: 'c-1',
        tags: ['preference'],
      }));
      const contradictions = detectContradictions(memories);
      // Every even-odd pair for the same client + tags = contradiction
      expect(contradictions.length).toBeGreaterThan(0);
    });
  });
});
