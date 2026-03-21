// ===========================================
// TESTS: Large-Scale Intuition Performance
// ===========================================
// Gap G3: Verifies the intuition engine handles
// large datasets correctly and within performance
// budgets. No fake timers — real Date objects only.
// ===========================================

import { describe, it, expect } from 'vitest';
import { learnSequences } from '../intuition/sequence-learner';
import { detectMissingBeats, prioritizeMissingBeats } from '../intuition/missing-beats';
import { learnCadence, detectCadenceBreaks } from '../intuition/cadence';
import { computePulse, summarizeForAgent } from '../intuition/pulse';
import type { ActivityWithRelations } from '../types';
import type { LearnedSequence } from '../intuition/types';

// ---- Helpers ----

let idCounter = 0;

function makeActivity(
  overrides: Partial<ActivityWithRelations> & { action: string; createdAt: Date },
): ActivityWithRelations {
  return {
    id: `act-${++idCounter}-${Math.random().toString(36).slice(2, 8)}`,
    description: overrides.description ?? `test activity: ${overrides.action}`,
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

interface PatternSpec {
  from: string;
  to: string;
  delayMs: number;
  probability: number;
  clientId?: string;
  orderId?: string;
}

/**
 * Generate a large dataset of activities distributed across patterns.
 * Each pattern produces A->B pairs with specified delay and probability.
 */
function generateActivities(
  count: number,
  patterns: PatternSpec[],
): ActivityWithRelations[] {
  const activities: ActivityWithRelations[] = [];
  const baseTime = new Date(2026, 0, 1).getTime();
  const totalWeight = patterns.reduce((s, p) => s + p.probability, 0);

  let timeOffset = 0;
  for (let i = 0; i < count; i++) {
    // Pick a pattern proportional to probability
    let roll = Math.random() * totalWeight;
    let pattern = patterns[0]!;
    for (const p of patterns) {
      roll -= p.probability;
      if (roll <= 0) { pattern = p; break; }
    }

    const aTime = new Date(baseTime + timeOffset);
    const bTime = new Date(baseTime + timeOffset + pattern.delayMs);

    activities.push(
      makeActivity({
        action: pattern.from,
        createdAt: aTime,
        clientId: pattern.clientId ?? null,
        orderId: pattern.orderId ?? null,
      }),
      makeActivity({
        action: pattern.to,
        createdAt: bTime,
        clientId: pattern.clientId ?? null,
        orderId: pattern.orderId ?? null,
      }),
    );

    // Advance time so activities don't collide
    timeOffset += pattern.delayMs + 60_000; // pattern delay + 1 min gap
  }

  return activities;
}

function hours(n: number): number { return n * 60 * 60 * 1000; }
function days(n: number): number { return n * 24 * 60 * 60 * 1000; }

// ---- Tests ----

describe('Large-Scale Intuition Performance', () => {
  it('10K activities — learnSequences completes in <500ms', () => {
    const patterns: PatternSpec[] = [
      { from: 'client.created', to: 'client.measurements_updated', delayMs: hours(2), probability: 0.3 },
      { from: 'client.measurements_updated', to: 'client.fit_profile_created', delayMs: hours(4), probability: 0.25 },
      { from: 'order.created', to: 'placement.pending', delayMs: hours(1), probability: 0.2 },
      { from: 'placement.pending', to: 'placement.completed', delayMs: hours(6), probability: 0.15 },
      { from: 'email.received', to: 'email.linked_to_client', delayMs: hours(0.5), probability: 0.1 },
    ];
    const activities = generateActivities(5000, patterns); // 5000 pairs = 10K activities

    const start = performance.now();
    const sequences = learnSequences(activities, { minActivitiesForLearning: 50, minOccurrences: 3, minConfidence: 0.1 });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
    expect(sequences.length).toBeGreaterThan(0);

    // Should discover all 5 patterns
    const discoveredPairs = sequences.map(s => `${s.fromAction}->${s.toAction}`);
    for (const p of patterns) {
      expect(discoveredPairs).toContain(`${p.from}->${p.to}`);
    }
  });

  it('10K activities — computePulse completes in <500ms', () => {
    const patterns: PatternSpec[] = [
      { from: 'order.created', to: 'placement.pending', delayMs: hours(1), probability: 0.5 },
      { from: 'placement.pending', to: 'placement.completed', delayMs: hours(3), probability: 0.3 },
      { from: 'client.created', to: 'client.measurements_updated', delayMs: hours(2), probability: 0.2 },
    ];
    const historical = generateActivities(5000, patterns);

    // Recent activities: last 24h
    const now = new Date(2026, 2, 1);
    const recent = Array.from({ length: 50 }, (_, i) =>
      makeActivity({
        action: i % 2 === 0 ? 'order.created' : 'placement.pending',
        createdAt: new Date(now.getTime() - hours(i * 0.4)),
      }),
    );

    const start = performance.now();
    const pulse = computePulse(historical, recent, now, {
      minActivitiesForLearning: 50,
      minOccurrences: 3,
      minConfidence: 0.1,
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
    expect(pulse.activitiesAnalyzed).toBeGreaterThan(0);
    expect(pulse.summary).toBeDefined();
  });

  it('100 learned sequences — detectMissingBeats scales', () => {
    // Build 100 fake learned sequences
    const sequences: LearnedSequence[] = Array.from({ length: 100 }, (_, i) => ({
      fromAction: `action_from_${i}`,
      toAction: `action_to_${i}`,
      occurrences: 20,
      medianDelayMs: hours(2),
      p90DelayMs: hours(6),
      confidence: 0.7,
      entityScoped: false,
    }));

    // 1K recent activities — some are trigger actions, some are not
    const now = new Date(2026, 2, 1);
    const activities: ActivityWithRelations[] = Array.from({ length: 1000 }, (_, i) => {
      const seqIdx = i % 100;
      return makeActivity({
        action: `action_from_${seqIdx}`,
        createdAt: new Date(now.getTime() - days(3) + i * 60_000),
      });
    });

    const start = performance.now();
    const beats = detectMissingBeats(activities, sequences, now, { detectionWindowDays: 14 });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
    // Should detect missing beats since no follow-ups exist
    expect(beats.length).toBeGreaterThan(0);
  });

  it('large entity groups — 500 unique clientIds, each with 20 activities', () => {
    const activities: ActivityWithRelations[] = [];
    const baseTime = new Date(2026, 0, 1).getTime();

    for (let c = 0; c < 500; c++) {
      const clientId = `client-${c}`;
      for (let a = 0; a < 20; a++) {
        const action = a % 2 === 0 ? 'client.measurements_updated' : 'client.fit_profile_created';
        activities.push(
          makeActivity({
            action,
            createdAt: new Date(baseTime + c * days(1) + a * hours(1)),
            clientId,
            client: { id: clientId, name: `Client ${c}` },
          }),
        );
      }
    }

    const start = performance.now();
    const sequences = learnSequences(activities, {
      minActivitiesForLearning: 50,
      minOccurrences: 3,
      minConfidence: 0.1,
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
    expect(sequences.length).toBeGreaterThan(0);

    // The entity-scoped A->B pattern should be discovered
    const entityScoped = sequences.filter(s => s.entityScoped);
    expect(entityScoped.length).toBeGreaterThan(0);
    const measToFit = entityScoped.find(
      s => s.fromAction === 'client.measurements_updated' && s.toAction === 'client.fit_profile_created'
    );
    expect(measToFit).toBeDefined();
    // 500 clients * 10 pairs per client = high occurrences
    expect(measToFit!.occurrences).toBeGreaterThanOrEqual(500);
  });

  it('high confidence approaches 1.0 with 1000 occurrences of the same A->B pattern', () => {
    const activities: ActivityWithRelations[] = [];
    const baseTime = new Date(2026, 0, 1).getTime();

    // 1000 pairs: A always followed by B for the same client
    for (let i = 0; i < 1000; i++) {
      const clientId = `client-${i}`;
      activities.push(
        makeActivity({
          action: 'order.approved',
          createdAt: new Date(baseTime + i * hours(2)),
          clientId,
        }),
        makeActivity({
          action: 'placement.pending',
          createdAt: new Date(baseTime + i * hours(2) + hours(0.5)),
          clientId,
        }),
      );
    }

    const sequences = learnSequences(activities, {
      minActivitiesForLearning: 50,
      minOccurrences: 3,
      minConfidence: 0.1,
    });

    const target = sequences.find(
      s => s.fromAction === 'order.approved' && s.toAction === 'placement.pending' && s.entityScoped
    );
    expect(target).toBeDefined();
    // Confidence = occurrences of A->B / total occurrences of A
    // With each A always followed by B in entity scope, confidence should be very high
    expect(target!.confidence).toBeGreaterThanOrEqual(0.8);
    expect(target!.occurrences).toBeGreaterThanOrEqual(500);
  });

  it('many missing beats — prioritizeMissingBeats returns at most 15', () => {
    const now = new Date(2026, 2, 1);
    const sequence: LearnedSequence = {
      fromAction: 'order.created',
      toAction: 'placement.pending',
      occurrences: 50,
      medianDelayMs: hours(1),
      p90DelayMs: hours(3),
      confidence: 0.8,
      entityScoped: false,
    };

    // 60 trigger activities with no follow-ups — should produce 60 missing beats
    const activities: ActivityWithRelations[] = Array.from({ length: 60 }, (_, i) =>
      makeActivity({
        action: 'order.created',
        createdAt: new Date(now.getTime() - days(5) + i * hours(1)),
      }),
    );

    const allBeats = detectMissingBeats(activities, [sequence], now, { detectionWindowDays: 14 });
    expect(allBeats.length).toBeGreaterThan(15);

    const prioritized = prioritizeMissingBeats(allBeats, 15);
    expect(prioritized.length).toBeLessThanOrEqual(15);
    // Should be sorted by urgency (alarm first)
    if (prioritized.length >= 2) {
      const urgencyOrder = { alarm: 0, nudge: 1, watch: 2 } as const;
      for (let i = 1; i < prioritized.length; i++) {
        const prev = urgencyOrder[prioritized[i - 1]!.urgency];
        const curr = urgencyOrder[prioritized[i]!.urgency];
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    }
  });

  it('cadence with 365 days of data — computes profile correctly', () => {
    const activities: ActivityWithRelations[] = [];
    const baseTime = new Date(2025, 0, 1).getTime();

    // One activity per hour for 365 days = 8760 activities
    for (let h = 0; h < 365 * 24; h++) {
      // Only emit during business hours (8-18) on weekdays
      const time = new Date(baseTime + h * hours(1));
      const hour = time.getHours();
      const day = time.getDay();
      const isBusinessHour = hour >= 8 && hour < 18;
      const isWeekday = day >= 1 && day <= 5;
      if (isBusinessHour && isWeekday) {
        activities.push(
          makeActivity({
            action: 'system.heartbeat',
            createdAt: time,
          }),
        );
      }
    }

    const start = performance.now();
    const profile = learnCadence(activities);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
    expect(profile.totalActivities).toBe(activities.length);
    expect(profile.windowDays).toBeGreaterThanOrEqual(364);

    // Business hours should have higher rates than off-hours
    const businessHourRate = profile.hourlyRate[12]!; // noon
    const offHourRate = profile.hourlyRate[3]!; // 3 AM
    expect(businessHourRate).toBeGreaterThan(offHourRate);
    expect(offHourRate).toBe(0);

    // Weekdays should have higher rates than weekends
    const mondayRate = profile.dailyRate[1]!;
    const sundayRate = profile.dailyRate[0]!;
    expect(mondayRate).toBeGreaterThan(sundayRate);
    expect(sundayRate).toBe(0);
  });

  it('no duplicate/combinatorial explosion in sequences from 10K activities', () => {
    const patterns: PatternSpec[] = [
      { from: 'a', to: 'b', delayMs: hours(1), probability: 0.25 },
      { from: 'b', to: 'c', delayMs: hours(1), probability: 0.25 },
      { from: 'c', to: 'd', delayMs: hours(1), probability: 0.25 },
      { from: 'd', to: 'e', delayMs: hours(1), probability: 0.25 },
    ];
    const activities = generateActivities(5000, patterns);

    const sequences = learnSequences(activities, {
      minActivitiesForLearning: 50,
      minOccurrences: 3,
      minConfidence: 0.05,
    });

    // With 5 distinct actions, the maximum possible unique (from,to,scoped) triples is bounded.
    // 5 actions * 4 possible targets * 2 scope types = 40 max, but realistically far fewer.
    // The key assertion: no combinatorial explosion from 10K activities.
    expect(sequences.length).toBeLessThanOrEqual(50);

    // Verify no duplicate (fromAction, toAction, entityScoped) triples
    const keys = sequences.map(s => `${s.fromAction}|${s.toAction}|${s.entityScoped}`);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it('mixed entity types — clientId, orderId, both, and neither at scale', () => {
    const activities: ActivityWithRelations[] = [];
    const baseTime = new Date(2026, 0, 1).getTime();

    for (let i = 0; i < 2500; i++) {
      const offset = i * hours(0.5);
      const variant = i % 4;

      const clientId = variant === 0 || variant === 2 ? `client-${i % 50}` : null;
      const orderId = variant === 1 || variant === 2 ? `order-${i % 50}` : null;

      activities.push(
        makeActivity({
          action: 'step.alpha',
          createdAt: new Date(baseTime + offset),
          clientId,
          orderId,
        }),
        makeActivity({
          action: 'step.beta',
          createdAt: new Date(baseTime + offset + hours(0.2)),
          clientId,
          orderId,
        }),
      );
    }

    const sequences = learnSequences(activities, {
      minActivitiesForLearning: 50,
      minOccurrences: 3,
      minConfidence: 0.1,
    });

    expect(sequences.length).toBeGreaterThan(0);

    // Should find both entity-scoped and global sequences
    const entityScoped = sequences.filter(s => s.entityScoped);
    const global = sequences.filter(s => !s.entityScoped);
    // Activities with clientId or orderId should produce entity-scoped sequences
    expect(entityScoped.length).toBeGreaterThan(0);
    // Activities with neither should contribute to global sequences
    expect(global.length).toBeGreaterThan(0);
  });

  it('empty detection window with large history produces empty missing beats', () => {
    const patterns: PatternSpec[] = [
      { from: 'x.start', to: 'x.end', delayMs: hours(1), probability: 1.0 },
    ];
    const historical = generateActivities(5000, patterns);

    // Learn sequences from history
    const sequences = learnSequences(historical, {
      minActivitiesForLearning: 50,
      minOccurrences: 3,
      minConfidence: 0.1,
    });
    expect(sequences.length).toBeGreaterThan(0);

    // Detection window: far in the future — no activities fall in it
    const now = new Date(2028, 0, 1);
    const beats = detectMissingBeats(historical, sequences, now, { detectionWindowDays: 7 });

    // All historical activities are outside the 7-day detection window from 2028
    expect(beats).toEqual([]);
  });

  it('summarizeForAgent with many missing beats stays within reasonable length', () => {
    const now = new Date(2026, 2, 1);

    // Build a pulse with many missing beats directly
    const missingBeats = Array.from({ length: 15 }, (_, i) => ({
      triggerActivity: {
        id: `trigger-${i}`,
        action: `action.trigger_${i}`,
        createdAt: new Date(now.getTime() - days(3)),
        orderId: `order-${i}`,
        clientId: `client-${i}`,
        description: `Trigger activity ${i}`,
        entityLabel: `Client ${i}`,
      },
      expectedAction: `action.expected_${i}`,
      expectedWithinMs: hours(6),
      waitingMs: days(3),
      overdueRatio: days(3) / hours(6),
      sequence: {
        fromAction: `action.trigger_${i}`,
        toAction: `action.expected_${i}`,
        occurrences: 20,
        medianDelayMs: hours(3),
        p90DelayMs: hours(6),
        confidence: 0.8,
        entityScoped: true,
      },
      urgency: i < 5 ? 'alarm' as const : i < 10 ? 'nudge' as const : 'watch' as const,
    }));

    const pulse = {
      computedAt: now,
      activitiesAnalyzed: 10000,
      missingBeats,
      ghostProjections: [],
      cadenceBreaks: [],
      activeIntents: [],
      summary: {
        totalMissingBeats: 15,
        alarmCount: 5,
        nudgeCount: 5,
        watchCount: 5,
        ghostCount: 0,
        entropy: 3.0,
        botStormDetected: false,
        cadenceStatus: 'normal' as const,
      },
    };

    const summary = summarizeForAgent(pulse);

    // Summary should be a string of reasonable length for LLM context
    // 2000 chars is a generous upper bound (~500 tokens)
    expect(summary.length).toBeLessThan(2000);
    expect(summary).toContain('ALARM');
    expect(summary).toContain('NUDGE');
    expect(summary).toContain('10000 activities analyzed');
    // Should list at most 5 urgent details (the urgent filter: alarm + nudge, slice 0..5)
    const detailLines = summary.split('\n').filter(l => l.includes('[ALARM]') || l.includes('[NUDGE]'));
    expect(detailLines.length).toBeLessThanOrEqual(5);
  });

  it('pulse with realistic data distribution', () => {
    const now = new Date(2026, 2, 1);
    const baseTime = new Date(2025, 11, 1).getTime(); // 90 days ago
    const activities: ActivityWithRelations[] = [];

    // Realistic distribution: more order.created than placement.failed, weekday-heavy
    const actionWeights: Array<[string, number]> = [
      ['client.created', 0.10],
      ['client.measurements_updated', 0.08],
      ['client.fit_profile_created', 0.08],
      ['order.created', 0.20],
      ['placement.pending', 0.15],
      ['placement.completed', 0.12],
      ['placement.failed', 0.03],
      ['email.received', 0.10],
      ['email.linked_to_client', 0.07],
      ['automation.triggered', 0.05],
      ['system.heartbeat', 0.02],
    ];

    // Generate ~3000 historical activities over 90 days, biased toward weekdays
    for (let d = 0; d < 90; d++) {
      const dayDate = new Date(baseTime + d * days(1));
      const dayOfWeek = dayDate.getDay();
      const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
      const dailyCount = isWeekday ? 40 : 8; // 5x more on weekdays

      for (let a = 0; a < dailyCount; a++) {
        // Pick action from weighted distribution
        let roll = Math.random();
        let action = 'system.heartbeat';
        for (const [act, weight] of actionWeights) {
          roll -= weight;
          if (roll <= 0) { action = act; break; }
        }

        // Spread across business hours
        const hour = isWeekday
          ? 8 + Math.floor(Math.random() * 10) // 8am-6pm
          : 10 + Math.floor(Math.random() * 6); // 10am-4pm
        const minute = Math.floor(Math.random() * 60);

        activities.push(
          makeActivity({
            action,
            createdAt: new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), hour, minute),
            clientId: action.startsWith('client.') ? `client-${Math.floor(Math.random() * 100)}` : null,
            orderId: action.startsWith('order.') || action.startsWith('placement.') ? `order-${Math.floor(Math.random() * 200)}` : null,
          }),
        );
      }
    }

    // Recent: last 24h activities
    const recent = activities.filter(a => a.createdAt.getTime() > now.getTime() - days(1));

    const start = performance.now();
    const pulse = computePulse(activities, recent, now, {
      minActivitiesForLearning: 50,
      minOccurrences: 3,
      minConfidence: 0.1,
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
    expect(pulse.activitiesAnalyzed).toBeGreaterThan(2000);
    expect(pulse.summary.totalMissingBeats).toBeGreaterThanOrEqual(0);
    expect(pulse.summary.totalMissingBeats).toBeLessThanOrEqual(15); // prioritized cap

    // Cadence should be computed
    expect(['normal', 'quiet', 'unusual', 'silent']).toContain(pulse.summary.cadenceStatus);

    // Missing beat counts should be consistent
    expect(pulse.summary.alarmCount + pulse.summary.nudgeCount + pulse.summary.watchCount)
      .toBe(pulse.summary.totalMissingBeats);
  });

  it('cadence break detection with large history and zero recent activities', () => {
    const activities: ActivityWithRelations[] = [];
    const baseTime = new Date(2025, 6, 1).getTime();

    // 6 months of data, 20 activities per weekday
    for (let d = 0; d < 180; d++) {
      const dayDate = new Date(baseTime + d * days(1));
      const dayOfWeek = dayDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      for (let h = 8; h < 18; h++) {
        activities.push(
          makeActivity({
            action: 'work.done',
            createdAt: new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), h, 30),
          }),
          makeActivity({
            action: 'work.more',
            createdAt: new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), h, 45),
          }),
        );
      }
    }

    const profile = learnCadence(activities);
    expect(profile.totalActivities).toBeGreaterThan(2000);

    // Now: a Wednesday at 2 PM with zero recent activities
    const now = new Date(2026, 2, 4, 14, 0); // Wed Mar 4, 2026 2PM
    const recentEmpty: ActivityWithRelations[] = [];

    const breaks = detectCadenceBreaks(recentEmpty, profile, now, 8);

    // Should detect breaks during business hours where we normally have activity
    expect(breaks.length).toBeGreaterThan(0);
    for (const brk of breaks) {
      expect(brk.actual).toBe(0);
      expect(brk.severity).toBe('silent');
    }
  });

  it('prioritizeMissingBeats deduplicates by trigger activity', () => {
    const now = new Date(2026, 2, 1);
    const triggerTime = new Date(now.getTime() - days(2));

    // Two different sequences flag the SAME trigger activity
    const sharedTriggerId = 'shared-trigger-001';
    const seq1: LearnedSequence = {
      fromAction: 'order.created',
      toAction: 'placement.pending',
      occurrences: 50,
      medianDelayMs: hours(1),
      p90DelayMs: hours(3),
      confidence: 0.9,
      entityScoped: false,
    };
    const seq2: LearnedSequence = {
      fromAction: 'order.created',
      toAction: 'order.notification_sent',
      occurrences: 30,
      medianDelayMs: hours(0.5),
      p90DelayMs: hours(2),
      confidence: 0.5,
      entityScoped: false,
    };

    // Create 50+ missing beats, many sharing trigger IDs
    const beats = Array.from({ length: 60 }, (_, i) => ({
      triggerActivity: {
        id: i < 30 ? `trigger-${i}` : `trigger-${i - 30}`, // first 30 unique, next 30 duplicate IDs
        action: 'order.created',
        createdAt: triggerTime,
        orderId: `order-${i}`,
        clientId: null,
        description: `Order created #${i}`,
        entityLabel: null,
      },
      expectedAction: i % 2 === 0 ? seq1.toAction : seq2.toAction,
      expectedWithinMs: i % 2 === 0 ? seq1.p90DelayMs : seq2.p90DelayMs,
      waitingMs: days(2),
      overdueRatio: i % 2 === 0 ? days(2) / seq1.p90DelayMs : days(2) / seq2.p90DelayMs,
      sequence: i % 2 === 0 ? seq1 : seq2,
      urgency: 'nudge' as const,
    }));

    const prioritized = prioritizeMissingBeats(beats, 15);

    // Should deduplicate: only one beat per trigger activity ID
    const triggerIds = prioritized.map(b => b.triggerActivity.id);
    const uniqueIds = new Set(triggerIds);
    expect(uniqueIds.size).toBe(triggerIds.length);
    expect(prioritized.length).toBeLessThanOrEqual(15);
  });
});
