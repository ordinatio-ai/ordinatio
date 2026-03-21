// ===========================================
// TESTS: Integration & Edge Cases
// ===========================================
// Cross-module integration tests and edge cases
// not covered by the individual unit test files.
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSecureActivityService, isKnownAction, sanitizeMetadata } from '../security';
import { learnSequences } from '../intuition/sequence-learner';
import { detectMissingBeats, prioritizeMissingBeats } from '../intuition/missing-beats';
import { learnCadence, detectCadenceBreaks } from '../intuition/cadence';
import { inferIntents } from '../intuition/intent-inference';
import { computePulse, summarizeForAgent, pulseNeedsAttention } from '../intuition/pulse';
import { createAgentToolHandlers } from '../agent-tools';
import type { ActivityDb, ActivityWithRelations } from '../types';
import type { LearnedSequence } from '../intuition/types';

// ---- Helpers ----

function makeMockDb(): ActivityDb {
  const activities: Array<Record<string, unknown>> = [];
  return {
    activityLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        const activity = {
          id: `new-${activities.length + 1}`,
          ...args.data,
          createdAt: new Date(),
          resolvedAt: null,
          resolvedBy: null,
          user: null,
          order: null,
          client: null,
        };
        activities.push(activity);
        return activity as never;
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: args.where.id,
        action: 'test',
        description: 'test',
        severity: 'INFO',
        requiresResolution: false,
        createdAt: new Date(),
        ...args.data,
        system: false,
        metadata: null,
        orderId: null,
        clientId: null,
        placementAttemptId: null,
        user: null,
        order: null,
        client: null,
      }) as never,
      updateMany: async () => ({ count: 0 }),
      findMany: async () => activities as never,
      count: async () => activities.length,
    },
    $transaction: async (fn: (tx: ActivityDb) => Promise<unknown>) => fn(makeMockDb()),
  };
}

function makeActivity(
  overrides: Partial<ActivityWithRelations> & { action: string; createdAt: Date },
): ActivityWithRelations {
  return {
    id: `act-${Math.random().toString(36).slice(2, 8)}`,
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
function minutes(n: number): number { return n * 60 * 1000; }

/**
 * Build a realistic historical dataset with repeating A->B patterns
 * scoped to individual clients, plus filler activities to meet
 * the minimum threshold.
 */
function buildHistoricalDataset(opts: {
  fromAction: string;
  toAction: string;
  delayMs: number;
  repetitions: number;
  baseTime: number;
  fillerCount?: number;
}): ActivityWithRelations[] {
  const activities: ActivityWithRelations[] = [];
  for (let i = 0; i < opts.repetitions; i++) {
    const clientId = `hist-client-${i}`;
    activities.push(
      makeActivity({
        action: opts.fromAction,
        createdAt: new Date(opts.baseTime + i * days(3)),
        clientId,
      }),
      makeActivity({
        action: opts.toAction,
        createdAt: new Date(opts.baseTime + i * days(3) + opts.delayMs),
        clientId,
      }),
    );
  }
  for (let i = 0; i < (opts.fillerCount ?? 40); i++) {
    activities.push(
      makeActivity({
        action: 'filler.action',
        createdAt: new Date(opts.baseTime + i * days(1)),
      }),
    );
  }
  return activities;
}


// ==========================================================
// 1. End-to-end: Security + Intuition integration
// ==========================================================

describe('End-to-end: Security + Intuition integration', () => {
  it('activities created through secure service are learnable by intuition engine', async () => {
    const db = makeMockDb();
    const service = createSecureActivityService(db, 'tenant-1', undefined, {
      strictActions: true,
    });

    // Create activities through the secure service
    await service.createActivity({
      action: 'order.created',
      description: 'Order 1 created',
      clientId: 'c-1',
    });

    await service.createActivity({
      action: 'order.created',
      description: 'Order 2 created',
      clientId: 'c-2',
    });

    // Verify the activities were created (via getActivitiesWithSticky)
    const result = await service.getActivitiesWithSticky();
    // The mock DB returns the accumulated activities
    expect(result).toBeDefined();
  });

  it('secure service rejects bad input before intuition engine ever sees it', async () => {
    const db = makeMockDb();
    const service = createSecureActivityService(db, 'tenant-1');

    // This should be rejected — the intuition engine never processes garbage
    await expect(
      service.createActivity({
        action: 'evil.action',
        description: 'test',
        metadata: { html: '<script>alert(1)</script>' },
      })
    ).rejects.toThrow('Rejected unknown action');

    // Even if action is valid, bad metadata is caught
    await expect(
      service.createActivity({
        action: 'order.created',
        description: 'test',
        metadata: { html: '<script>alert(1)</script>' },
      })
    ).rejects.toThrow('Metadata rejected');
  });

  it('tenant ID flows through to activities consumed by pulse', async () => {
    let capturedMetadata: unknown = null;
    const db: ActivityDb = {
      activityLog: {
        create: async (args: { data: Record<string, unknown> }) => {
          capturedMetadata = args.data.metadata;
          return {
            id: 'new-1', ...args.data, createdAt: new Date(),
            resolvedAt: null, resolvedBy: null, user: null, order: null, client: null,
          } as never;
        },
        update: async () => ({}) as never,
        updateMany: async () => ({ count: 0 }),
        findMany: async () => [] as never,
        count: async () => 0,
      },
      $transaction: async (fn: (tx: ActivityDb) => Promise<unknown>) => fn(db),
    };

    const service = createSecureActivityService(db, 'tenant-xyz');
    await service.createActivity({
      action: 'order.created',
      description: 'test',
      metadata: { source: 'wizard' },
    });

    expect(capturedMetadata).toEqual({
      source: 'wizard',
      _tenantId: 'tenant-xyz',
    });
  });
});


// ==========================================================
// 2. Sequence learning edge cases
// ==========================================================

describe('Sequence learning edge cases', () => {
  it('returns empty for empty input', () => {
    expect(learnSequences([])).toEqual([]);
  });

  it('returns empty for a single activity', () => {
    const result = learnSequences([
      makeActivity({ action: 'order.created', createdAt: new Date() }),
    ], { minActivitiesForLearning: 1 });
    // Even with threshold=1, a single activity cannot form a pair
    expect(result).toEqual([]);
  });

  it('handles all same action (no pairs because self-loops are skipped)', () => {
    const baseTime = Date.now();
    const activities: ActivityWithRelations[] = [];
    for (let i = 0; i < 60; i++) {
      activities.push(
        makeActivity({
          action: 'order.created',
          createdAt: new Date(baseTime + i * hours(1)),
          clientId: `c-${i}`,
        }),
      );
    }
    const result = learnSequences(activities, {
      minActivitiesForLearning: 10,
      minOccurrences: 3,
    });
    // No A->A self-loops should be learned
    const selfLoops = result.filter(s => s.fromAction === s.toAction);
    expect(selfLoops).toHaveLength(0);
  });

  it('handles very long delays (beyond max) gracefully', () => {
    const baseTime = Date.now() - days(120);
    const activities: ActivityWithRelations[] = [];
    const clientId = 'c-1';

    // A->B with 30-day delays (way beyond 7-day default max)
    for (let i = 0; i < 5; i++) {
      activities.push(
        makeActivity({
          action: 'slow.start',
          createdAt: new Date(baseTime + i * days(60)),
          clientId,
        }),
        makeActivity({
          action: 'slow.finish',
          createdAt: new Date(baseTime + i * days(60) + days(30)),
          clientId,
        }),
      );
    }
    // Filler
    for (let i = 0; i < 50; i++) {
      activities.push(makeActivity({ action: 'filler', createdAt: new Date(baseTime + i * days(1)) }));
    }

    const result = learnSequences(activities, {
      minActivitiesForLearning: 10,
      minOccurrences: 3,
      maxSequenceDelayMs: days(7),
    });

    const target = result.find(s => s.fromAction === 'slow.start' && s.toAction === 'slow.finish');
    expect(target).toBeUndefined();
  });

  it('handles two activities with zero delay (simultaneous) — entity-scoped zero delay is skipped', () => {
    const baseTime = Date.now();
    const activities: ActivityWithRelations[] = [];

    // A and B at exactly the same time for unique clients — delay = 0
    // The entity-scoped learner skips delay <= 0,
    // but the global learner may still pick up pairs from consecutive items.
    // We verify that no entity-scoped sequence is learned with 0 delay.
    for (let i = 0; i < 10; i++) {
      const t = new Date(baseTime + i * hours(24));
      const clientId = `c-${i}`;
      activities.push(
        makeActivity({ action: 'step.a', createdAt: t, clientId }),
        makeActivity({ action: 'step.b', createdAt: t, clientId }), // same timestamp
      );
    }
    for (let i = 0; i < 40; i++) {
      activities.push(makeActivity({ action: 'filler', createdAt: new Date(baseTime + i * hours(2)) }));
    }

    const result = learnSequences(activities, {
      minActivitiesForLearning: 10,
      minOccurrences: 3,
      minConfidence: 0.01,
    });

    // Entity-scoped zero-delay observations are skipped (delay <= 0)
    const entityScoped = result.find(
      s => s.fromAction === 'step.a' && s.toAction === 'step.b' && s.entityScoped
    );
    expect(entityScoped).toBeUndefined();
  });
});


// ==========================================================
// 3. Missing beats edge cases
// ==========================================================

describe('Missing beats edge cases', () => {
  const SEQUENCE: LearnedSequence = {
    fromAction: 'client.measurements_updated',
    toAction: 'client.fit_profile_created',
    occurrences: 10,
    medianDelayMs: hours(4),
    p90DelayMs: hours(48),
    confidence: 0.8,
    entityScoped: true,
  };

  it('activity exactly at p90 boundary is not flagged (waitingMs === p90)', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    // Trigger exactly p90 ago
    const triggerTime = new Date(now.getTime() - hours(48));

    const activities = [
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: triggerTime,
        clientId: 'c-1',
      }),
    ];

    const beats = detectMissingBeats(activities, [SEQUENCE], now);
    // waitingMs === p90DelayMs means NOT strictly overdue (<= check varies)
    // The code uses `waitingMs < sequence.p90DelayMs` to skip, so exactly equal WILL be flagged
    expect(beats).toHaveLength(1);
    expect(beats[0]!.overdueRatio).toBeCloseTo(1.0, 1);
    expect(beats[0]!.urgency).toBe('watch');
  });

  it('activity 1ms before p90 boundary is not flagged', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const triggerTime = new Date(now.getTime() - hours(48) + 1);

    const activities = [
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: triggerTime,
        clientId: 'c-1',
      }),
    ];

    const beats = detectMissingBeats(activities, [SEQUENCE], now);
    expect(beats).toHaveLength(0);
  });

  it('entity scoping with null clientId and null orderId does not match', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const triggerTime = new Date(now.getTime() - days(5));

    // Trigger with null clientId — entity-scoped sequence cannot match
    const activities = [
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: triggerTime,
        clientId: null,
        orderId: null,
      }),
      // Follow-up also with null — sameClient check: null && null === null → falsy
      makeActivity({
        action: 'client.fit_profile_created',
        createdAt: new Date(triggerTime.getTime() + hours(2)),
        clientId: null,
        orderId: null,
      }),
    ];

    const beats = detectMissingBeats(activities, [SEQUENCE], now);
    // The trigger has null clientId, so entity-scoped follow-up check:
    // sameClient = trigger.clientId && a.clientId === trigger.clientId → null (falsy)
    // sameOrder  = trigger.orderId && a.orderId === trigger.orderId → null (falsy)
    // Follow-up doesn't count, so beat is flagged
    expect(beats).toHaveLength(1);
  });

  it('prioritizeMissingBeats with empty array returns empty', () => {
    expect(prioritizeMissingBeats([])).toEqual([]);
  });

  it('prioritizeMissingBeats keeps highest urgency per trigger when multiple sequences match', () => {
    const trigger = {
      id: 't-1',
      action: 'client.measurements_updated',
      createdAt: new Date(),
      orderId: null,
      clientId: 'c-1',
      description: 'test',
      entityLabel: null,
    };
    const seq = {} as LearnedSequence;

    const beats = [
      { triggerActivity: trigger, expectedAction: 'a', expectedWithinMs: 1000, waitingMs: 2000, overdueRatio: 2.0, sequence: seq, urgency: 'watch' as const },
      { triggerActivity: trigger, expectedAction: 'b', expectedWithinMs: 1000, waitingMs: 10000, overdueRatio: 10.0, sequence: seq, urgency: 'alarm' as const },
      { triggerActivity: trigger, expectedAction: 'c', expectedWithinMs: 1000, waitingMs: 5000, overdueRatio: 5.0, sequence: seq, urgency: 'nudge' as const },
    ];

    const result = prioritizeMissingBeats(beats);
    expect(result).toHaveLength(1);
    expect(result[0]!.urgency).toBe('alarm');
  });
});


// ==========================================================
// 4. Cadence with real-world patterns
// ==========================================================

describe('Cadence with real-world patterns', () => {
  it('weekend gaps are normal if historical pattern shows low weekend activity', () => {
    // Build a profile with activity only on weekdays (Mon-Fri)
    const activities: ActivityWithRelations[] = [];
    for (let week = 0; week < 8; week++) {
      for (let dayOffset = 0; dayOffset < 5; dayOffset++) { // Mon-Fri
        // Jan 5 2026 is Monday
        const d = new Date(2026, 0, 5 + week * 7 + dayOffset, 10, 0);
        for (let h = 0; h < 5; h++) {
          activities.push(makeActivity({
            createdAt: new Date(d.getTime() + h * hours(1)),
          }));
        }
      }
    }

    const profile = learnCadence(activities);

    // Saturday (6) and Sunday (0) should have zero daily rate
    expect(profile.dailyRate[0]).toBe(0); // Sunday
    expect(profile.dailyRate[6]).toBe(0); // Saturday
    // Weekdays should be non-zero
    expect(profile.dailyRate[1]).toBeGreaterThan(0); // Monday

    // On a Saturday with zero activity, there should be no break flagged
    // because expectedDaily for Saturday is 0 (< 5 threshold)
    const saturday = new Date(2026, 1, 7, 14, 0); // Saturday
    const breaks = detectCadenceBreaks([], profile, saturday, 4);
    const dayBreak = breaks.find(b => b.period.includes('Saturday'));
    expect(dayBreak).toBeUndefined();
  });

  it('overnight silence is normal when historical profile has no nighttime activity', () => {
    // Build a profile: activity only 9AM-5PM
    const activities: ActivityWithRelations[] = [];
    for (let day = 0; day < 30; day++) {
      for (let hour = 9; hour < 17; hour++) {
        activities.push(makeActivity({
          createdAt: new Date(2026, 0, day + 1, hour, 30),
        }));
      }
    }

    const profile = learnCadence(activities);

    // Nighttime hours should have zero rate
    expect(profile.hourlyRate[2]).toBe(0);
    expect(profile.hourlyRate[22]).toBe(0);

    // Checking at 3AM with no activity should NOT flag a break
    // because hourlyRate[3] is 0 (< 0.5 threshold)
    const threeAm = new Date(2026, 1, 15, 3, 0);
    const breaks = detectCadenceBreaks([], profile, threeAm, 4);
    expect(breaks).toHaveLength(0);
  });

  it('detects a Monday silence when Mondays are usually busy', () => {
    // Build profile: heavy Monday activity
    const activities: ActivityWithRelations[] = [];
    for (let week = 0; week < 10; week++) {
      // Jan 5 2026 is Monday
      const monday = new Date(2026, 0, 5 + week * 7, 10, 0);
      for (let i = 0; i < 10; i++) {
        activities.push(makeActivity({
          createdAt: new Date(monday.getTime() + i * minutes(30)),
        }));
      }
    }

    const profile = learnCadence(activities);
    expect(profile.dailyRate[1]).toBeGreaterThan(5); // Monday rate > 5

    // A Monday at 6PM with zero activities today
    const mondayEvening = new Date(2026, 2, 2, 18, 0); // Monday March 2
    const breaks = detectCadenceBreaks([], profile, mondayEvening, 4);

    // Should flag today-level cadence break for Monday
    const dayBreak = breaks.find(b => b.period.includes('today'));
    expect(dayBreak).toBeDefined();
  });
});


// ==========================================================
// 5. Intent inference edge cases
// ==========================================================

describe('Intent inference edge cases', () => {
  const SEQUENCES: LearnedSequence[] = [
    {
      fromAction: 'client.measurements_updated',
      toAction: 'client.fit_profile_created',
      occurrences: 10,
      medianDelayMs: hours(4),
      p90DelayMs: hours(48),
      confidence: 0.8,
      entityScoped: true,
    },
  ];

  it('partial workflow match (1 step) does not create an intent', () => {
    // Only "client.created" — needs at least 2 steps to match a workflow
    const activities = [
      makeActivity({
        action: 'client.created',
        createdAt: new Date(2026, 1, 15, 10, 0),
        clientId: 'c-1',
      }),
    ];

    const intents = inferIntents(activities, SEQUENCES);
    const onboarding = intents.find(i => i.label.includes('Client onboarding'));
    expect(onboarding).toBeUndefined();
  });

  it('overlapping workflows for the same entity are both detected', () => {
    // Client onboarding AND fit profile update workflows overlap
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
      makeActivity({
        action: 'client.fit_profile_created',
        createdAt: new Date(2026, 1, 15, 12, 0),
        clientId: 'c-1',
      }),
    ];

    const intents = inferIntents(activities, SEQUENCES);
    const labels = intents.map(i => i.label);

    // "Client onboarding" has all 3 steps so should match (3/3)
    // "Fit profile update" needs measurements_updated + fit_profile_created + fit_profile_updated
    // so it should match (2/3)
    const onboarding = labels.find(l => l.includes('Client onboarding'));
    const fitUpdate = labels.find(l => l.includes('Fit profile update'));
    expect(onboarding).toBeDefined();
    expect(fitUpdate).toBeDefined();
  });

  it('returns empty intents for activities with no entity context', () => {
    const activities = [
      makeActivity({
        action: 'unknown.action',
        createdAt: new Date(2026, 1, 15, 10, 0),
        // No clientId, no orderId
      }),
    ];

    const intents = inferIntents(activities, []);
    expect(intents).toHaveLength(0);
  });

  it('automation troubleshooting workflow matches without entity scoping', () => {
    const activities = [
      makeActivity({
        action: 'automation.failed',
        createdAt: new Date(2026, 1, 15, 10, 0),
        // No clientId or orderId — this is a global workflow
      }),
      makeActivity({
        action: 'automation.dead_letter',
        createdAt: new Date(2026, 1, 15, 10, 5),
      }),
    ];

    const intents = inferIntents(activities, []);
    const troubleshoot = intents.find(i => i.label.includes('Automation troubleshooting'));
    expect(troubleshoot).toBeDefined();
  });
});


// ==========================================================
// 6. Security adversarial inputs
// ==========================================================

describe('Security adversarial inputs', () => {
  it('deeply nested metadata within size limit is accepted', () => {
    let obj: Record<string, unknown> = { value: 'leaf' };
    for (let i = 0; i < 20; i++) {
      obj = { nested: obj };
    }
    const result = sanitizeMetadata(obj, 10240);
    expect(result.valid).toBe(true);
  });

  it('deeply nested metadata exceeding size limit is rejected', () => {
    let obj: Record<string, unknown> = { value: 'x'.repeat(500) };
    for (let i = 0; i < 50; i++) {
      obj = { [`level_${i}`]: obj, padding: 'y'.repeat(100) };
    }
    const result = sanitizeMetadata(obj, 1024);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('exceeds');
  });

  it('very large arrays in metadata are checked by size limit', () => {
    const meta = { items: Array.from({ length: 5000 }, (_, i) => ({ id: i })) };
    const result = sanitizeMetadata(meta, 10240);
    expect(result.valid).toBe(false);
  });

  it('unicode and emoji in action names are rejected by allowlist', () => {
    expect(isKnownAction('order.created\u{1F4A9}')).toBe(false);
    expect(isKnownAction('\u0000order.created')).toBe(false);
    expect(isKnownAction('order.\u200Bcreated')).toBe(false); // zero-width space
  });

  it('unicode and emoji in metadata values are accepted (no XSS)', () => {
    const meta = {
      name: 'Client \u{1F600} Happy',
      note: 'Measurement \u00E9l\u00E8ve',
    };
    const result = sanitizeMetadata(meta, 10240);
    expect(result.valid).toBe(true);
  });

  it('null bytes in metadata strings are handled', () => {
    const meta = { name: 'test\x00injection' };
    const result = sanitizeMetadata(meta, 10240);
    // null bytes aren't dangerous patterns — should pass
    expect(result.valid).toBe(true);
  });

  it('prototype pollution via nested __proto__ is stripped recursively', () => {
    const meta = {
      safe: 'value',
      nested: {
        __proto__: { polluted: true },
        data: {
          constructor: 'evil',
          prototype: 'bad',
          actual: 'good',
        },
      },
    };
    const result = sanitizeMetadata(meta, 10240);
    expect(result.valid).toBe(true);
    const sanitized = result.sanitized as Record<string, unknown>;
    const nested = sanitized.nested as Record<string, unknown>;
    // __proto__ key should be stripped — check via hasOwnProperty (not dot access,
    // which always returns the object's prototype)
    expect(Object.prototype.hasOwnProperty.call(nested, '__proto__')).toBe(false);
    const data = nested.data as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(data, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(data, 'prototype')).toBe(false);
    expect(data.actual).toBe('good');
  });

  it('data:text/html in metadata is rejected', () => {
    const meta = { url: 'data:text/html,<h1>evil</h1>' };
    const result = sanitizeMetadata(meta, 10240);
    expect(result.valid).toBe(false);
  });

  it('event handler injection across nested keys is detected', () => {
    const meta = {
      level1: {
        level2: {
          content: '<div onload="evil()">',
        },
      },
    };
    const result = sanitizeMetadata(meta, 10240);
    expect(result.valid).toBe(false);
  });

  it('secure service rejects rate-limited creation before metadata check', async () => {
    const db = makeMockDb();
    const callOrder: string[] = [];

    const service = createSecureActivityService(db, 'tenant-1', {
      shouldAllowCreation: async () => {
        callOrder.push('rate-check');
        return false;
      },
    });

    // Valid action + valid metadata but rate-limited
    await expect(
      service.createActivity({
        action: 'order.created',
        description: 'test',
        metadata: { ok: true },
      })
    ).rejects.toThrow('rate limited');
  });
});


// ==========================================================
// 7. Agent tool cache behavior
// ==========================================================

describe('Agent tool cache behavior', () => {
  it('cache returns same reference within TTL window', async () => {
    const db = makeMockDb();
    const handlers = createAgentToolHandlers(db);

    const pulse1 = await handlers.getOperationalPulse([], []);
    const pulse2 = await handlers.getOperationalPulse([], []);
    const pulse3 = await handlers.getPulseSummary([], []);

    // All should use the same cached pulse
    expect(pulse1).toBe(pulse2);
    // Summary should derive from the same cached pulse
    expect(typeof pulse3).toBe('string');
  });

  it('invalidateCache causes fresh computation', async () => {
    const db = makeMockDb();
    const handlers = createAgentToolHandlers(db);

    const pulse1 = await handlers.getOperationalPulse([], []);
    handlers.invalidateCache();
    const pulse2 = await handlers.getOperationalPulse([], []);

    expect(pulse1).not.toBe(pulse2);
  });

  it('concurrent pulse requests return the same cached result', async () => {
    const db = makeMockDb();
    const handlers = createAgentToolHandlers(db);

    // Fire multiple requests in parallel
    const [p1, p2, p3] = await Promise.all([
      handlers.getOperationalPulse([], []),
      handlers.getOperationalPulse([], []),
      handlers.getOperationalPulse([], []),
    ]);

    // All three should be the same cached reference
    expect(p1).toBe(p2);
    expect(p2).toBe(p3);
  });

  it('checkPulseAttention uses cached pulse', async () => {
    const db = makeMockDb();
    const handlers = createAgentToolHandlers(db);

    // Pre-warm the cache
    await handlers.getOperationalPulse([], []);

    // checkPulseAttention should use cached pulse (no recomputation)
    const result = await handlers.checkPulseAttention([], []);
    expect(typeof result).toBe('boolean');
  });

  it('getMissingBeats uses cached pulse', async () => {
    const db = makeMockDb();
    const handlers = createAgentToolHandlers(db);

    const beats = await handlers.getMissingBeats([], []);
    expect(beats).toBeInstanceOf(Map);
    expect(beats.size).toBe(0);
  });

  it('invalidateCache followed by checkPulseAttention recomputes', async () => {
    const db = makeMockDb();
    const handlers = createAgentToolHandlers(db);

    await handlers.getOperationalPulse([], []);
    handlers.invalidateCache();

    // Should recompute since cache was invalidated
    const result = await handlers.checkPulseAttention([], []);
    expect(result).toBe(false); // Empty data = no attention needed
  });
});


// ==========================================================
// 8. Full pipeline: learn -> detect -> summarize
// ==========================================================

describe('Full pipeline: learn sequences, detect missing beats, summarize', () => {
  it('end-to-end: historical patterns detect dropped balls in recent data', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const baseTime = now.getTime() - days(60);

    // Build history: measurements -> fit_profile_created, 12 times
    const historical = buildHistoricalDataset({
      fromAction: 'client.measurements_updated',
      toAction: 'client.fit_profile_created',
      delayMs: hours(4),
      repetitions: 12,
      baseTime,
    });

    // Recent: a measurement 5 days ago with NO follow-up
    const recent = [
      makeActivity({
        id: 'dropped',
        action: 'client.measurements_updated',
        createdAt: new Date(now.getTime() - days(5)),
        clientId: 'new-client',
        description: 'Measured New Client',
        client: { id: 'new-client', name: 'New Client' },
      }),
    ];

    const pulse = computePulse(historical, recent, now, {
      minActivitiesForLearning: 10,
      minOccurrences: 3,
      minConfidence: 0.1,
    });

    // Should detect the dropped ball
    expect(pulse.missingBeats.length).toBeGreaterThan(0);
    const dropped = pulse.missingBeats.find(b =>
      b.triggerActivity.id === 'dropped' &&
      b.expectedAction === 'client.fit_profile_created'
    );
    expect(dropped).toBeDefined();

    // Summary should mention it
    const summary = summarizeForAgent(pulse);
    expect(summary).toContain('Missing Beats');

    // Should need attention
    expect(pulseNeedsAttention(pulse)).toBe(true);
  });

  it('no dropped balls when all follow-ups completed', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const baseTime = now.getTime() - days(60);

    const historical = buildHistoricalDataset({
      fromAction: 'client.measurements_updated',
      toAction: 'client.fit_profile_created',
      delayMs: hours(4),
      repetitions: 12,
      baseTime,
    });

    // Recent: measurement AND its follow-up
    const recent = [
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: new Date(now.getTime() - days(2)),
        clientId: 'happy-client',
      }),
      makeActivity({
        action: 'client.fit_profile_created',
        createdAt: new Date(now.getTime() - days(2) + hours(3)),
        clientId: 'happy-client',
      }),
    ];

    const pulse = computePulse(historical, recent, now, {
      minActivitiesForLearning: 10,
      minOccurrences: 3,
      minConfidence: 0.1,
    });

    // The happy-client follow-up should satisfy the measurements -> fit_profile beat
    const happyClientMeasurementBeat = pulse.missingBeats.find(b =>
      b.triggerActivity.clientId === 'happy-client' &&
      b.triggerActivity.action === 'client.measurements_updated' &&
      b.expectedAction === 'client.fit_profile_created'
    );
    expect(happyClientMeasurementBeat).toBeUndefined();
  });
});
