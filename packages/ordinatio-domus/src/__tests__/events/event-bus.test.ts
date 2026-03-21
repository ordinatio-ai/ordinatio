// ===========================================
// ORDINATIO DOMUS — Event Bus Tests
// ===========================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createEventBus } from '../../events/event-bus';
import type { EventBus } from '../../events/event-bus';
import type { DomusEvent } from '../../events/event-types';

function makeEvent(overrides: Partial<DomusEvent> = {}): DomusEvent {
  return {
    source: 'test',
    type: 'test.event',
    data: {},
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('Event Bus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = createEventBus();
  });

  // ---- Core emit/subscribe ----

  describe('emit and subscribe', () => {
    it('delivers event to matching subscriber', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      bus.subscribe('email.synced', handler);

      await bus.emit(makeEvent({ source: 'email', type: 'email.synced', data: { id: '1' } }));

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].type).toBe('email.synced');
      expect(handler.mock.calls[0][0].data).toEqual({ id: '1' });
    });

    it('does NOT deliver event to non-matching subscriber', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      bus.subscribe('task.completed', handler);

      await bus.emit(makeEvent({ source: 'email', type: 'email.synced' }));

      expect(handler).not.toHaveBeenCalled();
    });

    it('delivers to multiple subscribers of same event', async () => {
      const h1 = vi.fn().mockResolvedValue(undefined);
      const h2 = vi.fn().mockResolvedValue(undefined);
      bus.subscribe('job.failed', h1);
      bus.subscribe('job.failed', h2);

      await bus.emit(makeEvent({ source: 'jobs', type: 'job.failed' }));

      expect(h1).toHaveBeenCalledOnce();
      expect(h2).toHaveBeenCalledOnce();
    });

    it('delivers to wildcard subscriber for any event', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      bus.subscribe('*', handler);

      await bus.emit(makeEvent({ source: 'email', type: 'email.synced' }));
      await bus.emit(makeEvent({ source: 'jobs', type: 'job.failed' }));
      await bus.emit(makeEvent({ source: 'auth', type: 'auth.login_success' }));

      expect(handler).toHaveBeenCalledTimes(3);
    });

    it('does NOT deliver event back to the source module', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      bus.subscribe('email.synced', handler, 'email');

      await bus.emit(makeEvent({ source: 'email', type: 'email.synced' }));

      expect(handler).not.toHaveBeenCalled();
    });

    it('delivers event to other modules (not source)', async () => {
      const emailHandler = vi.fn().mockResolvedValue(undefined);
      const tasksHandler = vi.fn().mockResolvedValue(undefined);
      bus.subscribe('email.synced', emailHandler, 'email');
      bus.subscribe('email.synced', tasksHandler, 'tasks');

      await bus.emit(makeEvent({ source: 'email', type: 'email.synced' }));

      expect(emailHandler).not.toHaveBeenCalled();
      expect(tasksHandler).toHaveBeenCalledOnce();
    });

    it('handles emit with no subscribers gracefully', async () => {
      await expect(bus.emit(makeEvent())).resolves.toBeUndefined();
    });
  });

  // ---- Module registration ----

  describe('register', () => {
    it('registers a module with emits and subscribers', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);

      bus.register('tasks', {
        emits: ['task.created', 'task.completed'],
        buildSubscribers: () => ({
          'email.synced': handler,
        }),
      }, null, {});

      // Emit email.synced — tasks should receive it
      await bus.emit(makeEvent({ source: 'email', type: 'email.synced' }));
      expect(handler).toHaveBeenCalledOnce();

      // Check topology
      const topo = bus.getTopology();
      expect(topo.modules.tasks.emits).toEqual(['task.created', 'task.completed']);
      expect(topo.modules.tasks.subscribesTo).toContain('email.synced');
    });

    it('passes db and modules to buildSubscribers', () => {
      const buildSubscribers = vi.fn().mockReturnValue({});
      const mockDb = { prisma: true };
      const mockModules = { email: {}, tasks: {} };

      bus.register('jobs', {
        emits: ['job.completed'],
        buildSubscribers,
      }, mockDb, mockModules);

      expect(buildSubscribers).toHaveBeenCalledWith(mockDb, mockModules);
    });

    it('handles module with no subscribers', async () => {
      bus.register('settings', { emits: ['settings.changed'] }, null, {});

      const topo = bus.getTopology();
      expect(topo.modules.settings.emits).toEqual(['settings.changed']);
      expect(topo.modules.settings.subscribesTo).toEqual([]);
    });
  });

  // ---- Feature flag gating ----

  describe('feature flags', () => {
    it('blocks subscription when feature flag is off', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      bus.register('tasks', {
        emits: [],
        buildSubscribers: () => ({ 'email.synced': handler }),
        featureGates: { 'email.synced': 'AUTO_TASK_FROM_EMAIL' },
      }, null, {});

      bus.setFeatureFlags({ AUTO_TASK_FROM_EMAIL: false });
      await bus.emit(makeEvent({ source: 'email', type: 'email.synced' }));
      expect(handler).not.toHaveBeenCalled();
    });

    it('allows subscription when feature flag is on', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      bus.register('tasks', {
        emits: [],
        buildSubscribers: () => ({ 'email.synced': handler }),
        featureGates: { 'email.synced': 'AUTO_TASK_FROM_EMAIL' },
      }, null, {});

      bus.setFeatureFlags({ AUTO_TASK_FROM_EMAIL: true });
      await bus.emit(makeEvent({ source: 'email', type: 'email.synced' }));
      expect(handler).toHaveBeenCalledOnce();
    });

    it('allows subscription with no feature gate', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      bus.register('activities', {
        emits: [],
        buildSubscribers: () => ({ '*': handler }),
      }, null, {});

      await bus.emit(makeEvent({ source: 'email', type: 'email.synced' }));
      expect(handler).toHaveBeenCalledOnce();
    });

    it('feature flags can be updated at runtime', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      bus.register('tasks', {
        emits: [],
        buildSubscribers: () => ({ 'email.synced': handler }),
        featureGates: { 'email.synced': 'AUTO_TASK' },
      }, null, {});

      bus.setFeatureFlags({ AUTO_TASK: false });
      await bus.emit(makeEvent({ source: 'email', type: 'email.synced' }));
      expect(handler).not.toHaveBeenCalled();

      bus.setFeatureFlags({ AUTO_TASK: true });
      await bus.emit(makeEvent({ source: 'email', type: 'email.synced' }));
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  // ---- Error isolation ----

  describe('error isolation', () => {
    it('continues delivering to other subscribers when one throws', async () => {
      const badHandler = vi.fn().mockRejectedValue(new Error('subscriber boom'));
      const goodHandler = vi.fn().mockResolvedValue(undefined);

      bus.subscribe('test.event', badHandler);
      bus.subscribe('test.event', goodHandler);

      await bus.emit(makeEvent());

      expect(badHandler).toHaveBeenCalled();
      expect(goodHandler).toHaveBeenCalled();
    });

    it('records errors from failed subscribers', async () => {
      bus.subscribe('test.event', vi.fn().mockRejectedValue(new Error('boom')));
      await bus.emit(makeEvent());

      const errors = bus.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].error).toBe('boom');
      expect(errors[0].event.type).toBe('test.event');
    });

    it('emit never throws even if all subscribers fail', async () => {
      bus.subscribe('test.event', vi.fn().mockRejectedValue(new Error('fail1')));
      bus.subscribe('test.event', vi.fn().mockRejectedValue(new Error('fail2')));

      await expect(bus.emit(makeEvent())).resolves.toBeUndefined();
      expect(bus.getErrors()).toHaveLength(2);
    });
  });

  // ---- Topology ----

  describe('getTopology', () => {
    it('returns empty topology for no registrations', () => {
      const topo = bus.getTopology();
      expect(topo.modules).toEqual({});
      expect(topo.totalEventTypes).toBe(0);
      expect(topo.totalSubscriptions).toBe(0);
    });

    it('returns correct topology for multiple modules', () => {
      bus.register('email', {
        emits: ['email.synced', 'email.archived'],
        buildSubscribers: () => ({ 'task.completed': vi.fn() }),
      }, null, {});

      bus.register('tasks', {
        emits: ['task.created', 'task.completed'],
        buildSubscribers: () => ({ 'email.synced': vi.fn() }),
      }, null, {});

      const topo = bus.getTopology();
      expect(topo.modules.email.emits).toEqual(['email.synced', 'email.archived']);
      expect(topo.modules.email.subscribesTo).toEqual(['task.completed']);
      expect(topo.modules.tasks.emits).toEqual(['task.created', 'task.completed']);
      expect(topo.modules.tasks.subscribesTo).toEqual(['email.synced']);
      expect(topo.totalEventTypes).toBe(4);
      expect(topo.totalSubscriptions).toBe(2);
    });
  });

  // ---- Shutdown ----

  describe('shutdown', () => {
    it('clears all subscriptions and registrations', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      bus.subscribe('test.event', handler);
      bus.register('test', { emits: ['test.event'] }, null, {});

      bus.shutdown();

      await bus.emit(makeEvent());
      expect(handler).not.toHaveBeenCalled();
      expect(bus.getTopology().modules).toEqual({});
      expect(bus.getErrors()).toEqual([]);
    });
  });

  // ---- Multi-tenant ----

  describe('multi-tenant', () => {
    it('passes organizationId through to subscribers', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      bus.subscribe('job.completed', handler);

      await bus.emit(makeEvent({
        source: 'jobs',
        type: 'job.completed',
        organizationId: 'org-123',
        data: { jobId: 'j1' },
      }));

      expect(handler.mock.calls[0][0].organizationId).toBe('org-123');
    });
  });
});
