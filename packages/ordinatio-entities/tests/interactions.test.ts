// ===========================================
// @ordinatio/entities — AGENT INTERACTIONS TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@prisma/client', () => ({
  Prisma: { JsonNull: '__json_null__', InputJsonValue: {} },
}));

import {
  logInteraction,
  markSatisfied,
  getTopicDistribution,
  getRecentInteractions,
  getInteractionCount,
} from '../src/agent/interactions';

function createMockDb() {
  return {
    agentKnowledge: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    agentPreference: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    agentInteraction: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    agentSuggestion: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  } as any;
}

describe('logInteraction', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('creates an interaction with classified intent, topic, and modules', async () => {
    const created = {
      id: 'int-1',
      userId: 'user-1',
      query: 'show me fabric stock',
      intent: 'search',
      topic: 'fabric stock',
      modules: ['fabric'],
      toolsUsed: ['fabricStockCheck'],
      sessionId: null,
      satisfied: null,
    };
    db.agentInteraction.create.mockResolvedValue(created);

    const result = await logInteraction(db, {
      userId: 'user-1',
      query: 'show me fabric stock',
      toolsUsed: ['fabricStockCheck'],
    });

    expect(result).toEqual(created);
    expect(db.agentInteraction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          query: 'show me fabric stock',
          intent: 'search',
          topic: 'fabric stock',
          modules: ['fabric'],
          toolsUsed: ['fabricStockCheck'],
          sessionId: null,
          satisfied: null,
        }),
      }),
    );
  });

  it('handles missing toolsUsed by defaulting to empty array', async () => {
    db.agentInteraction.create.mockResolvedValue({ id: 'int-2' });

    await logInteraction(db, {
      userId: 'user-1',
      query: 'how do I create an order?',
    });

    expect(db.agentInteraction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          toolsUsed: [],
          modules: [],
        }),
      }),
    );
  });

  it('includes sessionId when provided', async () => {
    db.agentInteraction.create.mockResolvedValue({ id: 'int-3' });

    await logInteraction(db, {
      userId: 'user-1',
      query: 'check order status',
      sessionId: 'session-abc',
    });

    expect(db.agentInteraction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sessionId: 'session-abc' }),
      }),
    );
  });
});

describe('markSatisfied', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('updates satisfied to true', async () => {
    const updated = { id: 'int-1', satisfied: true };
    db.agentInteraction.update.mockResolvedValue(updated);

    const result = await markSatisfied(db, 'int-1', true);

    expect(result).toEqual(updated);
    expect(db.agentInteraction.update).toHaveBeenCalledWith({
      where: { id: 'int-1' },
      data: { satisfied: true },
    });
  });

  it('updates satisfied to false', async () => {
    db.agentInteraction.update.mockResolvedValue({ id: 'int-1', satisfied: false });

    await markSatisfied(db, 'int-1', false);

    expect(db.agentInteraction.update).toHaveBeenCalledWith({
      where: { id: 'int-1' },
      data: { satisfied: false },
    });
  });
});

describe('getTopicDistribution', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('aggregates topics with counts, modules, and tools', async () => {
    db.agentInteraction.findMany.mockResolvedValue([
      { topic: 'order management', toolsUsed: ['orderSearch'], modules: ['orders'] },
      { topic: 'order management', toolsUsed: ['orderGet'], modules: ['orders'] },
      { topic: 'fabric stock', toolsUsed: ['fabricCheck'], modules: ['fabric'] },
    ]);

    const result = await getTopicDistribution(db, 30);

    expect(result).toHaveLength(2);
    const orders = result.find((r) => r.topic === 'order management');
    expect(orders).toBeDefined();
    expect(orders!.count).toBe(2);
    expect(orders!.tools).toContain('orderSearch');
    expect(orders!.tools).toContain('orderGet');
    expect(orders!.modules).toContain('orders');

    const fabric = result.find((r) => r.topic === 'fabric stock');
    expect(fabric!.count).toBe(1);
  });

  it('sorts by count descending', async () => {
    db.agentInteraction.findMany.mockResolvedValue([
      { topic: 'A', toolsUsed: [], modules: [] },
      { topic: 'B', toolsUsed: [], modules: [] },
      { topic: 'B', toolsUsed: [], modules: [] },
      { topic: 'B', toolsUsed: [], modules: [] },
    ]);

    const result = await getTopicDistribution(db, 30);

    expect(result[0].topic).toBe('B');
    expect(result[0].count).toBe(3);
    expect(result[1].topic).toBe('A');
    expect(result[1].count).toBe(1);
  });

  it('skips interactions with null topic', async () => {
    db.agentInteraction.findMany.mockResolvedValue([
      { topic: null, toolsUsed: [], modules: [] },
      { topic: 'reports', toolsUsed: [], modules: [] },
    ]);

    const result = await getTopicDistribution(db);

    expect(result).toHaveLength(1);
    expect(result[0].topic).toBe('reports');
  });
});

describe('getRecentInteractions', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('returns interactions for a specific user', async () => {
    const interactions = [
      { id: '1', userId: 'user-1', query: 'q1' },
      { id: '2', userId: 'user-1', query: 'q2' },
    ];
    db.agentInteraction.findMany.mockResolvedValue(interactions);

    const result = await getRecentInteractions(db, 'user-1', 20);

    expect(result).toEqual(interactions);
    expect(db.agentInteraction.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  });
});

describe('getInteractionCount', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('counts interactions within the date range', async () => {
    db.agentInteraction.count.mockResolvedValue(42);

    const result = await getInteractionCount(db, 7);

    expect(result).toBe(42);
    expect(db.agentInteraction.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      }),
    );
  });
});
