// ===========================================
// TESTS: Missing Beat Detection
// ===========================================

import { describe, it, expect } from 'vitest';
import { detectMissingBeats, prioritizeMissingBeats } from '../intuition/missing-beats';
import type { ActivityWithRelations } from '../types';
import type { LearnedSequence } from '../intuition/types';

function makeActivity(
  overrides: Partial<ActivityWithRelations> & { action: string; createdAt: Date },
): ActivityWithRelations {
  return {
    id: overrides.id ?? `act-${Math.random().toString(36).slice(2, 8)}`,
    description: overrides.description ?? 'test',
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
function days(n: number): number { return n * 24 * 60 * 60 * 1000; }

const LEARNED_SEQUENCE: LearnedSequence = {
  fromAction: 'client.measurements_updated',
  toAction: 'client.fit_profile_created',
  occurrences: 10,
  medianDelayMs: hours(4),
  p90DelayMs: hours(48),
  confidence: 0.8,
  entityScoped: true,
};

describe('detectMissingBeats', () => {
  it('detects a missing beat when follow-up is overdue', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const triggerTime = new Date(now.getTime() - days(5)); // 5 days ago

    const activities = [
      makeActivity({
        id: 'trigger-1',
        action: 'client.measurements_updated',
        createdAt: triggerTime,
        clientId: 'client-1',
        client: { id: 'client-1', name: 'John Smith' },
      }),
    ];

    const beats = detectMissingBeats(activities, [LEARNED_SEQUENCE], now);

    expect(beats).toHaveLength(1);
    expect(beats[0]!.triggerActivity.id).toBe('trigger-1');
    expect(beats[0]!.expectedAction).toBe('client.fit_profile_created');
    expect(beats[0]!.overdueRatio).toBeGreaterThan(1);
    expect(beats[0]!.triggerActivity.entityLabel).toBe('John Smith');
  });

  it('does not flag when follow-up exists', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const triggerTime = new Date(now.getTime() - days(5));
    const followUpTime = new Date(triggerTime.getTime() + hours(6));

    const activities = [
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: triggerTime,
        clientId: 'client-1',
      }),
      makeActivity({
        action: 'client.fit_profile_created',
        createdAt: followUpTime,
        clientId: 'client-1', // Same entity
      }),
    ];

    const beats = detectMissingBeats(activities, [LEARNED_SEQUENCE], now);
    expect(beats).toHaveLength(0);
  });

  it('flags when follow-up exists for DIFFERENT entity (entity-scoped)', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const triggerTime = new Date(now.getTime() - days(5));

    const activities = [
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: triggerTime,
        clientId: 'client-1',
      }),
      makeActivity({
        action: 'client.fit_profile_created',
        createdAt: new Date(triggerTime.getTime() + hours(6)),
        clientId: 'client-2', // Different entity!
      }),
    ];

    const beats = detectMissingBeats(activities, [LEARNED_SEQUENCE], now);
    expect(beats).toHaveLength(1); // Still missing for client-1
  });

  it('does not flag when trigger is not yet overdue', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const triggerTime = new Date(now.getTime() - hours(12)); // Only 12h ago, p90 is 48h

    const activities = [
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: triggerTime,
        clientId: 'client-1',
      }),
    ];

    const beats = detectMissingBeats(activities, [LEARNED_SEQUENCE], now);
    expect(beats).toHaveLength(0);
  });

  it('classifies urgency correctly', () => {
    const now = new Date(2026, 1, 15, 12, 0);

    // 3 days overdue on a 2-day p90 (1.5x overdue, confidence 0.8)
    const activities = [
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: new Date(now.getTime() - days(3)),
        clientId: 'client-1',
      }),
    ];

    const beats = detectMissingBeats(activities, [LEARNED_SEQUENCE], now);
    expect(beats).toHaveLength(1);
    // 3 days / 2 days = 1.5x overdue
    // adjusted = 1.5 * (0.5 + 0.8) = 1.95 → nudge
    expect(beats[0]!.urgency).toBe('nudge');
  });

  it('classifies alarm for heavily overdue', () => {
    const now = new Date(2026, 1, 15, 12, 0);

    // 10 days overdue on a 2-day p90
    const activities = [
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: new Date(now.getTime() - days(10)),
        clientId: 'client-1',
      }),
    ];

    const beats = detectMissingBeats(activities, [LEARNED_SEQUENCE], now);
    expect(beats).toHaveLength(1);
    expect(beats[0]!.urgency).toBe('alarm');
  });

  it('respects detection window cutoff', () => {
    const now = new Date(2026, 1, 15, 12, 0);

    // Activity from 30 days ago — outside 14-day detection window
    const activities = [
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: new Date(now.getTime() - days(30)),
        clientId: 'client-1',
      }),
    ];

    const beats = detectMissingBeats(activities, [LEARNED_SEQUENCE], now, {
      detectionWindowDays: 14,
    });
    expect(beats).toHaveLength(0);
  });

  it('handles global (non-entity-scoped) sequences', () => {
    const now = new Date(2026, 1, 15, 12, 0);

    const globalSequence: LearnedSequence = {
      fromAction: 'placement.failed',
      toAction: 'order.placement_retried',
      occurrences: 8,
      medianDelayMs: hours(2),
      p90DelayMs: hours(6),
      confidence: 0.7,
      entityScoped: false, // Global
    };

    const activities = [
      makeActivity({
        action: 'placement.failed',
        createdAt: new Date(now.getTime() - hours(12)), // 12h ago, p90 is 6h
        orderId: 'order-1',
      }),
    ];

    const beats = detectMissingBeats(activities, [globalSequence], now);
    expect(beats).toHaveLength(1);
    expect(beats[0]!.expectedAction).toBe('order.placement_retried');
  });

  it('sorts results by urgency then overdueRatio', () => {
    const now = new Date(2026, 1, 15, 12, 0);

    const seq: LearnedSequence = {
      fromAction: 'order.created',
      toAction: 'placement.pending',
      occurrences: 10,
      medianDelayMs: hours(1),
      p90DelayMs: hours(4),
      confidence: 0.9,
      entityScoped: true,
    };

    const activities = [
      // More overdue
      makeActivity({
        id: 'old',
        action: 'order.created',
        createdAt: new Date(now.getTime() - days(7)),
        orderId: 'order-old',
      }),
      // Less overdue
      makeActivity({
        id: 'recent',
        action: 'order.created',
        createdAt: new Date(now.getTime() - days(1)),
        orderId: 'order-recent',
      }),
    ];

    const beats = detectMissingBeats(activities, [seq], now);
    expect(beats.length).toBeGreaterThanOrEqual(2);
    // More overdue should come first
    expect(beats[0]!.triggerActivity.id).toBe('old');
  });
});

describe('prioritizeMissingBeats', () => {
  it('deduplicates beats for the same trigger activity', () => {
    const triggerActivity = {
      id: 'trigger-1',
      action: 'client.measurements_updated',
      createdAt: new Date(),
      orderId: null,
      clientId: 'c-1',
      description: 'test',
      entityLabel: null,
    };

    const seq1: LearnedSequence = {
      fromAction: 'client.measurements_updated',
      toAction: 'client.fit_profile_created',
      occurrences: 10, medianDelayMs: 1000, p90DelayMs: 2000, confidence: 0.8, entityScoped: true,
    };
    const seq2: LearnedSequence = {
      fromAction: 'client.measurements_updated',
      toAction: 'order.created',
      occurrences: 5, medianDelayMs: 5000, p90DelayMs: 10000, confidence: 0.4, entityScoped: true,
    };

    const beats = [
      { triggerActivity, expectedAction: 'fit_profile_created', expectedWithinMs: 2000, waitingMs: 10000, overdueRatio: 5, sequence: seq1, urgency: 'alarm' as const },
      { triggerActivity, expectedAction: 'order.created', expectedWithinMs: 10000, waitingMs: 15000, overdueRatio: 1.5, sequence: seq2, urgency: 'watch' as const },
    ];

    const result = prioritizeMissingBeats(beats);
    expect(result).toHaveLength(1);
    expect(result[0]!.urgency).toBe('alarm'); // Keeps the most urgent
  });

  it('respects maxResults limit', () => {
    const beats = Array.from({ length: 20 }, (_, i) => ({
      triggerActivity: {
        id: `t-${i}`, action: 'a', createdAt: new Date(),
        orderId: null, clientId: null, description: 'test', entityLabel: null,
      },
      expectedAction: 'b',
      expectedWithinMs: 1000,
      waitingMs: 5000,
      overdueRatio: 5,
      sequence: {} as LearnedSequence,
      urgency: 'nudge' as const,
    }));

    const result = prioritizeMissingBeats(beats, 5);
    expect(result).toHaveLength(5);
  });
});
