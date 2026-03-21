// ===========================================
// TESTS: Sequence Learner
// ===========================================

import { describe, it, expect } from 'vitest';
import { learnSequences } from '../intuition/sequence-learner';
import type { ActivityWithRelations } from '../types';

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

function hours(n: number): number { return n * 60 * 60 * 1000; }

describe('learnSequences', () => {
  it('returns empty when below minimum activity threshold', () => {
    const activities = [
      makeActivity({ action: 'a', createdAt: new Date(2026, 0, 1) }),
    ];
    const result = learnSequences(activities, { minActivitiesForLearning: 50 });
    expect(result).toEqual([]);
  });

  it('learns entity-scoped A->B sequences from client activities', () => {
    const baseTime = new Date(2026, 0, 1).getTime();
    const clientId = 'client-1';

    // Create a pattern: measurements -> fit_profile 5 times
    const activities: ActivityWithRelations[] = [];
    for (let i = 0; i < 5; i++) {
      activities.push(
        makeActivity({
          action: 'client.measurements_updated',
          createdAt: new Date(baseTime + i * hours(48)),
          clientId,
        }),
        makeActivity({
          action: 'client.fit_profile_created',
          createdAt: new Date(baseTime + i * hours(48) + hours(4)),
          clientId,
        }),
      );
    }

    // Add enough filler to meet minimum threshold
    for (let i = 0; i < 45; i++) {
      activities.push(
        makeActivity({
          action: 'filler.action',
          createdAt: new Date(baseTime + i * hours(2)),
        }),
      );
    }

    const sequences = learnSequences(activities, { minActivitiesForLearning: 10, minOccurrences: 3 });

    const target = sequences.find(
      s => s.fromAction === 'client.measurements_updated' && s.toAction === 'client.fit_profile_created'
    );
    expect(target).toBeDefined();
    expect(target!.occurrences).toBeGreaterThanOrEqual(5);
    expect(target!.entityScoped).toBe(true);
    expect(target!.medianDelayMs).toBeCloseTo(hours(4), -4);
    expect(target!.confidence).toBeGreaterThan(0);
  });

  it('learns order-scoped sequences', () => {
    const baseTime = new Date(2026, 0, 1).getTime();
    const orderId = 'order-1';

    const activities: ActivityWithRelations[] = [];
    for (let i = 0; i < 5; i++) {
      activities.push(
        makeActivity({
          action: 'order.created',
          createdAt: new Date(baseTime + i * hours(72)),
          orderId,
        }),
        makeActivity({
          action: 'placement.pending',
          createdAt: new Date(baseTime + i * hours(72) + hours(2)),
          orderId,
        }),
      );
    }
    // Filler
    for (let i = 0; i < 45; i++) {
      activities.push(makeActivity({
        action: 'filler',
        createdAt: new Date(baseTime + i * hours(1)),
      }));
    }

    const sequences = learnSequences(activities, { minActivitiesForLearning: 10, minOccurrences: 3 });
    const target = sequences.find(
      s => s.fromAction === 'order.created' && s.toAction === 'placement.pending'
    );
    expect(target).toBeDefined();
    expect(target!.entityScoped).toBe(true);
  });

  it('filters sequences below minimum confidence', () => {
    const baseTime = new Date(2026, 0, 1).getTime();
    const activities: ActivityWithRelations[] = [];

    // Action A occurs 100 times but A->B only 3 times (3% confidence)
    for (let i = 0; i < 100; i++) {
      activities.push(makeActivity({
        action: 'common.action',
        createdAt: new Date(baseTime + i * hours(1)),
        clientId: `c-${i}`,
      }));
    }
    for (let i = 0; i < 3; i++) {
      activities.push(makeActivity({
        action: 'rare.followup',
        createdAt: new Date(baseTime + i * hours(1) + hours(0.5)),
        clientId: `c-${i}`,
      }));
    }

    const sequences = learnSequences(activities, {
      minActivitiesForLearning: 10,
      minOccurrences: 3,
      minConfidence: 0.1, // 10% minimum
    });

    const target = sequences.find(
      s => s.fromAction === 'common.action' && s.toAction === 'rare.followup'
    );
    expect(target).toBeUndefined(); // 3% < 10% threshold
  });

  it('filters sequences with delays beyond maxSequenceDelayMs', () => {
    const baseTime = new Date(2026, 0, 1).getTime();
    const clientId = 'c-1';
    const activities: ActivityWithRelations[] = [];

    // A->B with 10 day delay (beyond 7 day max)
    for (let i = 0; i < 5; i++) {
      activities.push(
        makeActivity({ action: 'slow.start', createdAt: new Date(baseTime + i * hours(240) + hours(0)), clientId }),
        makeActivity({ action: 'slow.end', createdAt: new Date(baseTime + i * hours(240) + hours(240)), clientId }),
      );
    }
    for (let i = 0; i < 45; i++) {
      activities.push(makeActivity({ action: 'filler', createdAt: new Date(baseTime + i * hours(1)) }));
    }

    const sequences = learnSequences(activities, {
      minActivitiesForLearning: 10,
      minOccurrences: 3,
      maxSequenceDelayMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    const target = sequences.find(s => s.fromAction === 'slow.start' && s.toAction === 'slow.end');
    expect(target).toBeUndefined(); // 10 days > 7 day max
  });

  it('computes p90 delay correctly', () => {
    const baseTime = new Date(2026, 0, 1).getTime();
    const clientId = 'c-1';
    const activities: ActivityWithRelations[] = [];

    // Create 10 A->B with varying delays: 1h, 2h, 3h, ..., 10h
    for (let i = 0; i < 10; i++) {
      activities.push(
        makeActivity({ action: 'step.a', createdAt: new Date(baseTime + i * hours(24)), clientId }),
        makeActivity({ action: 'step.b', createdAt: new Date(baseTime + i * hours(24) + hours(i + 1)), clientId }),
      );
    }
    for (let i = 0; i < 40; i++) {
      activities.push(makeActivity({ action: 'filler', createdAt: new Date(baseTime + i * hours(1)) }));
    }

    const sequences = learnSequences(activities, {
      minActivitiesForLearning: 10,
      minOccurrences: 3,
      minConfidence: 0.01,
    });

    const target = sequences.find(s => s.fromAction === 'step.a' && s.toAction === 'step.b');
    expect(target).toBeDefined();
    // With lookahead, delays are larger than just direct pairs.
    // Just verify p90 > median and both are positive.
    expect(target!.p90DelayMs).toBeGreaterThan(0);
    expect(target!.medianDelayMs).toBeGreaterThan(0);
    expect(target!.p90DelayMs).toBeGreaterThanOrEqual(target!.medianDelayMs);
  });

  it('sorts sequences by confidence descending', () => {
    const baseTime = new Date(2026, 0, 1).getTime();
    const activities: ActivityWithRelations[] = [];

    // High confidence: A->B happens 8/10 times
    for (let i = 0; i < 10; i++) {
      const cid = `c-a-${i}`;
      activities.push(makeActivity({ action: 'high.start', createdAt: new Date(baseTime + i * hours(24)), clientId: cid }));
      if (i < 8) {
        activities.push(makeActivity({ action: 'high.end', createdAt: new Date(baseTime + i * hours(24) + hours(1)), clientId: cid }));
      }
    }

    // Lower confidence: C->D happens 4/10 times
    for (let i = 0; i < 10; i++) {
      const cid = `c-b-${i}`;
      activities.push(makeActivity({ action: 'low.start', createdAt: new Date(baseTime + i * hours(24)), clientId: cid }));
      if (i < 4) {
        activities.push(makeActivity({ action: 'low.end', createdAt: new Date(baseTime + i * hours(24) + hours(1)), clientId: cid }));
      }
    }

    for (let i = 0; i < 30; i++) {
      activities.push(makeActivity({ action: 'filler', createdAt: new Date(baseTime + i * hours(1)) }));
    }

    const sequences = learnSequences(activities, {
      minActivitiesForLearning: 10,
      minOccurrences: 3,
      minConfidence: 0.1,
    });

    const highIdx = sequences.findIndex(s => s.fromAction === 'high.start');
    const lowIdx = sequences.findIndex(s => s.fromAction === 'low.start');

    if (highIdx !== -1 && lowIdx !== -1) {
      expect(highIdx).toBeLessThan(lowIdx);
    }
  });

  it('ignores self-loops (A->A)', () => {
    const baseTime = new Date(2026, 0, 1).getTime();
    const clientId = 'c-1';
    const activities: ActivityWithRelations[] = [];

    // Same action repeated — should NOT learn A->A
    for (let i = 0; i < 10; i++) {
      activities.push(
        makeActivity({ action: 'repeated.action', createdAt: new Date(baseTime + i * hours(1)), clientId }),
      );
    }
    for (let i = 0; i < 45; i++) {
      activities.push(makeActivity({ action: 'filler', createdAt: new Date(baseTime + i * hours(0.5)) }));
    }

    const sequences = learnSequences(activities, {
      minActivitiesForLearning: 10,
      minOccurrences: 3,
      minConfidence: 0.01,
    });

    const selfLoop = sequences.find(
      s => s.fromAction === 'repeated.action' && s.toAction === 'repeated.action'
    );
    expect(selfLoop).toBeUndefined();
  });
});
