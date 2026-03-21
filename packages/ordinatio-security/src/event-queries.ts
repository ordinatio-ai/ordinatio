// ===========================================
// @ordinatio/security — Event Queries & Statistics
// ===========================================

import type {
  SecurityDb,
  SecurityEvent,
  SecurityEventQueryOptions,
  SecurityEventType,
  RiskLevel,
} from './types';
import { SECURITY_EVENT_CONFIG } from './event-config';
import { sanitizeIp } from './event-logger';

export async function getSecurityEvents(
  db: SecurityDb,
  options: SecurityEventQueryOptions = {}
): Promise<{ events: SecurityEvent[]; total: number }> {
  const {
    userId,
    eventTypes,
    minRiskLevel,
    ip,
    startDate,
    endDate,
    tags,
    limit = 50,
    offset = 0,
  } = options;

  const where: Record<string, unknown> = {
    action: { startsWith: 'security.' },
  };

  if (userId) where.userId = userId;

  if (eventTypes && eventTypes.length > 0) {
    where.action = { in: eventTypes };
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) (where.createdAt as Record<string, Date>).gte = startDate;
    if (endDate) (where.createdAt as Record<string, Date>).lte = endDate;
  }

  if (ip) {
    where.metadata = {
      ...((where.metadata as object) || {}),
      path: ['ip'],
      equals: sanitizeIp(ip),
    };
  }

  const [activities, total] = await Promise.all([
    db.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.activityLog.count({ where }),
  ]);

  type MappedEvent = SecurityEvent;

  let events: MappedEvent[] = activities.map((activity) => {
    const metadata = activity.metadata as Record<string, unknown> | null;
    let details: Record<string, unknown> = {};
    if (metadata?.detailsJson && typeof metadata.detailsJson === 'string') {
      try {
        details = JSON.parse(metadata.detailsJson);
      } catch {
        // Ignore parse errors
      }
    }
    return {
      id: activity.id,
      eventType: activity.action as SecurityEventType,
      userId: activity.userId,
      targetUserId: (metadata?.targetUserId as string) ?? null,
      ip: (metadata?.ip as string) ?? null,
      userAgent: (metadata?.userAgent as string) ?? null,
      riskLevel: (metadata?.riskLevel as RiskLevel) ?? 'LOW',
      details,
      resourceId: (metadata?.resourceId as string) ?? null,
      resourceType: (metadata?.resourceType as string) ?? null,
      requestId: (metadata?.requestId as string) ?? null,
      createdAt: activity.createdAt,
    };
  });

  if (minRiskLevel) {
    const riskOrder: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
    const minRiskValue = riskOrder[minRiskLevel];
    events = events.filter((e) => riskOrder[e.riskLevel] >= minRiskValue);
  }

  if (tags && tags.length > 0) {
    events = events.filter((e) => {
      const config = SECURITY_EVENT_CONFIG[e.eventType];
      return tags.some(tag => config?.tags.includes(tag));
    });
  }

  return { events, total };
}

export async function countSecurityEventsInWindow(db: SecurityDb, options: {
  eventType: SecurityEventType;
  windowMinutes: number;
  userId?: string;
  ip?: string;
}): Promise<number> {
  const { eventType, windowMinutes, userId, ip } = options;
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  const where: Record<string, unknown> = {
    action: eventType,
    createdAt: { gte: windowStart },
  };

  if (userId) where.userId = userId;

  if (ip) {
    const activities = await db.activityLog.findMany({
      where,
      select: { metadata: true },
    });
    return activities.filter((a) => {
      const metadata = a.metadata as Record<string, unknown> | null;
      return metadata?.ip === sanitizeIp(ip);
    }).length;
  }

  return db.activityLog.count({ where });
}

export async function getUserSecurityHistory(
  db: SecurityDb,
  userId: string,
  limit = 20
): Promise<SecurityEvent[]> {
  const result = await getSecurityEvents(db, { userId, limit });
  return result.events;
}

export async function getSecurityEventsByIp(
  db: SecurityDb,
  ip: string,
  limit = 50
): Promise<SecurityEvent[]> {
  const result = await getSecurityEvents(db, { ip, limit });
  return result.events;
}

export async function getRecentHighRiskEvents(db: SecurityDb, hours = 24): Promise<SecurityEvent[]> {
  const result = await getSecurityEvents(db, {
    minRiskLevel: 'HIGH',
    startDate: new Date(Date.now() - hours * 60 * 60 * 1000),
    limit: 100,
  });
  return result.events;
}

export async function getSecurityEventStats(db: SecurityDb, hours = 24): Promise<{
  total: number;
  byRiskLevel: Record<RiskLevel, number>;
  byEventType: Record<string, number>;
  uniqueIps: number;
  uniqueUsers: number;
}> {
  const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);

  const activities = await db.activityLog.findMany({
    where: {
      action: { startsWith: 'security.' },
      createdAt: { gte: startDate },
    },
    select: { action: true, userId: true, metadata: true },
  });

  const uniqueIps = new Set<string>();
  const uniqueUsers = new Set<string>();
  const byRiskLevel: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  const byEventType: Record<string, number> = {};

  for (const activity of activities) {
    const metadata = activity.metadata as Record<string, unknown> | null;
    const riskLevel = (metadata?.riskLevel as RiskLevel) ?? 'LOW';
    const ip = metadata?.ip as string | undefined;
    byRiskLevel[riskLevel]++;
    byEventType[activity.action] = (byEventType[activity.action] ?? 0) + 1;
    if (ip) uniqueIps.add(ip);
    if (activity.userId) uniqueUsers.add(activity.userId);
  }

  return {
    total: activities.length,
    byRiskLevel,
    byEventType,
    uniqueIps: uniqueIps.size,
    uniqueUsers: uniqueUsers.size,
  };
}
