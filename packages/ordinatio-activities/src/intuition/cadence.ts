// ===========================================
// OPERATIONAL INTUITION — Cadence Detection
// ===========================================
// Learns the "rhythm" of the system: how many
// activities normally happen per hour and per day.
// Detects when reality deviates from the norm.
//
// A human ops manager notices when "it's weirdly
// quiet" — this gives the agent the same sense.
// ===========================================

import type { ActivityWithRelations } from '../types';
import type { CadenceProfile, CadenceBreak } from './types';

/**
 * Learn the operational cadence from historical activities.
 *
 * Computes average activity rates per hour-of-day (0-23)
 * and per day-of-week (0=Sun through 6=Sat).
 */
export function learnCadence(
  activities: ActivityWithRelations[],
): CadenceProfile {
  if (activities.length === 0) {
    return {
      hourlyRate: new Array(24).fill(0),
      dailyRate: new Array(7).fill(0),
      totalActivities: 0,
      windowDays: 0,
    };
  }

  // Find the time span
  const timestamps = activities.map(a => a.createdAt.getTime());
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const windowDays = Math.max(1, (maxTime - minTime) / (24 * 60 * 60 * 1000));

  // Count activities per hour and per day
  const hourlyCounts = new Array(24).fill(0) as number[];
  const dailyCounts = new Array(7).fill(0) as number[];

  for (const activity of activities) {
    const d = activity.createdAt;
    hourlyCounts[d.getHours()]++;
    dailyCounts[d.getDay()]++;
  }

  // Normalize: how many weeks have we seen?
  const windowWeeks = Math.max(1, windowDays / 7);

  // HourlyRate = average per day for that hour
  // We calculate: total_in_hour / windowDays
  const hourlyRate = hourlyCounts.map(c => c / windowDays);

  // DailyRate = average per occurrence of that weekday
  // Each weekday appears ~windowWeeks times
  const dailyRate = dailyCounts.map(c => c / windowWeeks);

  return {
    hourlyRate,
    dailyRate,
    totalActivities: activities.length,
    windowDays: Math.round(windowDays),
  };
}

/**
 * Detect cadence breaks: periods where activity is
 * significantly below the learned norm.
 *
 * @param recentActivities - Activities from the last 24 hours
 * @param profile - Learned cadence profile
 * @param now - Current time (injectable for testing)
 * @param lookbackHours - How many hours back to check (default: 8)
 */
export function detectCadenceBreaks(
  recentActivities: ActivityWithRelations[],
  profile: CadenceProfile,
  now: Date = new Date(),
  lookbackHours = 8,
): CadenceBreak[] {
  if (profile.totalActivities === 0) return [];

  const breaks: CadenceBreak[] = [];
  const nowMs = now.getTime();

  // Check each hour in the lookback window
  for (let hoursAgo = 0; hoursAgo < lookbackHours; hoursAgo++) {
    const checkTime = new Date(nowMs - hoursAgo * 60 * 60 * 1000);
    const hour = checkTime.getHours();
    const expectedRate = profile.hourlyRate[hour] ?? 0;

    // Skip hours where we don't normally expect activity (< 0.5 per day)
    if (expectedRate < 0.5) continue;

    // Count actual activities in this hour
    const hourStart = new Date(checkTime);
    hourStart.setMinutes(0, 0, 0);
    const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

    const actual = recentActivities.filter(a => {
      const t = a.createdAt.getTime();
      return t >= hourStart.getTime() && t < hourEnd.getTime();
    }).length;

    const ratio = expectedRate > 0 ? actual / expectedRate : 1;

    // Only flag if significantly below expected
    if (ratio < 0.3 && expectedRate >= 1) {
      breaks.push({
        period: `${formatHour(hour)} (${hoursAgo === 0 ? 'this hour' : `${hoursAgo}h ago`})`,
        expected: Math.round(expectedRate * 10) / 10,
        actual,
        ratio: Math.round(ratio * 100) / 100,
        severity: classifyCadenceSeverity(ratio),
      });
    }
  }

  // Also check the day-of-week level
  const dayOfWeek = now.getDay();
  const expectedDaily = profile.dailyRate[dayOfWeek] ?? 0;

  if (expectedDaily >= 5) {
    // Count today's activities so far
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const hoursElapsed = Math.max(1, now.getHours() + 1);
    const expectedByNow = expectedDaily * (hoursElapsed / 24);

    const actualToday = recentActivities.filter(a =>
      a.createdAt.getTime() >= todayStart.getTime()
    ).length;

    const ratio = expectedByNow > 0 ? actualToday / expectedByNow : 1;

    if (ratio < 0.3 && expectedByNow >= 3) {
      breaks.push({
        period: `${dayName(dayOfWeek)} (today, ${hoursElapsed}h in)`,
        expected: Math.round(expectedByNow * 10) / 10,
        actual: actualToday,
        ratio: Math.round(ratio * 100) / 100,
        severity: classifyCadenceSeverity(ratio),
      });
    }
  }

  return breaks.sort((a, b) => a.ratio - b.ratio);
}

/**
 * Get the overall cadence status from breaks.
 */
export function overallCadenceStatus(
  breaks: CadenceBreak[],
): 'normal' | 'quiet' | 'unusual' | 'silent' {
  if (breaks.length === 0) return 'normal';
  const worstSeverity = breaks[0]!.severity;
  if (worstSeverity === 'silent') return 'silent';
  if (worstSeverity === 'unusual') return 'unusual';
  return 'quiet';
}

// ---- Helpers ----

function classifyCadenceSeverity(ratio: number): 'quiet' | 'unusual' | 'silent' {
  if (ratio === 0) return 'silent';
  if (ratio < 0.1) return 'unusual';
  return 'quiet';
}

function formatHour(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  return `${h}${period}`;
}

function dayName(day: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day] ?? 'Unknown';
}
