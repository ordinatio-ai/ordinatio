// ===========================================
// DOMUS — Agent Cross-Module Integration Tests
// ===========================================
// Verifies that the Domus event bus correctly
// routes events to/from the agent module and
// all other modules that interact with it.
// ===========================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createEventBus } from '../../events/event-bus';
import type { EventBus } from '../../events/event-bus';
import type { DomusEvent } from '../../events/event-types';
import { getModule, getAllModules } from '../../wiring/registry';

function makeEvent(overrides: Partial<DomusEvent> = {}): DomusEvent {
  return {
    source: 'test',
    type: 'test.event',
    data: {},
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('Agent Cross-Module Integration', () => {
  let bus: EventBus;
  const mockDb = {};
  const mockCreateTask = vi.fn().mockResolvedValue({ id: 'task-1' });
  const mockCreateActivity = vi.fn().mockResolvedValue({ id: 'act-1' });
  const mockClearProviderCache = vi.fn();

  const mockModules: Record<string, unknown> = {
    tasks: { createTask: mockCreateTask },
    security: {},
    activities: { createActivity: mockCreateActivity },
    email: {},
    entities: {},
    auth: {},
    settings: {},
    jobs: {},
    agent: { clearProviderCache: mockClearProviderCache },
  };

  beforeEach(() => {
    bus = createEventBus();
    bus.setFeatureFlags({});
    vi.clearAllMocks();

    for (const mod of getAllModules()) {
      if (mod.events) {
        bus.register(mod.name, mod.events, mockDb, mockModules);
      }
    }
  });

  // ---- Agent Module Event Declarations ----

  describe('agent module event declarations', () => {
    it('agent module is registered with 7 events', () => {
      const agentDef = getModule('agent');
      expect(agentDef).toBeDefined();
      expect(agentDef!.events).toBeDefined();
      expect(agentDef!.events!.emits).toHaveLength(7);
    });

    it('agent emits chat and tool events', () => {
      const agentDef = getModule('agent')!;
      expect(agentDef.events!.emits).toContain('agent.chat_completed');
      expect(agentDef.events!.emits).toContain('agent.tool_executed');
      expect(agentDef.events!.emits).toContain('agent.tool_blocked');
    });

    it('agent emits memory events', () => {
      const agentDef = getModule('agent')!;
      expect(agentDef.events!.emits).toContain('agent.memory_created');
      expect(agentDef.events!.emits).toContain('agent.memory_expired');
    });

    it('agent emits provider and approval events', () => {
      const agentDef = getModule('agent')!;
      expect(agentDef.events!.emits).toContain('agent.provider_failed');
      expect(agentDef.events!.emits).toContain('agent.approval_requested');
    });

    it('agent subscribes to security and settings events', () => {
      const topo = bus.getTopology();
      expect(topo.modules.agent.subscribesTo).toContain('security.trust_changed');
      expect(topo.modules.agent.subscribesTo).toContain('settings.changed');
    });
  });

  // ---- Security → Agent (trust_changed clears provider cache) ----

  describe('security → agent routing', () => {
    it('security.trust_changed triggers provider cache clear', async () => {
      await bus.emit(makeEvent({
        source: 'security',
        type: 'security.trust_changed',
        data: { principalId: 'user-1', oldTier: 2, newTier: 0 },
      }));

      expect(mockClearProviderCache).toHaveBeenCalled();
    });
  });

  // ---- Settings → Agent (LLM key change clears provider cache) ----

  describe('settings → agent routing', () => {
    it('settings.changed with LLM key triggers provider cache clear', async () => {
      await bus.emit(makeEvent({
        source: 'settings',
        type: 'settings.changed',
        data: { key: 'llm_provider', value: 'openai' },
      }));

      expect(mockClearProviderCache).toHaveBeenCalled();
    });

    it('settings.changed with API key triggers provider cache clear', async () => {
      await bus.emit(makeEvent({
        source: 'settings',
        type: 'settings.changed',
        data: { key: 'openai_api_key', value: 'sk-new' },
      }));

      expect(mockClearProviderCache).toHaveBeenCalled();
    });

    it('settings.changed with non-LLM key does NOT clear provider cache', async () => {
      await bus.emit(makeEvent({
        source: 'settings',
        type: 'settings.changed',
        data: { key: 'admin_feed_enabled', value: 'true' },
      }));

      expect(mockClearProviderCache).not.toHaveBeenCalled();
    });
  });

  // ---- Agent → Activities (wildcard subscriber) ----

  describe('agent → activities routing (wildcard)', () => {
    it('agent.chat_completed reaches activities', async () => {
      await bus.emit(makeEvent({
        source: 'agent',
        type: 'agent.chat_completed',
        data: { role: 'coo', toolsCalled: 3 },
      }));

      expect(mockCreateActivity).toHaveBeenCalled();
    });

    it('agent.tool_executed reaches activities', async () => {
      await bus.emit(makeEvent({
        source: 'agent',
        type: 'agent.tool_executed',
        data: { tool: 'search_clients', role: 'coo' },
      }));

      expect(mockCreateActivity).toHaveBeenCalled();
    });

    it('agent.tool_blocked reaches activities', async () => {
      await bus.emit(makeEvent({
        source: 'agent',
        type: 'agent.tool_blocked',
        data: { tool: 'get_client', reason: 'provider_policy', provider: 'deepseek' },
      }));

      expect(mockCreateActivity).toHaveBeenCalled();
    });

    it('agent.approval_requested reaches activities', async () => {
      await bus.emit(makeEvent({
        source: 'agent',
        type: 'agent.approval_requested',
        data: { tool: 'send_email', role: 'coo' },
      }));

      expect(mockCreateActivity).toHaveBeenCalled();
    });
  });

  // ---- Self-delivery prevention ----

  describe('self-delivery prevention', () => {
    it('agent does NOT receive its own events', () => {
      const topo = bus.getTopology();
      const agentSubs = topo.modules.agent.subscribesTo;
      for (const sub of agentSubs) {
        expect(sub).not.toMatch(/^agent\./);
      }
    });
  });

  // ---- Topology verification ----

  describe('topology verification', () => {
    it('topology shows agent with 7 emits and 2 subscriptions', () => {
      const topo = bus.getTopology();
      expect(topo.modules.agent).toBeDefined();
      expect(topo.modules.agent.emits).toHaveLength(7);
      expect(topo.modules.agent.subscribesTo).toHaveLength(2);
    });

    it('all 9 modules are registered', () => {
      const topo = bus.getTopology();
      expect(Object.keys(topo.modules)).toHaveLength(9);
      expect(Object.keys(topo.modules)).toContain('agent');
    });
  });

  // ---- Error isolation ----

  describe('error isolation', () => {
    it('subscriber error does not block other modules', async () => {
      mockClearProviderCache.mockImplementationOnce(() => { throw new Error('cache clear failed'); });

      await bus.emit(makeEvent({
        source: 'security',
        type: 'security.trust_changed',
        data: { principalId: 'user-1' },
      }));

      // Bus captured the error but didn't crash
      expect(bus.getErrors().length).toBeGreaterThan(0);
      expect(bus.getErrors()[0].error).toContain('cache clear failed');
    });
  });
});
