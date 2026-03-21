// ===========================================
// TESTS: Agent Tools
// ===========================================

import { describe, it, expect } from 'vitest';
import { ACTIVITY_AGENT_TOOLS, createAgentToolHandlers } from '../agent-tools';
import type { ActivityDb, ActivityWithRelations } from '../types';

function makeMockDb(): ActivityDb {
  return {
    activityLog: {
      create: async (args: { data: Record<string, unknown> }) => ({
        id: 'new-1', ...args.data, createdAt: new Date(), resolvedAt: null, resolvedBy: null, user: null, order: null, client: null,
      }) as never,
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: args.where.id, action: 'test', description: 'test', severity: 'INFO', requiresResolution: false, createdAt: new Date(),
        ...args.data, system: false, metadata: null, orderId: null, clientId: null, placementAttemptId: null, user: null, order: null, client: null,
      }) as never,
      updateMany: async () => ({ count: 0 }),
      findMany: async () => [] as never,
      count: async () => 0,
    },
    $transaction: async (fn: (tx: ActivityDb) => Promise<unknown>) => fn(makeMockDb()),
  };
}

function makeActivity(
  overrides: Partial<ActivityWithRelations> & { action: string; createdAt: Date },
): ActivityWithRelations {
  return {
    id: `act-${Math.random().toString(36).slice(2, 8)}`,
    description: 'test',
    severity: 'INFO',
    requiresResolution: false,
    resolvedAt: null,
    resolvedBy: null,
    system: false,
    metadata: null,
    orderId: null,
    clientId: null,
    placementAttemptId: null,
    user: null,
    order: null,
    client: null,
    ...overrides,
  };
}

describe('ACTIVITY_AGENT_TOOLS catalog', () => {
  it('has 8 tools defined', () => {
    expect(Object.keys(ACTIVITY_AGENT_TOOLS)).toHaveLength(8);
  });

  it('all tools have required fields', () => {
    for (const [name, tool] of Object.entries(ACTIVITY_AGENT_TOOLS)) {
      expect(tool.name).toBe(name);
      expect(tool.description).toBeTruthy();
      expect(['none', 'internal', 'sensitive', 'critical']).toContain(tool.sensitivity);
      expect(['observe', 'suggest', 'act']).toContain(tool.riskLevel);
      expect(typeof tool.requiresApproval).toBe('boolean');
    }
  });

  it('observe tools do not require approval', () => {
    const observeTools = Object.values(ACTIVITY_AGENT_TOOLS).filter(t => t.riskLevel === 'observe');
    expect(observeTools.length).toBeGreaterThan(0);
    for (const tool of observeTools) {
      expect(tool.requiresApproval).toBe(false);
    }
  });

  it('has exactly 1 act tool (resolveAlert)', () => {
    const actTools = Object.values(ACTIVITY_AGENT_TOOLS).filter(t => t.riskLevel === 'act');
    expect(actTools).toHaveLength(1);
    expect(actTools[0]!.name).toBe('resolveAlert');
  });

  it('no tool has critical sensitivity', () => {
    // Activities are internal operational data, not critical (like passwords)
    const critical = Object.values(ACTIVITY_AGENT_TOOLS).filter(t => t.sensitivity === 'critical');
    expect(critical).toHaveLength(0);
  });
});

describe('createAgentToolHandlers', () => {
  it('creates all handler functions', () => {
    const db = makeMockDb();
    const handlers = createAgentToolHandlers(db);

    expect(typeof handlers.getOperationalPulse).toBe('function');
    expect(typeof handlers.getPulseSummary).toBe('function');
    expect(typeof handlers.checkPulseAttention).toBe('function');
    expect(typeof handlers.getMissingBeats).toBe('function');
    expect(typeof handlers.getUnresolvedAlerts).toBe('function');
    expect(typeof handlers.getRecentActivities).toBe('function');
    expect(typeof handlers.getEntityActivities).toBe('function');
    expect(typeof handlers.resolveAlert).toBe('function');
    expect(typeof handlers.invalidateCache).toBe('function');
  });

  it('getOperationalPulse returns a valid pulse', async () => {
    const db = makeMockDb();
    const handlers = createAgentToolHandlers(db);

    const pulse = await handlers.getOperationalPulse([], []);
    expect(pulse.computedAt).toBeInstanceOf(Date);
    expect(pulse.missingBeats).toBeDefined();
    expect(pulse.cadenceBreaks).toBeDefined();
    expect(pulse.activeIntents).toBeDefined();
    expect(pulse.summary).toBeDefined();
  });

  it('getPulseSummary returns a string', async () => {
    const db = makeMockDb();
    const handlers = createAgentToolHandlers(db);

    const summary = await handlers.getPulseSummary([], []);
    expect(typeof summary).toBe('string');
    expect(summary).toContain('Operational Pulse');
  });

  it('checkPulseAttention returns false for clean state', async () => {
    const db = makeMockDb();
    const handlers = createAgentToolHandlers(db);

    const needsAttention = await handlers.checkPulseAttention([], []);
    expect(needsAttention).toBe(false);
  });

  it('caches pulse for 5 minutes', async () => {
    const db = makeMockDb();
    const handlers = createAgentToolHandlers(db);

    const pulse1 = await handlers.getOperationalPulse([], []);
    const pulse2 = await handlers.getOperationalPulse([], []);

    // Same object reference (cached)
    expect(pulse1).toBe(pulse2);
  });

  it('invalidateCache forces recomputation', async () => {
    const db = makeMockDb();
    const handlers = createAgentToolHandlers(db);

    const pulse1 = await handlers.getOperationalPulse([], []);
    handlers.invalidateCache();
    const pulse2 = await handlers.getOperationalPulse([], []);

    // Different object references (recomputed)
    expect(pulse1).not.toBe(pulse2);
  });

  it('getEntityActivities dispatches to order or client', async () => {
    const db = makeMockDb();
    const handlers = createAgentToolHandlers(db);

    const orderResult = await handlers.getEntityActivities('order', 'o-1');
    expect(Array.isArray(orderResult)).toBe(true);

    const clientResult = await handlers.getEntityActivities('client', 'c-1');
    expect(Array.isArray(clientResult)).toBe(true);
  });

  it('resolveAlert calls through to resolveActivity', async () => {
    const db = makeMockDb();
    const handlers = createAgentToolHandlers(db);

    const result = await handlers.resolveAlert('act-1', 'agent-coo');
    expect(result.id).toBe('act-1');
    expect(result.resolvedBy).toBe('agent-coo');
  });

  it('getMissingBeats returns a Map', async () => {
    const db = makeMockDb();
    const handlers = createAgentToolHandlers(db);

    const beats = await handlers.getMissingBeats([], []);
    expect(beats).toBeInstanceOf(Map);
  });
});
