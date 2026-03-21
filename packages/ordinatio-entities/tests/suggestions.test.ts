// ===========================================
// @ordinatio/entities — AGENT SUGGESTIONS TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@prisma/client', () => ({
  Prisma: { JsonNull: '__json_null__', InputJsonValue: {} },
}));

import {
  analyzeAndSuggest,
  getSuggestions,
  dismissSuggestion,
  approveSuggestion,
} from '../src/agent/suggestions';

function createMockDb() {
  return {
    agentInteraction: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    agentSuggestion: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'sug-1' }),
      update: vi.fn().mockResolvedValue({ id: 'sug-1' }),
    },
  } as any;
}

// ----- analyzeAndSuggest -----

describe('analyzeAndSuggest', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('creates suggestions for topics above the minimum threshold', async () => {
    // 15 interactions about "reports" — above MIN_QUERY_THRESHOLD (10)
    db.agentInteraction.findMany.mockResolvedValue(
      Array.from({ length: 15 }, () => ({
        topic: 'reports',
        toolsUsed: ['generateReport'],
        modules: ['analytics'],
      })),
    );
    db.agentInteraction.count.mockResolvedValue(15);
    db.agentSuggestion.findFirst.mockResolvedValue(null);
    db.agentSuggestion.create.mockResolvedValue({ id: 'sug-new' });

    const created = await analyzeAndSuggest(db);

    expect(created).toBe(1);
    expect(db.agentSuggestion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Analytics Agent',
          category: 'analytics',
          status: 'pending',
          queryCount: 15,
        }),
      }),
    );
  });

  it('skips topics below the minimum threshold', async () => {
    // Only 5 interactions — below MIN_QUERY_THRESHOLD (10)
    db.agentInteraction.findMany.mockResolvedValue(
      Array.from({ length: 5 }, () => ({
        topic: 'reports',
        toolsUsed: [],
        modules: [],
      })),
    );
    db.agentInteraction.count.mockResolvedValue(5);

    const created = await analyzeAndSuggest(db);

    expect(created).toBe(0);
    expect(db.agentSuggestion.create).not.toHaveBeenCalled();
  });

  it('skips specialist topics that already have dedicated agents', async () => {
    // "tax operations" is in SPECIALIST_TOPICS — should be skipped
    db.agentInteraction.findMany.mockResolvedValue(
      Array.from({ length: 20 }, () => ({
        topic: 'tax operations',
        toolsUsed: ['taxCalc'],
        modules: ['tax'],
      })),
    );
    db.agentInteraction.count.mockResolvedValue(20);

    const created = await analyzeAndSuggest(db);

    expect(created).toBe(0);
    expect(db.agentSuggestion.create).not.toHaveBeenCalled();
    expect(db.agentSuggestion.update).not.toHaveBeenCalled();
  });

  it('skips topics not in the TOPIC_TO_AGENT mapping', async () => {
    db.agentInteraction.findMany.mockResolvedValue(
      Array.from({ length: 20 }, () => ({
        topic: 'unknown topic xyz',
        toolsUsed: [],
        modules: [],
      })),
    );
    db.agentInteraction.count.mockResolvedValue(20);

    const created = await analyzeAndSuggest(db);

    expect(created).toBe(0);
    expect(db.agentSuggestion.create).not.toHaveBeenCalled();
  });

  it('updates existing suggestion instead of creating a new one', async () => {
    db.agentInteraction.findMany.mockResolvedValue(
      Array.from({ length: 12 }, () => ({
        topic: 'billing',
        toolsUsed: ['invoiceCheck'],
        modules: ['finance'],
      })),
    );
    db.agentInteraction.count.mockResolvedValue(12);
    db.agentSuggestion.findFirst.mockResolvedValue({
      id: 'sug-existing',
      name: 'Billing Agent',
      status: 'pending',
      dismissedAt: null,
      dismissedBy: null,
    });

    const created = await analyzeAndSuggest(db);

    expect(created).toBe(0); // Updated, not created
    expect(db.agentSuggestion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sug-existing' },
        data: expect.objectContaining({
          queryCount: 12,
          status: 'pending',
        }),
      }),
    );
    expect(db.agentSuggestion.create).not.toHaveBeenCalled();
  });

  it('respects dismiss cooldown — skips recently dismissed suggestions', async () => {
    db.agentInteraction.findMany.mockResolvedValue(
      Array.from({ length: 15 }, () => ({
        topic: 'billing',
        toolsUsed: [],
        modules: [],
      })),
    );
    db.agentInteraction.count.mockResolvedValue(15);
    // Dismissed 10 days ago — within 90-day cooldown
    db.agentSuggestion.findFirst.mockResolvedValue({
      id: 'sug-dismissed',
      name: 'Billing Agent',
      status: 'dismissed',
      dismissedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });

    const created = await analyzeAndSuggest(db);

    expect(created).toBe(0);
    expect(db.agentSuggestion.update).not.toHaveBeenCalled();
    expect(db.agentSuggestion.create).not.toHaveBeenCalled();
  });

  it('re-activates dismissed suggestion after cooldown expires', async () => {
    db.agentInteraction.findMany.mockResolvedValue(
      Array.from({ length: 15 }, () => ({
        topic: 'billing',
        toolsUsed: ['pay'],
        modules: ['finance'],
      })),
    );
    db.agentInteraction.count.mockResolvedValue(15);
    // Dismissed 100 days ago — beyond 90-day cooldown
    db.agentSuggestion.findFirst.mockResolvedValue({
      id: 'sug-old-dismissed',
      name: 'Billing Agent',
      status: 'dismissed',
      dismissedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
      dismissedBy: 'user-1',
    });

    const created = await analyzeAndSuggest(db);

    expect(created).toBe(0); // Updated, not created
    expect(db.agentSuggestion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sug-old-dismissed' },
        data: expect.objectContaining({
          status: 'pending',
          dismissedAt: null,
          dismissedBy: null,
        }),
      }),
    );
  });

  it('calculates confidence correctly from volume and consistency', async () => {
    // 50 interactions about "scheduling" out of 100 total = 50% consistency
    db.agentInteraction.findMany.mockResolvedValue(
      Array.from({ length: 50 }, () => ({
        topic: 'scheduling',
        toolsUsed: ['calendarCheck'],
        modules: ['workflow'],
      })),
    );
    db.agentInteraction.count.mockResolvedValue(100);
    db.agentSuggestion.findFirst.mockResolvedValue(null);

    await analyzeAndSuggest(db);

    // volumeScore = min(1.0, 50/50) = 1.0
    // topicConsistency = 50/100 = 0.5
    // confidence = 1.0 * (0.5 + 0.5 * 0.5) = 1.0 * 0.75 = 0.75
    expect(db.agentSuggestion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          confidence: 0.75,
        }),
      }),
    );
  });

  it('caps volume score at 1.0 for very high counts', async () => {
    // 200 interactions about "onboarding" out of 200 total
    db.agentInteraction.findMany.mockResolvedValue(
      Array.from({ length: 200 }, () => ({
        topic: 'onboarding',
        toolsUsed: [],
        modules: [],
      })),
    );
    db.agentInteraction.count.mockResolvedValue(200);
    db.agentSuggestion.findFirst.mockResolvedValue(null);

    await analyzeAndSuggest(db);

    // volumeScore = min(1.0, 200/50) = 1.0
    // topicConsistency = 200/200 = 1.0
    // confidence = 1.0 * (0.5 + 1.0 * 0.5) = 1.0
    expect(db.agentSuggestion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          confidence: 1.0,
        }),
      }),
    );
  });

  it('returns 0 when there are no interactions', async () => {
    db.agentInteraction.findMany.mockResolvedValue([]);
    db.agentInteraction.count.mockResolvedValue(0);

    const created = await analyzeAndSuggest(db);

    expect(created).toBe(0);
    expect(db.agentSuggestion.create).not.toHaveBeenCalled();
  });
});

// ----- getSuggestions -----

describe('getSuggestions', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('returns all suggestions ordered by confidence descending', async () => {
    const suggestions = [
      { id: 'sug-1', name: 'Agent A', confidence: 0.9 },
      { id: 'sug-2', name: 'Agent B', confidence: 0.5 },
    ];
    db.agentSuggestion.findMany.mockResolvedValue(suggestions);

    const result = await getSuggestions(db);

    expect(result).toEqual(suggestions);
    expect(db.agentSuggestion.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { confidence: 'desc' },
    });
  });

  it('filters by status when provided', async () => {
    db.agentSuggestion.findMany.mockResolvedValue([]);

    await getSuggestions(db, 'approved');

    expect(db.agentSuggestion.findMany).toHaveBeenCalledWith({
      where: { status: 'approved' },
      orderBy: { confidence: 'desc' },
    });
  });
});

// ----- dismissSuggestion -----

describe('dismissSuggestion', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('sets dismissed status, user, and timestamp', async () => {
    const dismissed = { id: 'sug-1', status: 'dismissed', dismissedBy: 'user-42' };
    db.agentSuggestion.update.mockResolvedValue(dismissed);

    const result = await dismissSuggestion(db, 'sug-1', 'user-42');

    expect(result).toEqual(dismissed);
    expect(db.agentSuggestion.update).toHaveBeenCalledWith({
      where: { id: 'sug-1' },
      data: {
        status: 'dismissed',
        dismissedBy: 'user-42',
        dismissedAt: expect.any(Date),
      },
    });
  });
});

// ----- approveSuggestion -----

describe('approveSuggestion', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('sets status to approved', async () => {
    const approved = { id: 'sug-1', status: 'approved' };
    db.agentSuggestion.update.mockResolvedValue(approved);

    const result = await approveSuggestion(db, 'sug-1');

    expect(result).toEqual(approved);
    expect(db.agentSuggestion.update).toHaveBeenCalledWith({
      where: { id: 'sug-1' },
      data: { status: 'approved' },
    });
  });
});
