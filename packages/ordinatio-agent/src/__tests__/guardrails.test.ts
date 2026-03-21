import { describe, it, expect } from 'vitest';
import { filterToolsByGuardrails, isModuleEnabled } from '../guardrails/agent-guardrails';
import { canProviderAccessTool } from '../guardrails/provider-policy';
import { getAccessDenialMessage } from '../guardrails/access-denial';
import type { AgentTool, AgentGuardrail } from '../types';

function makeTool(module: string, name?: string): AgentTool {
  return {
    name: name ?? `${module}_tool`, description: 'test', module,
    method: 'GET', endpoint: '/api/test', auth: 'session_cookie',
    params: [], example: {}, responseShape: '{}', whenToUse: 'test',
  };
}

describe('Guardrails', () => {
  describe('filterToolsByGuardrails', () => {
    it('keeps tools from enabled modules', () => {
      const tools = [makeTool('email'), makeTool('tasks')];
      const guardrails: AgentGuardrail[] = [
        { module: 'email', enabled: true },
        { module: 'tasks', enabled: true },
      ];
      expect(filterToolsByGuardrails(tools, guardrails)).toHaveLength(2);
    });

    it('removes tools from disabled modules', () => {
      const tools = [makeTool('email'), makeTool('tasks')];
      const guardrails: AgentGuardrail[] = [
        { module: 'email', enabled: true },
        { module: 'tasks', enabled: false },
      ];
      const filtered = filterToolsByGuardrails(tools, guardrails);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].module).toBe('email');
    });

    it('always keeps memory and auth tools', () => {
      const tools = [makeTool('memory'), makeTool('auth'), makeTool('chat')];
      const guardrails: AgentGuardrail[] = [
        { module: 'memory', enabled: false },
        { module: 'auth', enabled: false },
        { module: 'chat', enabled: false },
      ];
      // Memory, auth, chat are always-enabled
      const filtered = filterToolsByGuardrails(tools, guardrails);
      expect(filtered).toHaveLength(3);
    });

    it('keeps tools when no guardrail matches (default: enabled)', () => {
      const tools = [makeTool('unknown_module')];
      const guardrails: AgentGuardrail[] = [{ module: 'email', enabled: true }];
      expect(filterToolsByGuardrails(tools, guardrails)).toHaveLength(1);
    });
  });

  describe('isModuleEnabled', () => {
    it('returns true for enabled module', () => {
      expect(isModuleEnabled('email', [{ module: 'email', enabled: true }])).toBe(true);
    });

    it('returns false for disabled module', () => {
      expect(isModuleEnabled('email', [{ module: 'email', enabled: false }])).toBe(false);
    });

    it('returns true for unlisted module (default)', () => {
      expect(isModuleEnabled('unknown', [{ module: 'email', enabled: true }])).toBe(true);
    });

    it('always returns true for memory/auth/chat', () => {
      expect(isModuleEnabled('memory', [{ module: 'memory', enabled: false }])).toBe(true);
      expect(isModuleEnabled('auth', [{ module: 'auth', enabled: false }])).toBe(true);
      expect(isModuleEnabled('chat', [{ module: 'chat', enabled: false }])).toBe(true);
    });
  });
});

describe('Provider Policy', () => {
  describe('canProviderAccessTool', () => {
    it('allows access with default trust map (all trusted)', () => {
      expect(canProviderAccessTool('claude', 'critical')).toBe(true);
      expect(canProviderAccessTool('deepseek', 'critical')).toBe(true);
    });

    it('blocks access with restrictive trust map', () => {
      const trustMap = { deepseek: { maxDataSensitivity: 'none' as const } };
      expect(canProviderAccessTool('deepseek', 'internal', trustMap)).toBe(false);
      expect(canProviderAccessTool('deepseek', 'none', trustMap)).toBe(true);
    });

    it('restricts unknown provider to none-level access only', () => {
      expect(canProviderAccessTool('unknown_provider', 'none', {})).toBe(true);
      expect(canProviderAccessTool('unknown_provider', 'critical', {})).toBe(false);
    });

    it('respects sensitivity hierarchy: none < internal < sensitive < critical', () => {
      const trustMap = { restricted: { maxDataSensitivity: 'internal' as const } };
      expect(canProviderAccessTool('restricted', 'none', trustMap)).toBe(true);
      expect(canProviderAccessTool('restricted', 'internal', trustMap)).toBe(true);
      expect(canProviderAccessTool('restricted', 'sensitive', trustMap)).toBe(false);
      expect(canProviderAccessTool('restricted', 'critical', trustMap)).toBe(false);
    });
  });
});

describe('Access Denial', () => {
  describe('getAccessDenialMessage', () => {
    it('returns message for module_disabled', () => {
      const msg = getAccessDenialMessage('module_disabled', { module: 'email' });
      expect(msg).toBeTruthy();
      expect(typeof msg).toBe('string');
    });

    it('returns message for provider_policy', () => {
      const msg = getAccessDenialMessage('provider_policy', { provider: 'deepseek', tool: 'get_client' });
      expect(msg).toBeTruthy();
    });

    it('returns message for system_error', () => {
      const msg = getAccessDenialMessage('system_error', {});
      expect(msg).toBeTruthy();
    });

    it('returns generic message for unknown reason', () => {
      const msg = getAccessDenialMessage('unknown_reason' as any);
      expect(msg).toBeTruthy();
    });
  });
});
