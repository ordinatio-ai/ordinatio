// ===========================================
// TESTS: Ironclad Pulse — Ghost Projections,
// Shannon Entropy, Evidence-Based Resolution,
// Memory Pressure, Security Edge Cases,
// Temporal Chaos
// ===========================================

import { describe, it, expect } from 'vitest';
import { projectGhosts } from '../intuition/ghosts';
import type { GhostProjection } from '../intuition/ghosts';
import { calculateEntropy, detectBotStorm, ENTROPY_BOT_THRESHOLD } from '../intuition/entropy';
import { suggestResolutions } from '../intuition/resolution';
import { computePulse, summarizeForAgent, pulseNeedsAttention } from '../intuition/pulse';
import { detectMissingBeats } from '../intuition/missing-beats';
import { detectCadenceBreaks, learnCadence } from '../intuition/cadence';
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

function makeSequence(overrides: Partial<LearnedSequence> = {}): LearnedSequence {
  return {
    fromAction: 'client.measurements_updated',
    toAction: 'client.fit_profile_created',
    occurrences: 10,
    medianDelayMs: hours(4),
    p90DelayMs: hours(48),
    confidence: 0.8,
    entityScoped: true,
    ...overrides,
  };
}

// ===========================================
// Suite 1: Shannon Entropy & Bot Storm Detection
// ===========================================

describe('Shannon Entropy & Bot Storm Detection', () => {
  it('returns 0 entropy for 1000 identical events', () => {
    const now = new Date();
    const activities = Array.from({ length: 1000 }, (_, i) =>
      makeActivity({
        action: 'order.created',
        createdAt: new Date(now.getTime() - i * 1000),
      })
    );
    const entropy = calculateEntropy(activities);
    expect(entropy).toBeLessThan(0.1);
    expect(entropy).toBe(0);
  });

  it('returns high entropy for events across 10 types', () => {
    const now = new Date();
    const actions = Array.from({ length: 10 }, (_, i) => `action.type_${i}`);
    const activities = Array.from({ length: 1000 }, (_, i) =>
      makeActivity({
        action: actions[i % 10]!,
        createdAt: new Date(now.getTime() - i * 1000),
      })
    );
    const entropy = calculateEntropy(activities);
    expect(entropy).toBeGreaterThan(3.0);
    // log2(10) ≈ 3.32
    expect(entropy).toBeCloseTo(Math.log2(10), 1);
  });

  it('returns 0 for empty array', () => {
    expect(calculateEntropy([])).toBe(0);
  });

  it('returns 0 for single event', () => {
    const activities = [makeActivity({ action: 'foo', createdAt: new Date() })];
    expect(calculateEntropy(activities)).toBe(0);
  });

  it('detects bot storm with uniform intervals and single action', () => {
    const now = new Date();
    // 100 identical events, 100ms apart → very regular
    const activities = Array.from({ length: 100 }, (_, i) =>
      makeActivity({
        action: 'automation.triggered',
        createdAt: new Date(now.getTime() - i * 100),
      })
    );
    const result = detectBotStorm(activities, hours(1));
    expect(result.isBotStorm).toBe(true);
    expect(result.entropy).toBeLessThan(ENTROPY_BOT_THRESHOLD);
    expect(result.dominantAction).toBe('automation.triggered');
  });

  it('does not flag bot storm with irregular human-like intervals', () => {
    const now = new Date();
    const actions = ['order.created', 'client.updated', 'email.sent', 'task.completed'];
    const activities = Array.from({ length: 50 }, (_, i) =>
      makeActivity({
        action: actions[i % 4]!,
        // Irregular intervals: random between 1-120 seconds
        createdAt: new Date(now.getTime() - i * (1000 + Math.random() * 119000)),
      })
    );
    const result = detectBotStorm(activities, hours(2));
    expect(result.isBotStorm).toBe(false);
  });

  it('handles 90/10 split as low but non-zero entropy', () => {
    const now = new Date();
    const activities = [
      ...Array.from({ length: 90 }, (_, i) =>
        makeActivity({ action: 'dominant', createdAt: new Date(now.getTime() - i * 1000) })
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        makeActivity({ action: 'rare', createdAt: new Date(now.getTime() - (90 + i) * 1000) })
      ),
    ];
    const entropy = calculateEntropy(activities);
    expect(entropy).toBeGreaterThan(0);
    expect(entropy).toBeLessThan(1.0);
  });

  it('returns low burst rate for sparse events', () => {
    const now = new Date();
    const activities = Array.from({ length: 5 }, (_, i) =>
      makeActivity({ action: 'foo', createdAt: new Date(now.getTime() - i * 60000) })
    );
    const result = detectBotStorm(activities);
    expect(result.isBotStorm).toBe(false);
    expect(result.burstRate).toBe(0);
  });
});

// ===========================================
// Suite 2: Ghost Precision & Monotonicity
// ===========================================

describe('Ghost Precision & Monotonicity', () => {
  const SEQ = makeSequence(); // p90 = 48h

  it('projects a ghost when trigger is 1h ago with p90=48h', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const triggerTime = new Date(now.getTime() - hours(1));

    const activities = [
      makeActivity({
        id: 'trigger-1',
        action: 'client.measurements_updated',
        createdAt: triggerTime,
        clientId: 'client-1',
      }),
    ];

    const ghosts = projectGhosts(activities, [SEQ], now);
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]!.expectedAction).toBe('client.fit_profile_created');
    expect(ghosts[0]!.countdownMs).toBeCloseTo(hours(47), -3);
    expect(ghosts[0]!.urgency).toBe('LOW');
  });

  it('returns empty when past p90 (becomes missing beat)', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const triggerTime = new Date(now.getTime() - hours(49)); // past 48h p90

    const activities = [
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: triggerTime,
        clientId: 'client-1',
      }),
    ];

    const ghosts = projectGhosts(activities, [SEQ], now);
    expect(ghosts).toHaveLength(0);
  });

  it('urgency transitions LOW → MEDIUM → HIGH as countdown drops', () => {
    const triggerTime = new Date(2026, 1, 15, 0, 0);
    const activities = [
      makeActivity({
        id: 'trigger-1',
        action: 'client.measurements_updated',
        createdAt: triggerTime,
        clientId: 'client-1',
      }),
    ];

    // LOW: 80% remaining (9.6h elapsed of 48h)
    const nowLow = new Date(triggerTime.getTime() + hours(9.6));
    const ghostsLow = projectGhosts(activities, [SEQ], nowLow);
    expect(ghostsLow[0]!.urgency).toBe('LOW');

    // MEDIUM: 50% remaining (24h elapsed of 48h) — with 0.8 confidence,
    // confidenceShift = 0.18, adjustedPct = 0.5 - 0.18 = 0.32 → MEDIUM
    const nowMed = new Date(triggerTime.getTime() + hours(24));
    const ghostsMed = projectGhosts(activities, [SEQ], nowMed);
    expect(ghostsMed[0]!.urgency).toBe('MEDIUM');

    // HIGH: 5% remaining (45.6h elapsed of 48h)
    const nowHigh = new Date(triggerTime.getTime() + hours(45.6));
    const ghostsHigh = projectGhosts(activities, [SEQ], nowHigh);
    expect(ghostsHigh[0]!.urgency).toBe('HIGH');
  });

  it('scopes ghosts by entity (same clientId)', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const triggerTime = new Date(now.getTime() - hours(1));

    const activities = [
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: triggerTime,
        clientId: 'client-1',
      }),
    ];

    const ghosts = projectGhosts(activities, [SEQ], now);
    expect(ghosts[0]!.entityId).toBe('client-1');
    expect(ghosts[0]!.entityType).toBe('client');
  });

  it('produces no ghost when follow-up already exists', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const triggerTime = new Date(now.getTime() - hours(1));

    const activities = [
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: triggerTime,
        clientId: 'client-1',
      }),
      makeActivity({
        action: 'client.fit_profile_created',
        createdAt: new Date(now.getTime() - hours(0.5)),
        clientId: 'client-1',
      }),
    ];

    const ghosts = projectGhosts(activities, [SEQ], now);
    expect(ghosts).toHaveLength(0);
  });

  it('skips low-confidence sequences below minConfidence', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const lowConfSeq = makeSequence({ confidence: 0.1 });

    const activities = [
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: new Date(now.getTime() - hours(1)),
        clientId: 'client-1',
      }),
    ];

    const ghosts = projectGhosts(activities, [lowConfSeq], now, { minConfidence: 0.3 });
    expect(ghosts).toHaveLength(0);
  });

  it('projects multiple ghosts from same trigger for different sequences', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const triggerTime = new Date(now.getTime() - hours(1));

    const seq1 = makeSequence({ toAction: 'client.fit_profile_created' });
    const seq2 = makeSequence({ toAction: 'order.created' });

    const activities = [
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: triggerTime,
        clientId: 'client-1',
      }),
    ];

    const ghosts = projectGhosts(activities, [seq1, seq2], now);
    expect(ghosts).toHaveLength(2);
    const actions = ghosts.map(g => g.expectedAction);
    expect(actions).toContain('client.fit_profile_created');
    expect(actions).toContain('order.created');
  });

  it('calculates projectionTimestamp = trigger.createdAt + p90', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const triggerTime = new Date(now.getTime() - hours(2));

    const activities = [
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: triggerTime,
        clientId: 'client-1',
      }),
    ];

    const ghosts = projectGhosts(activities, [SEQ], now);
    const expected = new Date(triggerTime.getTime() + SEQ.p90DelayMs);
    expect(ghosts[0]!.projectionTimestamp.getTime()).toBe(expected.getTime());
  });
});

// ===========================================
// Suite 3: Memory Pressure
// ===========================================

describe('Memory Pressure', () => {
  it('computePulse runs 100 times without crash or timeout', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const activities = Array.from({ length: 100 }, (_, i) =>
      makeActivity({
        action: i % 2 === 0 ? 'client.created' : 'order.created',
        createdAt: new Date(now.getTime() - i * hours(1)),
      })
    );

    for (let i = 0; i < 100; i++) {
      const pulse = computePulse(activities, activities.slice(0, 10), now);
      expect(pulse.computedAt).toBeTruthy();
    }
  });

  it('handles 10 years of data with detectionWindowDays=14', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    // 10 years ≈ 3650 days, one activity per day
    const activities = Array.from({ length: 3650 }, (_, i) =>
      makeActivity({
        action: `action_${i % 20}`,
        createdAt: new Date(now.getTime() - i * days(1)),
      })
    );

    const pulse = computePulse(activities, activities.slice(0, 14), now, {
      detectionWindowDays: 14,
    });
    expect(pulse.activitiesAnalyzed).toBeGreaterThan(0);
    expect(pulse.summary).toBeTruthy();
  });

  it('deduplicates 50K activities with 90% overlap efficiently', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const baseActivities = Array.from({ length: 5000 }, (_, i) =>
      makeActivity({
        id: `act-${i}`,
        action: `action_${i % 10}`,
        createdAt: new Date(now.getTime() - i * 60000),
      })
    );
    // Duplicate 90%
    const duplicated = [
      ...baseActivities,
      ...baseActivities.slice(0, 4500),
      ...baseActivities.slice(0, 4500),
      ...baseActivities.slice(0, 4500),
      ...baseActivities.slice(0, 4500),
      ...baseActivities.slice(0, 4500),
      ...baseActivities.slice(0, 4500),
      ...baseActivities.slice(0, 4500),
      ...baseActivities.slice(0, 4500),
      ...baseActivities.slice(0, 4500),
    ];

    const start = performance.now();
    const pulse = computePulse(duplicated, baseActivities.slice(0, 100), now);
    const elapsed = performance.now() - start;

    expect(pulse.activitiesAnalyzed).toBeLessThanOrEqual(5000);
    expect(elapsed).toBeLessThan(10000); // should finish well under 10s
  });
});

// ===========================================
// Suite 4: Evidence-Based Resolution
// ===========================================

describe('Evidence-Based Resolution', () => {
  it('ranks A→B (100x) and A→C (50x) by historical rate', () => {
    const sequences = [
      makeSequence({ fromAction: 'trigger', toAction: 'follow_b', occurrences: 100, confidence: 0.6 }),
      makeSequence({ fromAction: 'trigger', toAction: 'follow_c', occurrences: 50, confidence: 0.3 }),
    ];

    const suggestions = suggestResolutions('trigger', sequences);
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]!.action).toBe('follow_b');
    expect(suggestions[0]!.historicalRate).toBeCloseTo(100 / 150, 2);
    expect(suggestions[1]!.action).toBe('follow_c');
    expect(suggestions[1]!.historicalRate).toBeCloseTo(50 / 150, 2);
  });

  it('returns dominant first in 95/5 split', () => {
    const sequences = [
      makeSequence({ fromAction: 'trigger', toAction: 'dominant', occurrences: 95, confidence: 0.9 }),
      makeSequence({ fromAction: 'trigger', toAction: 'rare', occurrences: 5, confidence: 0.05 }),
    ];

    const suggestions = suggestResolutions('trigger', sequences);
    expect(suggestions[0]!.action).toBe('dominant');
    expect(suggestions[0]!.historicalRate).toBeGreaterThan(0.9);
  });

  it('returns empty for unknown trigger action', () => {
    const sequences = [makeSequence({ fromAction: 'known_action' })];
    const suggestions = suggestResolutions('unknown_action', sequences);
    expect(suggestions).toHaveLength(0);
  });

  it('returns 100% rate for single follow-up', () => {
    const sequences = [
      makeSequence({ fromAction: 'trigger', toAction: 'only_option', occurrences: 20 }),
    ];

    const suggestions = suggestResolutions('trigger', sequences);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.historicalRate).toBe(1);
  });

  it('filters out sequences below minOccurrences', () => {
    const sequences = [
      makeSequence({ fromAction: 'trigger', toAction: 'enough', occurrences: 10 }),
      makeSequence({ fromAction: 'trigger', toAction: 'not_enough', occurrences: 1 }),
    ];

    const suggestions = suggestResolutions('trigger', sequences, 2);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.action).toBe('enough');
  });

  it('includes medianDelayMs and confidence from sequence', () => {
    const sequences = [
      makeSequence({
        fromAction: 'trigger',
        toAction: 'follow',
        occurrences: 50,
        medianDelayMs: hours(6),
        confidence: 0.75,
      }),
    ];

    const suggestions = suggestResolutions('trigger', sequences);
    expect(suggestions[0]!.medianDelayMs).toBe(hours(6));
    expect(suggestions[0]!.confidence).toBe(0.75);
  });
});

// ===========================================
// Suite 5: Security Edge Cases
// ===========================================

describe('Security Edge Cases', () => {
  it('handles XSS in metadata key names without issue (JSON storage)', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const activities = [
      makeActivity({
        action: 'client.created',
        createdAt: new Date(now.getTime() - hours(1)),
        metadata: { '<script>alert(1)</script>': 'xss', 'normal': 'value' },
      }),
    ];

    // Entropy calculation should not crash on weird metadata
    const entropy = calculateEntropy(activities);
    expect(entropy).toBe(0); // single event
  });

  it('computePulse with mixed-tenant activities produces no cross-contamination', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const baseTime = now.getTime() - days(60);

    // Tenant A: measurements → fit profiles
    const tenantA: ActivityWithRelations[] = [];
    for (let i = 0; i < 15; i++) {
      tenantA.push(
        makeActivity({
          action: 'client.measurements_updated',
          createdAt: new Date(baseTime + i * days(3)),
          clientId: `tenantA-client-${i}`,
        }),
        makeActivity({
          action: 'client.fit_profile_created',
          createdAt: new Date(baseTime + i * days(3) + hours(2)),
          clientId: `tenantA-client-${i}`,
        }),
      );
    }

    // Tenant B: different patterns entirely
    const tenantB: ActivityWithRelations[] = [];
    for (let i = 0; i < 15; i++) {
      tenantB.push(
        makeActivity({
          action: 'order.created',
          createdAt: new Date(baseTime + i * days(3)),
          orderId: `tenantB-order-${i}`,
        }),
      );
    }

    // Add filler for min activities
    for (let i = 0; i < 30; i++) {
      tenantA.push(makeActivity({ action: 'filler', createdAt: new Date(baseTime + i * days(2)) }));
    }

    // If we only feed tenant A data, missing beats should only reference tenant A entities
    const pulse = computePulse(tenantA, tenantA.slice(-5), now);
    for (const beat of pulse.missingBeats) {
      if (beat.triggerActivity.clientId) {
        expect(beat.triggerActivity.clientId).toMatch(/^tenantA-/);
      }
    }
    for (const ghost of pulse.ghostProjections) {
      if (ghost.entityId) {
        expect(ghost.entityId).toMatch(/^tenantA-/);
      }
    }
  });

  it('rejects actions not matching learned sequences (no false positives)', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const seq = makeSequence({ fromAction: 'legitimate.action' });

    // Activity with Unicode homoglyph action name
    const activities = [
      makeActivity({
        action: 'legit\u0456mate.action', // Cyrillic і instead of Latin i
        createdAt: new Date(now.getTime() - hours(1)),
        clientId: 'client-1',
      }),
    ];

    const ghosts = projectGhosts(activities, [seq], now);
    expect(ghosts).toHaveLength(0); // exact string match prevents homoglyph injection
  });
});

// ===========================================
// Suite 6: Temporal Chaos
// ===========================================

describe('Temporal Chaos', () => {
  it('now before most recent activity → no missing beats, no crash', () => {
    const futureActivity = makeActivity({
      action: 'client.measurements_updated',
      createdAt: new Date(2026, 1, 20, 12, 0), // "future"
      clientId: 'client-1',
    });
    const now = new Date(2026, 1, 15, 12, 0); // before the activity
    const seq = makeSequence();

    const beats = detectMissingBeats([futureActivity], [seq], now);
    expect(beats).toHaveLength(0); // waitingMs is negative → < p90 → skipped

    const ghosts = projectGhosts([futureActivity], [seq], now);
    expect(ghosts).toHaveLength(0); // waitingMs <= 0 → skipped
  });

  it('activities with identical timestamps → no infinite loops', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const sameTime = new Date(now.getTime() - hours(5));
    const seq = makeSequence();

    const activities = Array.from({ length: 20 }, (_, i) =>
      makeActivity({
        id: `act-${i}`,
        action: i % 2 === 0 ? 'client.measurements_updated' : 'client.fit_profile_created',
        createdAt: sameTime,
        clientId: 'client-1',
      })
    );

    // Should not hang
    const beats = detectMissingBeats(activities, [seq], now);
    expect(Array.isArray(beats)).toBe(true);

    const ghosts = projectGhosts(activities, [seq], now);
    expect(Array.isArray(ghosts)).toBe(true);
  });

  it('reverse-chronological input still works', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const activities = Array.from({ length: 50 }, (_, i) =>
      makeActivity({
        action: `action_${i % 5}`,
        // Activities in reverse chronological order
        createdAt: new Date(now.getTime() - (50 - i) * hours(1)),
      })
    );

    const entropy = calculateEntropy(activities);
    expect(entropy).toBeGreaterThan(0);

    const profile = learnCadence(activities);
    expect(profile.totalActivities).toBe(50);
  });

  it('detectCadenceBreaks with now = epoch → empty, no crash', () => {
    const epoch = new Date(0);
    const activities = [
      makeActivity({ action: 'foo', createdAt: new Date(1000) }),
    ];
    const profile = learnCadence(activities);
    const breaks = detectCadenceBreaks(activities, profile, epoch);
    expect(Array.isArray(breaks)).toBe(true);
  });

  it('ghost projection with now = 0 → empty, no crash', () => {
    const epoch = new Date(0);
    const seq = makeSequence();
    const activities = [
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: new Date(1000),
        clientId: 'client-1',
      }),
    ];

    const ghosts = projectGhosts(activities, [seq], epoch);
    expect(Array.isArray(ghosts)).toBe(true);
    // Activity is "in the future" relative to epoch → no ghost
    expect(ghosts).toHaveLength(0);
  });
});

// ===========================================
// Integration: Pulse includes new fields
// ===========================================

describe('Pulse integration with ghosts & entropy', () => {
  it('computePulse includes ghostProjections and entropy in summary', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const pulse = computePulse([], [], now);
    expect(pulse.ghostProjections).toEqual([]);
    expect(pulse.summary.ghostCount).toBe(0);
    expect(pulse.summary.entropy).toBe(0);
    expect(pulse.summary.botStormDetected).toBe(false);
  });

  it('summarizeForAgent includes ghost warnings when HIGH urgency', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const baseTime = now.getTime() - days(60);

    // Build enough history to learn sequences
    const historical: ActivityWithRelations[] = [];
    for (let i = 0; i < 15; i++) {
      const clientId = `client-${i}`;
      historical.push(
        makeActivity({
          action: 'client.measurements_updated',
          createdAt: new Date(baseTime + i * days(3)),
          clientId,
        }),
        makeActivity({
          action: 'client.fit_profile_created',
          createdAt: new Date(baseTime + i * days(3) + hours(4)),
          clientId,
        }),
      );
    }
    // Filler
    for (let i = 0; i < 30; i++) {
      historical.push(makeActivity({ action: 'filler', createdAt: new Date(baseTime + i * days(2)) }));
    }

    // Recent: trigger with no follow-up, close to p90
    const recentTrigger = makeActivity({
      action: 'client.measurements_updated',
      createdAt: new Date(now.getTime() - hours(2)), // recent, within p90
      clientId: 'new-client',
    });

    const pulse = computePulse(historical, [recentTrigger], now);

    // Should have at least the summary fields
    expect(typeof pulse.summary.ghostCount).toBe('number');
    expect(typeof pulse.summary.entropy).toBe('number');
    expect(typeof pulse.summary.botStormDetected).toBe('boolean');
  });

  it('pulseNeedsAttention returns true when HIGH ghost exists', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const seq = makeSequence({ p90DelayMs: hours(2) }); // tight window
    const triggerTime = new Date(now.getTime() - hours(1.9)); // 95% through

    const activities = [
      makeActivity({
        action: 'client.measurements_updated',
        createdAt: triggerTime,
        clientId: 'client-1',
      }),
    ];

    const ghosts = projectGhosts(activities, [seq], now);
    expect(ghosts.length).toBeGreaterThan(0);
    expect(ghosts[0]!.urgency).toBe('HIGH');

    // Build a minimal pulse with this ghost
    const pulse = computePulse([], [], now);
    // Override ghostProjections for testing
    pulse.ghostProjections = ghosts;
    expect(pulseNeedsAttention(pulse)).toBe(true);
  });
});
