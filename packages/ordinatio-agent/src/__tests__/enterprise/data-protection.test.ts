// ===========================================
// ENTERPRISE TEST: Data Protection
// ===========================================
// Prove that sensitive data is blocked from
// untrusted providers, guardrails hold under
// every bypass attempt, and trust hierarchy
// is enforced without exceptions.
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import { registerTool, registerTools, getTool, clearTools, getToolsForRole } from '../../registry/tool-registry';
import { registerRole, clearRoles } from '../../registry/role-registry';
import { filterToolsByGuardrails } from '../../guardrails/agent-guardrails';
import { canProviderAccessTool } from '../../guardrails/provider-policy';
import type { AgentTool, AgentRole } from '../../types';

function makeTool(name: string, module: string, sensitivity: AgentTool['dataSensitivity'] = 'none'): AgentTool {
  return {
    name, description: `Tool ${name}`, module,
    method: 'GET', endpoint: `/api/${name}`, auth: 'session_cookie',
    params: [], example: {}, responseShape: '{}', whenToUse: 'test',
    dataSensitivity: sensitivity,
  };
}

describe('Data Protection Tests', () => {
  beforeEach(() => { clearTools(); clearRoles(); });

  describe('provider trust blocks sensitive data from untrusted providers', () => {
    const providers = [
      { id: 'deepseek', trust: 'none' as const },
      { id: 'mistral', trust: 'internal' as const },
      { id: 'openai', trust: 'sensitive' as const },
      { id: 'claude', trust: 'critical' as const },
    ];

    const tools = [
      { name: 'public_search', sensitivity: 'none' as const },
      { name: 'list_orders', sensitivity: 'internal' as const },
      { name: 'get_client_details', sensitivity: 'sensitive' as const },
      { name: 'get_payment_info', sensitivity: 'critical' as const },
    ];

    const trustMap: Record<string, { maxDataSensitivity: 'none' | 'internal' | 'sensitive' | 'critical' }> = {};
    for (const p of providers) {
      trustMap[p.id] = { maxDataSensitivity: p.trust };
    }

    for (const provider of providers) {
      for (const tool of tools) {
        const sensitivityOrder = ['none', 'internal', 'sensitive', 'critical'];
        const providerLevel = sensitivityOrder.indexOf(provider.trust);
        const toolLevel = sensitivityOrder.indexOf(tool.sensitivity);
        const shouldAllow = toolLevel <= providerLevel;

        it(`${provider.id} (${provider.trust}) ${shouldAllow ? 'CAN' : 'CANNOT'} access ${tool.name} (${tool.sensitivity})`, () => {
          expect(canProviderAccessTool(provider.id, tool.sensitivity, trustMap)).toBe(shouldAllow);
        });
      }
    }
  });

  describe('guardrails cannot be bypassed', () => {
    it('disabling a module blocks ALL tools in that module — no exceptions', () => {
      registerTools([
        makeTool('email_read', 'email', 'internal'),
        makeTool('email_send', 'email', 'sensitive'),
        makeTool('email_delete', 'email', 'critical'),
        makeTool('order_list', 'orders', 'internal'),
      ]);

      const guardrails = [{ module: 'email', enabled: false }];
      const filtered = filterToolsByGuardrails(
        [makeTool('email_read', 'email'), makeTool('email_send', 'email'), makeTool('email_delete', 'email'), makeTool('order_list', 'orders')],
        guardrails,
      );

      expect(filtered.every(t => t.module !== 'email')).toBe(true);
      expect(filtered.some(t => t.module === 'orders')).toBe(true);
    });

    it('protected modules (memory, auth, chat) NEVER disabled regardless of guardrails', () => {
      const tools = [
        makeTool('remember', 'memory', 'internal'),
        makeTool('auth_check', 'auth', 'sensitive'),
        makeTool('chat_send', 'chat', 'none'),
      ];

      // Try to disable all three protected modules
      const guardrails = [
        { module: 'memory', enabled: false },
        { module: 'auth', enabled: false },
        { module: 'chat', enabled: false },
      ];

      const filtered = filterToolsByGuardrails(tools, guardrails);
      expect(filtered).toHaveLength(3); // ALL kept — protected
    });

    it('role toolNames filter does not bypass module guardrails', () => {
      registerTools([
        makeTool('blocked_tool', 'disabled_module'),
        makeTool('allowed_tool', 'enabled_module'),
      ]);

      const tools = getToolsForRole('role', { roleToolNames: ['blocked_tool', 'allowed_tool'] });
      const guardrails = [{ module: 'disabled_module', enabled: false }];
      const filtered = filterToolsByGuardrails(tools, guardrails);

      expect(filtered.some(t => t.name === 'blocked_tool')).toBe(false);
      expect(filtered.some(t => t.name === 'allowed_tool')).toBe(true);
    });
  });

  describe('sensitivity levels cannot be circumvented', () => {
    it('tool without dataSensitivity is treated as accessible (default: none)', () => {
      const tool = makeTool('no_sensitivity', 'test');
      delete (tool as any).dataSensitivity;
      const sensitivity = tool.dataSensitivity ?? 'none';
      expect(canProviderAccessTool('restricted', sensitivity, { restricted: { maxDataSensitivity: 'none' } })).toBe(true);
    });

    it('upgrading sensitivity after registration is reflected in trust checks', () => {
      registerTool(makeTool('evolving_tool', 'test', 'none'));
      // Re-register with higher sensitivity
      registerTool(makeTool('evolving_tool', 'test', 'critical'));
      const tool = getTool('evolving_tool')!;
      expect(tool.dataSensitivity).toBe('critical');
      // Now a restricted provider should be blocked
      expect(canProviderAccessTool('restricted', tool.dataSensitivity!, { restricted: { maxDataSensitivity: 'internal' } })).toBe(false);
    });
  });

  describe('trust enforcement is complete across all tools and providers', () => {
    it('every tool is checked against every provider in a full matrix', () => {
      const sensitivities: Array<'none' | 'internal' | 'sensitive' | 'critical'> = ['none', 'internal', 'sensitive', 'critical'];
      const levels: Array<'none' | 'internal' | 'sensitive' | 'critical'> = ['none', 'internal', 'sensitive', 'critical'];

      let totalChecks = 0;
      for (const maxSensitivity of levels) {
        for (const toolSensitivity of sensitivities) {
          const result = canProviderAccessTool('test', toolSensitivity, { test: { maxDataSensitivity: maxSensitivity } });
          const expected = sensitivities.indexOf(toolSensitivity) <= sensitivities.indexOf(maxSensitivity);
          expect(result, `max=${maxSensitivity}, tool=${toolSensitivity}`).toBe(expected);
          totalChecks++;
        }
      }
      expect(totalChecks).toBe(16); // 4x4 matrix fully covered
    });
  });
});
