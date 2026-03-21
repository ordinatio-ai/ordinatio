// ===========================================
// TESTS: Cadence Detection
// ===========================================

import { describe, it, expect } from 'vitest';
import { learnCadence, detectCadenceBreaks, overallCadenceStatus } from '../intuition/cadence';
import type { ActivityWithRelations } from '../types';
import type { CadenceBreak } from '../intuition/types';

function makeActivity(
  overrides: Partial<ActivityWithRelations> & { createdAt: Date },
): ActivityWithRelations {
  return {
    id: `act-${Math.random().toString(36).slice(2, 8)}`,
    action: 'test.action',
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

describe('learnCadence', () => {
  it('returns zero profile for empty activities', () => {
    const profile = learnCadence([]);
    expect(profile.totalActivities).toBe(0);
    expect(profile.windowDays).toBe(0);
    expect(profile.hourlyRate.every(r => r === 0)).toBe(true);
    expect(profile.dailyRate.every(r => r === 0)).toBe(true);
  });

  it('computes hourly rates correctly', () => {
    // 30 days of activities, always at 10 AM (one per day)
    const activities = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(2026, 0, i + 1, 10, 0, 0);
      return makeActivity({ createdAt: d });
    });

    const profile = learnCadence(activities);
    expect(profile.totalActivities).toBe(30);

    // Hour 10 should have the highest rate (30 activities / 30 days = 1.0)
    expect(profile.hourlyRate[10]).toBeCloseTo(1.0, 0);
    // Other hours should be 0
    expect(profile.hourlyRate[9]).toBe(0);
    expect(profile.hourlyRate[11]).toBe(0);
  });

  it('computes daily rates correctly', () => {
    // Jan 5 2026 is a Monday. Generate activities on Mon/Tue/Wed only.
    const activities: ActivityWithRelations[] = [];
    for (let week = 0; week < 4; week++) {
      for (let dayOffset = 0; dayOffset < 3; dayOffset++) { // Mon, Tue, Wed
        const d = new Date(2026, 0, 5 + week * 7 + dayOffset, 12, 0);
        activities.push(makeActivity({ createdAt: d }));
      }
    }

    const profile = learnCadence(activities);
    // Monday (1) should have activity, Sunday (0) and Saturday (6) should have zero
    expect(profile.dailyRate[1]).toBeGreaterThan(0); // Monday
    expect(profile.dailyRate[0]).toBe(0); // Sunday
    expect(profile.dailyRate[6]).toBe(0); // Saturday
  });

  it('computes windowDays correctly', () => {
    const activities = [
      makeActivity({ createdAt: new Date(2026, 0, 1) }),
      makeActivity({ createdAt: new Date(2026, 0, 31) }),
    ];

    const profile = learnCadence(activities);
    expect(profile.windowDays).toBe(30);
  });
});

describe('detectCadenceBreaks', () => {
  it('detects quiet hours', () => {
    // Profile says we normally have 5 activities per day at 10 AM
    const profile = {
      hourlyRate: new Array(24).fill(0).map((_, i) => i === 10 ? 5.0 : 0.1) as number[],
      dailyRate: new Array(7).fill(10) as number[],
      totalActivities: 1000,
      windowDays: 90,
    };

    // But today at 10 AM we had zero activities
    const now = new Date(2026, 1, 15, 11, 0); // 11 AM — checking the 10 AM hour
    const recentActivities: ActivityWithRelations[] = []; // Nothing!

    const breaks = detectCadenceBreaks(recentActivities, profile, now, 2);

    const tenAmBreak = breaks.find(b => b.period.includes('10AM'));
    expect(tenAmBreak).toBeDefined();
    expect(tenAmBreak!.expected).toBe(5);
    expect(tenAmBreak!.actual).toBe(0);
    expect(tenAmBreak!.severity).toBe('silent');
  });

  it('does not flag hours with normally low activity', () => {
    const profile = {
      hourlyRate: new Array(24).fill(0.1) as number[],  // Very low activity all day
      dailyRate: new Array(7).fill(2) as number[],
      totalActivities: 100,
      windowDays: 90,
    };

    const now = new Date(2026, 1, 15, 14, 0);
    const breaks = detectCadenceBreaks([], profile, now, 4);

    // Should not flag because expected rate < 0.5 and < 1
    expect(breaks.length).toBe(0);
  });

  it('detects daily cadence breaks', () => {
    const profile = {
      hourlyRate: new Array(24).fill(0.5) as number[],
      dailyRate: new Array(7).fill(20) as number[], // 20 per day normally
      totalActivities: 2000,
      windowDays: 90,
    };

    // Monday at 6 PM — 18 hours in, but only 1 activity
    const now = new Date(2026, 1, 16, 18, 0); // Monday
    const todayStart = new Date(2026, 1, 16, 0, 0);
    const recentActivities = [
      makeActivity({ createdAt: new Date(todayStart.getTime() + 3600000) }),
    ];

    const breaks = detectCadenceBreaks(recentActivities, profile, now, 4);
    const dayBreak = breaks.find(b => b.period.includes('today'));
    expect(dayBreak).toBeDefined();
    expect(dayBreak!.actual).toBe(1);
  });

  it('returns empty for normal activity', () => {
    const profile = {
      hourlyRate: new Array(24).fill(2) as number[],
      dailyRate: new Array(7).fill(20) as number[],
      totalActivities: 1000,
      windowDays: 90,
    };

    const now = new Date(2026, 1, 15, 14, 0);

    // Generate plenty of recent activities
    const recentActivities = Array.from({ length: 40 }, (_, i) =>
      makeActivity({ createdAt: new Date(now.getTime() - i * 30 * 60 * 1000) })
    );

    const breaks = detectCadenceBreaks(recentActivities, profile, now, 4);
    // With plenty of activity, should have few or no breaks
    const significantBreaks = breaks.filter(b => b.severity !== 'quiet');
    expect(significantBreaks.length).toBe(0);
  });
});

describe('overallCadenceStatus', () => {
  it('returns normal when no breaks', () => {
    expect(overallCadenceStatus([])).toBe('normal');
  });

  it('returns the worst severity', () => {
    const breaks: CadenceBreak[] = [
      { period: '10AM', expected: 5, actual: 0, ratio: 0, severity: 'silent' },
      { period: '11AM', expected: 3, actual: 1, ratio: 0.33, severity: 'quiet' },
    ];
    // Sorted by ratio, so silent comes first
    expect(overallCadenceStatus(breaks)).toBe('silent');
  });

  it('returns quiet for minor breaks', () => {
    const breaks: CadenceBreak[] = [
      { period: '2PM', expected: 4, actual: 1, ratio: 0.25, severity: 'quiet' },
    ];
    expect(overallCadenceStatus(breaks)).toBe('quiet');
  });
});
