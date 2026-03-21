// ===========================================
// TESTS: Operational Pulse
// ===========================================

import { describe, it, expect } from 'vitest';
import {
  computePulse,
  summarizeForAgent,
  pulseNeedsAttention,
  getMissingBeatsByEntity,
} from '../intuition/pulse';
import type { ActivityWithRelations } from '../types';
import type { MissingBeat, LearnedSequence } from '../intuition/types';

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

describe('computePulse', () => {
  it('returns clean pulse when insufficient data', () => {
    const pulse = computePulse([], [], new Date());
    expect(pulse.missingBeats).toHaveLength(0);
    expect(pulse.cadenceBreaks).toHaveLength(0);
    expect(pulse.activeIntents).toHaveLength(0);
    expect(pulse.summary.cadenceStatus).toBe('normal');
  });

  it('detects missing beats from learned history', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const baseTime = now.getTime() - days(60);

    // Build history: measurements -> fit profiles within 4h, 10 times
    const historicalActivities: ActivityWithRelations[] = [];
    for (let i = 0; i < 12; i++) {
      const clientId = `hist-client-${i}`;
      historicalActivities.push(
        makeActivity({
          action: 'client.measurements_updated',
          createdAt: new Date(baseTime + i * days(5)),
          clientId,
        }),
        makeActivity({
          action: 'client.fit_profile_created',
          createdAt: new Date(baseTime + i * days(5) + hours(4)),
          clientId,
        }),
      );
    }

    // Add filler for minimum threshold
    for (let i = 0; i < 30; i++) {
      historicalActivities.push(
        makeActivity({
          action: 'filler.action',
          createdAt: new Date(baseTime + i * days(2)),
        }),
      );
    }

    // Now: a measurement happened 5 days ago with no follow-up
    const recentActivities = [
      makeActivity({
        id: 'dropped-ball',
        action: 'client.measurements_updated',
        createdAt: new Date(now.getTime() - days(5)),
        clientId: 'client-new',
        description: 'Measured Client New',
      }),
    ];

    const pulse = computePulse(historicalActivities, recentActivities, now, {
      minActivitiesForLearning: 10,
      minOccurrences: 3,
      minConfidence: 0.1,
    });

    // Should detect the missing fit profile creation
    const fitProfileBeat = pulse.missingBeats.find(
      b => b.expectedAction === 'client.fit_profile_created'
    );
    expect(fitProfileBeat).toBeDefined();
    expect(fitProfileBeat!.triggerActivity.id).toBe('dropped-ball');
  });

  it('populates summary counts correctly', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    // Minimal pulse with no data
    const pulse = computePulse([], [], now);
    expect(pulse.summary.totalMissingBeats).toBe(0);
    expect(pulse.summary.alarmCount).toBe(0);
    expect(pulse.summary.nudgeCount).toBe(0);
    expect(pulse.summary.watchCount).toBe(0);
    expect(pulse.computedAt).toEqual(now);
  });

  it('deduplicates activities across historical and recent', () => {
    const now = new Date(2026, 1, 15, 12, 0);
    const sharedActivity = makeActivity({
      id: 'shared-1',
      action: 'test',
      createdAt: new Date(now.getTime() - hours(1)),
    });

    // Same activity in both arrays
    const pulse = computePulse([sharedActivity], [sharedActivity], now);
    expect(pulse.activitiesAnalyzed).toBe(1); // Not 2
  });
});

describe('summarizeForAgent', () => {
  it('generates readable summary with no issues', () => {
    const pulse = computePulse([], [], new Date());
    const summary = summarizeForAgent(pulse);

    expect(summary).toContain('Operational Pulse');
    expect(summary).toContain('No missing beats');
  });

  it('includes missing beat details', () => {
    const seq: LearnedSequence = {
      fromAction: 'client.measurements_updated',
      toAction: 'client.fit_profile_created',
      occurrences: 10, medianDelayMs: hours(4), p90DelayMs: hours(48),
      confidence: 0.8, entityScoped: true,
    };

    const pulse = computePulse([], [], new Date());
    // Manually inject a missing beat for testing the summary formatter
    pulse.missingBeats = [{
      triggerActivity: {
        id: 't-1',
        action: 'client.measurements_updated',
        createdAt: new Date(),
        orderId: null,
        clientId: 'c-1',
        description: 'Measured John',
        entityLabel: 'John Smith',
      },
      expectedAction: 'client.fit_profile_created',
      expectedWithinMs: hours(48),
      waitingMs: days(5),
      overdueRatio: 2.5,
      sequence: seq,
      urgency: 'nudge',
    }];
    pulse.summary.totalMissingBeats = 1;
    pulse.summary.nudgeCount = 1;

    const summary = summarizeForAgent(pulse);
    expect(summary).toContain('Missing Beats (1)');
    expect(summary).toContain('NUDGE');
    expect(summary).toContain('John Smith');
    expect(summary).toContain('client.fit_profile_created');
  });

  it('includes cadence break info', () => {
    const pulse = computePulse([], [], new Date());
    pulse.cadenceBreaks = [
      { period: '10AM (1h ago)', expected: 5, actual: 0, ratio: 0, severity: 'silent' },
    ];
    pulse.summary.cadenceStatus = 'silent';

    const summary = summarizeForAgent(pulse);
    expect(summary).toContain('SILENT');
    expect(summary).toContain('10AM');
  });

  it('includes active intent info', () => {
    const pulse = computePulse([], [], new Date());
    pulse.activeIntents = [{
      label: 'Client onboarding (2/3 steps)',
      evidenceActions: ['client.created', 'client.measurements_updated'],
      predictedNext: [{ action: 'client.fit_profile_created', confidence: 0.8, typicalDelayMs: hours(4) }],
      entityContext: { clientId: 'c-1' },
    }];

    const summary = summarizeForAgent(pulse);
    expect(summary).toContain('Active Workflows');
    expect(summary).toContain('Client onboarding');
    expect(summary).toContain('fit_profile_created');
  });
});

describe('pulseNeedsAttention', () => {
  it('returns false for clean pulse', () => {
    const pulse = computePulse([], [], new Date());
    expect(pulseNeedsAttention(pulse)).toBe(false);
  });

  it('returns true when alarms present', () => {
    const pulse = computePulse([], [], new Date());
    pulse.summary.alarmCount = 1;
    expect(pulseNeedsAttention(pulse)).toBe(true);
  });

  it('returns true when nudges present', () => {
    const pulse = computePulse([], [], new Date());
    pulse.summary.nudgeCount = 2;
    expect(pulseNeedsAttention(pulse)).toBe(true);
  });

  it('returns true when cadence is unusual', () => {
    const pulse = computePulse([], [], new Date());
    pulse.summary.cadenceStatus = 'unusual';
    expect(pulseNeedsAttention(pulse)).toBe(true);
  });

  it('returns false for watches only', () => {
    const pulse = computePulse([], [], new Date());
    pulse.summary.watchCount = 5;
    expect(pulseNeedsAttention(pulse)).toBe(false);
  });
});

describe('getMissingBeatsByEntity', () => {
  it('groups beats by entity', () => {
    const seq = {} as LearnedSequence;
    const beats: MissingBeat[] = [
      {
        triggerActivity: { id: '1', action: 'a', createdAt: new Date(), orderId: null, clientId: 'c-1', description: 'test', entityLabel: null },
        expectedAction: 'b', expectedWithinMs: 1000, waitingMs: 5000, overdueRatio: 5, sequence: seq, urgency: 'alarm',
      },
      {
        triggerActivity: { id: '2', action: 'a', createdAt: new Date(), orderId: null, clientId: 'c-1', description: 'test', entityLabel: null },
        expectedAction: 'c', expectedWithinMs: 1000, waitingMs: 5000, overdueRatio: 5, sequence: seq, urgency: 'nudge',
      },
      {
        triggerActivity: { id: '3', action: 'a', createdAt: new Date(), orderId: 'o-1', clientId: null, description: 'test', entityLabel: null },
        expectedAction: 'b', expectedWithinMs: 1000, waitingMs: 5000, overdueRatio: 5, sequence: seq, urgency: 'watch',
      },
    ];

    const grouped = getMissingBeatsByEntity(beats);
    expect(grouped.get('c-1')!).toHaveLength(2);
    expect(grouped.get('o-1')!).toHaveLength(1);
  });

  it('puts unscoped beats under "unscoped"', () => {
    const beats: MissingBeat[] = [{
      triggerActivity: { id: '1', action: 'a', createdAt: new Date(), orderId: null, clientId: null, description: 'test', entityLabel: null },
      expectedAction: 'b', expectedWithinMs: 1000, waitingMs: 5000, overdueRatio: 5, sequence: {} as LearnedSequence, urgency: 'alarm',
    }];

    const grouped = getMissingBeatsByEntity(beats);
    expect(grouped.get('unscoped')!).toHaveLength(1);
  });
});
