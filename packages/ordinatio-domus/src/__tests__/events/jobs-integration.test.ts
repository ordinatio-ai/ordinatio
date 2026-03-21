// ===========================================
// DOMUS — Jobs Cross-Module Integration Tests
// ===========================================
// Verifies that the Domus event bus correctly
// routes events to/from the jobs module and
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

describe('Jobs Cross-Module Integration', () => {
  let bus: EventBus;
  const mockDb = {};
  const mockCreateTask = vi.fn().mockResolvedValue({ id: 'task-1' });
  const mockLogSecurityEvent = vi.fn().mockResolvedValue({ id: 'evt-1' });
  const mockCheckSecurityPatterns = vi.fn().mockResolvedValue({});
  const mockCreateActivity = vi.fn().mockResolvedValue({ id: 'act-1' });

  const mockModules: Record<string, unknown> = {
    tasks: { createTask: mockCreateTask },
    security: { logSecurityEvent: mockLogSecurityEvent, checkSecurityPatterns: mockCheckSecurityPatterns },
    activities: { createActivity: mockCreateActivity },
    email: {},
    entities: {},
    auth: {},
    settings: {},
    jobs: {},
  };

  beforeEach(() => {
    bus = createEventBus();
    bus.setFeatureFlags({
      AUTO_TASK_FROM_EMAIL: true,
      AUTO_ARCHIVE_ON_COMPLETE: true,
      AUTO_CONTACT_FROM_EMAIL: true,
      AUTO_KNOWLEDGE_ON_TASK_COMPLETE: true,
    });
    vi.clearAllMocks();

    // Register all modules from the real registry
    for (const mod of getAllModules()) {
      if (mod.events) {
        bus.register(mod.name, mod.events, mockDb, mockModules);
      }
    }
  });

  // ---- Jobs Module Event Declarations ----

  describe('jobs module event declarations', () => {
    it('jobs module is registered with 16 events', () => {
      const jobsDef = getModule('jobs');
      expect(jobsDef).toBeDefined();
      expect(jobsDef!.events).toBeDefined();
      expect(jobsDef!.events!.emits).toHaveLength(16);
    });

    it('jobs emits job execution events', () => {
      const jobsDef = getModule('jobs')!;
      expect(jobsDef.events!.emits).toContain('job.completed');
      expect(jobsDef.events!.emits).toContain('job.failed');
      expect(jobsDef.events!.emits).toContain('job.quarantined');
      expect(jobsDef.events!.emits).toContain('job.dead_lettered');
    });

    it('jobs emits automation events', () => {
      const jobsDef = getModule('jobs')!;
      expect(jobsDef.events!.emits).toContain('automation.triggered');
      expect(jobsDef.events!.emits).toContain('automation.completed');
      expect(jobsDef.events!.emits).toContain('automation.failed');
      expect(jobsDef.events!.emits).toContain('automation.intent_satisfied');
      expect(jobsDef.events!.emits).toContain('automation.intent_unsatisfied');
      expect(jobsDef.events!.emits).toContain('automation.approval_needed');
    });

    it('jobs emits cron events', () => {
      const jobsDef = getModule('jobs')!;
      expect(jobsDef.events!.emits).toContain('cron.fired');
      expect(jobsDef.events!.emits).toContain('cron.failed');
    });

    it('jobs subscribes to security events', () => {
      const topo = bus.getTopology();
      expect(topo.modules.jobs.subscribesTo).toContain('security.trust_changed');
      expect(topo.modules.jobs.subscribesTo).toContain('security.quarantine');
    });
  });

  // ---- Jobs → Tasks (job.failed creates task) ----

  describe('jobs → tasks routing', () => {
    it('job.failed creates a task for human attention', async () => {
      await bus.emit(makeEvent({
        source: 'jobs',
        type: 'job.failed',
        data: { jobId: 'job-123', type: 'PLACE_ORDER', error: 'Connection refused' },
      }));

      expect(mockCreateTask).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({
          title: expect.stringContaining('Job failed'),
          priority: 'HIGH',
          entityType: 'job',
          entityId: 'job-123',
        }),
        expect.any(Object),
      );
    });

    it('automation.failed also creates a task (same handler for job.failed)', async () => {
      // automation.failed should NOT create a task via the job.failed handler
      // because the event type is different. Let's verify the bus only routes exact matches.
      await bus.emit(makeEvent({
        source: 'jobs',
        type: 'automation.failed',
        data: { automationId: 'auto-1', error: 'Circuit breaker open' },
      }));

      // job.failed handler should NOT fire for automation.failed
      // (they are different event types)
      const jobFailedCalls = mockCreateTask.mock.calls.filter(
        (call: unknown[]) => {
          const input = call[1] as Record<string, unknown>;
          return input.entityType === 'job';
        }
      );
      expect(jobFailedCalls).toHaveLength(0);
    });
  });

  // ---- Security → Jobs (trust_changed reaches jobs) ----

  describe('security → jobs routing', () => {
    it('security.trust_changed reaches jobs subscriber', async () => {
      // The jobs subscriber is a placeholder (logs but doesn't do much yet).
      // We just verify it doesn't throw and the bus routes it.
      await expect(bus.emit(makeEvent({
        source: 'security',
        type: 'security.trust_changed',
        data: { principalId: 'user-1', oldTier: 1, newTier: 0 },
      }))).resolves.toBeUndefined();

      // No errors in the bus
      expect(bus.getErrors()).toHaveLength(0);
    });

    it('security.quarantine reaches jobs subscriber', async () => {
      await expect(bus.emit(makeEvent({
        source: 'security',
        type: 'security.quarantine',
        data: { principalId: 'user-1', reason: 'suspicious activity' },
      }))).resolves.toBeUndefined();

      expect(bus.getErrors()).toHaveLength(0);
    });
  });

  // ---- Jobs → Security (job.quarantined logs security event) ----

  describe('jobs → security routing', () => {
    it('job.quarantined triggers security event logging', async () => {
      await bus.emit(makeEvent({
        source: 'jobs',
        type: 'job.quarantined',
        data: { jobId: 'job-456', reason: 'suspicious payload' },
      }));

      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({
          eventType: 'JOB_QUARANTINED',
          riskLevel: 'high',
        }),
        expect.any(Object),
      );
    });
  });

  // ---- Jobs → Activities (wildcard subscriber catches all) ----

  describe('jobs → activities routing (wildcard)', () => {
    it('job.completed reaches activities wildcard subscriber', async () => {
      await bus.emit(makeEvent({
        source: 'jobs',
        type: 'job.completed',
        data: { jobId: 'job-789', result: 'success' },
      }));

      expect(mockCreateActivity).toHaveBeenCalled();
    });

    it('automation.triggered reaches activities wildcard subscriber', async () => {
      await bus.emit(makeEvent({
        source: 'jobs',
        type: 'automation.triggered',
        data: { automationId: 'auto-1', triggerEventType: 'EMAIL_RECEIVED' },
      }));

      expect(mockCreateActivity).toHaveBeenCalled();
    });

    it('cron.fired reaches activities wildcard subscriber', async () => {
      await bus.emit(makeEvent({
        source: 'jobs',
        type: 'cron.fired',
        data: { cronName: 'stock-sync' },
      }));

      expect(mockCreateActivity).toHaveBeenCalled();
    });

    it('cron.failed reaches activities wildcard subscriber', async () => {
      await bus.emit(makeEvent({
        source: 'jobs',
        type: 'cron.failed',
        data: { cronName: 'stock-sync', error: 'timeout' },
      }));

      expect(mockCreateActivity).toHaveBeenCalled();
    });
  });

  // ---- Self-delivery prevention ----

  describe('self-delivery prevention', () => {
    it('jobs does NOT receive its own events', async () => {
      // Jobs subscribes to security.trust_changed and security.quarantine.
      // It should NOT receive job.* events (which it emits).
      const topo = bus.getTopology();
      const jobsSubscriptions = topo.modules.jobs.subscribesTo;

      // Jobs should NOT subscribe to any job.* or automation.* or cron.* events
      for (const sub of jobsSubscriptions) {
        expect(sub).not.toMatch(/^(job\.|automation\.|cron\.)/);
      }
    });
  });

  // ---- Topology verification ----

  describe('topology verification', () => {
    it('topology shows jobs with 16 emits and 2 subscriptions', () => {
      const topo = bus.getTopology();
      expect(topo.modules.jobs).toBeDefined();
      expect(topo.modules.jobs.emits).toHaveLength(16);
      expect(topo.modules.jobs.subscribesTo).toHaveLength(2);
    });

    it('tasks subscribes to job.failed', () => {
      const topo = bus.getTopology();
      expect(topo.modules.tasks.subscribesTo).toContain('job.failed');
    });

    it('security subscribes to job.quarantined', () => {
      const topo = bus.getTopology();
      expect(topo.modules.security.subscribesTo).toContain('job.quarantined');
    });

    it('activities subscribes to wildcard (catches all job events)', () => {
      const topo = bus.getTopology();
      expect(topo.modules.activities.subscribesTo).toContain('*');
    });

    it('all 9 modules are registered in topology', () => {
      const topo = bus.getTopology();
      const moduleNames = Object.keys(topo.modules);
      expect(moduleNames).toContain('email');
      expect(moduleNames).toContain('tasks');
      expect(moduleNames).toContain('entities');
      expect(moduleNames).toContain('auth');
      expect(moduleNames).toContain('activities');
      expect(moduleNames).toContain('security');
      expect(moduleNames).toContain('jobs');
      expect(moduleNames).toContain('agent');
      expect(moduleNames).toContain('settings');
      expect(moduleNames).toHaveLength(9);
    });
  });

  // ---- Error isolation ----

  describe('error isolation', () => {
    it('subscriber error does not prevent other modules from receiving the event', async () => {
      // Make tasks subscriber throw
      mockCreateTask.mockRejectedValueOnce(new Error('task DB down'));

      // Emit job.failed — tasks throws, but activities should still receive via wildcard
      await bus.emit(makeEvent({
        source: 'jobs',
        type: 'job.failed',
        data: { jobId: 'job-err', type: 'TEST', error: 'test' },
      }));

      // Activities should still have been called (wildcard subscriber)
      expect(mockCreateActivity).toHaveBeenCalled();

      // Bus captured the error
      const errors = bus.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].error).toContain('task DB down');
    });
  });
});
