// ===========================================
// TESTS: Intent Inference
// ===========================================

import { describe, it, expect } from 'vitest';
import { inferIntents } from '../intuition/intent-inference';
import type { ActivityWithRelations } from '../types';
import type { LearnedSequence } from '../intuition/types';

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

const SEQUENCES: LearnedSequence[] = [
  {
    fromAction: 'client.measurements_updated',
    toAction: 'client.fit_profile_created',
    occurrences: 10,
    medianDelayMs: 4 * 3600000,
    p90DelayMs: 48 * 3600000,
    confidence: 0.8,
    entityScoped: true,
  },
  {
    fromAction: 'client.fit_profile_created',
    toAction: 'order.created',
    occurrences: 7,
    medianDelayMs: 24 * 3600000,
    p90DelayMs: 168 * 3600000,
    confidence: 0.6,
    entityScoped: true,
  },
];

describe('inferIntents', () => {
  it('matches known workflow: client onboarding', () => {
    const activities = [
      makeActivity({
        action: 'client.created',
        createdAt: new Date(2026, 1, 15, 10, 0),
        clientId: 'c-1',
      }),
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: new Date(2026, 1, 15, 11, 0),
        clientId: 'c-1',
      }),
    ];

    const intents = inferIntents(activities, SEQUENCES);

    const onboarding = intents.find(i => i.label.includes('Client onboarding'));
    expect(onboarding).toBeDefined();
    expect(onboarding!.entityContext.clientId).toBe('c-1');
    expect(onboarding!.evidenceActions).toContain('client.created');
    expect(onboarding!.evidenceActions).toContain('client.measurements_updated');
  });

  it('predicts next actions from learned sequences', () => {
    const activities = [
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: new Date(2026, 1, 15, 10, 0),
        clientId: 'c-1',
      }),
    ];

    const intents = inferIntents(activities, SEQUENCES);

    // Should predict fit_profile_created as next action
    const hasPredicton = intents.some(i =>
      i.predictedNext.some(p => p.action === 'client.fit_profile_created')
    );
    expect(hasPredicton).toBe(true);
  });

  it('matches order placement workflow', () => {
    const activities = [
      makeActivity({
        action: 'order.created',
        createdAt: new Date(2026, 1, 15, 10, 0),
        orderId: 'o-1',
      }),
      makeActivity({
        action: 'placement.pending',
        createdAt: new Date(2026, 1, 15, 10, 5),
        orderId: 'o-1',
      }),
    ];

    const intents = inferIntents(activities, SEQUENCES);

    const placement = intents.find(i => i.label.includes('Order placement'));
    expect(placement).toBeDefined();
    expect(placement!.entityContext.orderId).toBe('o-1');
  });

  it('matches order recovery workflow', () => {
    const activities = [
      makeActivity({
        action: 'placement.failed',
        createdAt: new Date(2026, 1, 15, 10, 0),
        orderId: 'o-1',
      }),
      makeActivity({
        action: 'order.placement_retried',
        createdAt: new Date(2026, 1, 15, 10, 30),
        orderId: 'o-1',
      }),
    ];

    const intents = inferIntents(activities, SEQUENCES);

    const recovery = intents.find(i => i.label.includes('Order recovery'));
    expect(recovery).toBeDefined();
  });

  it('deduplicates intents by entity context', () => {
    const activities = [
      makeActivity({
        action: 'client.created',
        createdAt: new Date(2026, 1, 15, 10, 0),
        clientId: 'c-1',
      }),
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: new Date(2026, 1, 15, 11, 0),
        clientId: 'c-1',
      }),
      // Duplicate trigger for same client
      makeActivity({
        action: 'client.created',
        createdAt: new Date(2026, 1, 15, 10, 5),
        clientId: 'c-1',
      }),
    ];

    const intents = inferIntents(activities, SEQUENCES);

    // Should not have duplicate "Client onboarding" for c-1
    const onboardingIntents = intents.filter(i =>
      i.label.includes('Client onboarding') && i.entityContext.clientId === 'c-1'
    );
    expect(onboardingIntents.length).toBeLessThanOrEqual(1);
  });

  it('respects maxIntents limit', () => {
    const activities = Array.from({ length: 20 }, (_, i) =>
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: new Date(2026, 1, 15, i),
        clientId: `c-${i}`,
      })
    );

    const intents = inferIntents(activities, SEQUENCES, 3);
    expect(intents.length).toBeLessThanOrEqual(3);
  });

  it('returns empty for activities with no patterns', () => {
    const activities = [
      makeActivity({
        action: 'filler.unknown',
        createdAt: new Date(2026, 1, 15, 10, 0),
      }),
    ];

    const intents = inferIntents(activities, []);
    expect(intents).toHaveLength(0);
  });

  it('handles multiple entities in parallel', () => {
    const activities = [
      makeActivity({
        action: 'client.created',
        createdAt: new Date(2026, 1, 15, 10, 0),
        clientId: 'c-1',
      }),
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: new Date(2026, 1, 15, 10, 30),
        clientId: 'c-1',
      }),
      makeActivity({
        action: 'client.created',
        createdAt: new Date(2026, 1, 15, 11, 0),
        clientId: 'c-2',
      }),
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: new Date(2026, 1, 15, 11, 30),
        clientId: 'c-2',
      }),
    ];

    const intents = inferIntents(activities, SEQUENCES);

    const c1 = intents.find(i => i.entityContext.clientId === 'c-1');
    const c2 = intents.find(i => i.entityContext.clientId === 'c-2');
    expect(c1).toBeDefined();
    expect(c2).toBeDefined();
  });
});
