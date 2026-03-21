// ===========================================
// @ordinatio/security — Alert Management & Persistence
// ===========================================
// Alert creation, querying, acknowledgement, resolution, statistics.
// ===========================================

import type {
  SecurityDb,
  SecurityCallbacks,
  SecurityAlert,
  AlertStatus,
  CreateAlertInput,
  RiskLevel,
  SecurityEventType,
  ActivityLogRecord,
} from './types';
import { buildAlertRecovery } from './alert-recovery';

// ===========================================
// ALERT CREATION & DEDUPLICATION
// ===========================================

export async function createAlert(
  db: SecurityDb,
  input: CreateAlertInput,
  callbacks?: SecurityCallbacks
): Promise<SecurityAlert | null> {
  try {
    // Build recovery object for the alert
    const recovery = buildAlertRecovery({ alertType: input.alertType, riskLevel: input.riskLevel });

    const activity = await db.activityLog.create({
      data: {
        action: `alert.${input.alertType}`,
        description: input.title,
        severity: input.riskLevel === 'CRITICAL' ? 'CRITICAL' :
                  input.riskLevel === 'HIGH' ? 'ERROR' :
                  input.riskLevel === 'MEDIUM' ? 'WARNING' : 'INFO',
        requiresResolution: true,
        system: true,
        userId: input.affectedUserId ?? null,
        metadata: {
          isSecurityAlert: true,
          alertType: input.alertType,
          riskLevel: input.riskLevel,
          status: 'ACTIVE' as AlertStatus,
          description: input.description,
          triggerEventId: input.triggerEventId ?? null,
          triggerEventType: input.triggerEventType,
          affectedIp: input.affectedIp ?? null,
          eventCount: input.eventCount,
          windowMinutes: input.windowMinutes,
          acknowledgedBy: null,
          acknowledgedAt: null,
          resolvedBy: null,
          resolvedAt: null,
          resolutionNotes: null,
          recovery,
          ...input.metadata,
        },
      },
    });

    callbacks?.log?.warn('Security alert created', {
      alertId: activity.id,
      alertType: input.alertType,
      riskLevel: input.riskLevel,
      title: input.title,
    });

    const alert = activityToAlert(activity);
    if (alert) {
      await callbacks?.onAlertCreated?.(alert);
    }
    return alert;
  } catch (error) {
    callbacks?.log?.error('Failed to create security alert', {
      alertType: input.alertType,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function findExistingAlert(db: SecurityDb, criteria: {
  alertType: string;
  affectedUserId?: string | null;
  affectedIp?: string | null;
  windowMinutes: number;
}): Promise<SecurityAlert | null> {
  const windowStart = new Date(Date.now() - criteria.windowMinutes * 60 * 1000);

  const activities = await db.activityLog.findMany({
    where: {
      action: `alert.${criteria.alertType}`,
      createdAt: { gte: windowStart },
      resolvedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  for (const activity of activities) {
    const metadata = activity.metadata as Record<string, unknown> | null;
    if (!metadata?.isSecurityAlert) continue;

    const matchesUser = !criteria.affectedUserId ||
      activity.userId === criteria.affectedUserId;
    const matchesIp = !criteria.affectedIp ||
      metadata.affectedIp === criteria.affectedIp;

    if (matchesUser && matchesIp) {
      return activityToAlert(activity);
    }
  }

  return null;
}

// ===========================================
// ALERT QUERIES
// ===========================================

export async function getActiveAlerts(db: SecurityDb): Promise<SecurityAlert[]> {
  const activities = await db.activityLog.findMany({
    where: {
      action: { startsWith: 'alert.' },
      resolvedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return activities
    .map(activityToAlert)
    .filter((a): a is SecurityAlert => a !== null);
}

export async function getAlerts(db: SecurityDb, options: {
  status?: AlertStatus;
  riskLevel?: RiskLevel;
  alertType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}): Promise<{ alerts: SecurityAlert[]; total: number }> {
  const {
    status,
    riskLevel,
    alertType,
    startDate,
    endDate,
    limit = 50,
    offset = 0,
  } = options;

  const where: Record<string, unknown> = {
    action: alertType ? `alert.${alertType}` : { startsWith: 'alert.' },
  };

  if (status === 'ACTIVE') {
    where.resolvedAt = null;
  } else if (status === 'RESOLVED' || status === 'FALSE_POSITIVE') {
    where.resolvedAt = { not: null };
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) (where.createdAt as Record<string, Date>).gte = startDate;
    if (endDate) (where.createdAt as Record<string, Date>).lte = endDate;
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

  let alerts = activities
    .map(activityToAlert)
    .filter((a): a is SecurityAlert => a !== null);

  if (riskLevel) {
    const riskOrder: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
    const minRisk = riskOrder[riskLevel];
    alerts = alerts.filter((a) => riskOrder[a.riskLevel] >= minRisk);
  }

  return { alerts, total };
}

// ===========================================
// ALERT LIFECYCLE
// ===========================================

export async function acknowledgeAlert(
  db: SecurityDb,
  alertId: string,
  acknowledgedBy: string,
  callbacks?: SecurityCallbacks
): Promise<SecurityAlert | null> {
  const activity = await db.activityLog.findUnique({ where: { id: alertId } });
  if (!activity) return null;

  const metadata = activity.metadata as Record<string, unknown> | null;
  if (!metadata?.isSecurityAlert) return null;

  const updated = await db.activityLog.update({
    where: { id: alertId },
    data: {
      metadata: {
        ...metadata,
        status: 'ACKNOWLEDGED' as AlertStatus,
        acknowledgedBy,
        acknowledgedAt: new Date().toISOString(),
      },
    },
  });

  callbacks?.log?.info('Security alert acknowledged', { alertId, acknowledgedBy });

  return activityToAlert(updated);
}

export async function resolveAlert(
  db: SecurityDb,
  alertId: string,
  resolvedBy: string,
  resolutionNotes?: string,
  isFalsePositive = false,
  callbacks?: SecurityCallbacks
): Promise<SecurityAlert | null> {
  const activity = await db.activityLog.findUnique({ where: { id: alertId } });
  if (!activity) return null;

  const metadata = activity.metadata as Record<string, unknown> | null;
  if (!metadata?.isSecurityAlert) return null;

  const updated = await db.activityLog.update({
    where: { id: alertId },
    data: {
      resolvedAt: new Date(),
      resolvedBy,
      metadata: {
        ...metadata,
        status: isFalsePositive ? 'FALSE_POSITIVE' : 'RESOLVED' as AlertStatus,
        resolvedBy,
        resolvedAt: new Date().toISOString(),
        resolutionNotes: resolutionNotes ?? null,
      },
    },
  });

  callbacks?.log?.info('Security alert resolved', { alertId, resolvedBy, isFalsePositive });

  const alert = activityToAlert(updated);
  if (alert) {
    await callbacks?.onAlertResolved?.(alert);
  }
  return alert;
}

// ===========================================
// ALERT STATISTICS
// ===========================================

export async function getAlertStats(db: SecurityDb): Promise<{
  active: number;
  acknowledged: number;
  resolvedToday: number;
  byRiskLevel: Record<RiskLevel, number>;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [activeAlerts, allAlerts] = await Promise.all([
    db.activityLog.findMany({
      where: { action: { startsWith: 'alert.' }, resolvedAt: null },
      select: { metadata: true },
    }),
    db.activityLog.findMany({
      where: { action: { startsWith: 'alert.' }, createdAt: { gte: today } },
      select: { metadata: true, resolvedAt: true },
    }),
  ]);

  const stats = {
    active: 0,
    acknowledged: 0,
    resolvedToday: 0,
    byRiskLevel: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 } as Record<RiskLevel, number>,
  };

  for (const alert of activeAlerts) {
    const metadata = alert.metadata as Record<string, unknown> | null;
    if (!metadata?.isSecurityAlert) continue;

    const status = metadata.status as AlertStatus;
    const riskLevel = (metadata.riskLevel as RiskLevel) ?? 'LOW';

    if (status === 'ACTIVE') stats.active++;
    else if (status === 'ACKNOWLEDGED') stats.acknowledged++;

    stats.byRiskLevel[riskLevel]++;
  }

  stats.resolvedToday = allAlerts.filter((a) => a.resolvedAt !== null).length;

  return stats;
}

// ===========================================
// HELPER
// ===========================================

export function activityToAlert(activity: ActivityLogRecord): SecurityAlert | null {
  const metadata = activity.metadata as Record<string, unknown> | null;

  if (!metadata?.isSecurityAlert) return null;

  return {
    id: activity.id,
    alertType: (metadata.alertType as string) ?? activity.action.replace('alert.', ''),
    riskLevel: (metadata.riskLevel as RiskLevel) ?? 'LOW',
    status: (metadata.status as AlertStatus) ?? 'ACTIVE',
    title: activity.description,
    description: (metadata.description as string) ?? '',
    triggerEventId: (metadata.triggerEventId as string) ?? null,
    triggerEventType: metadata.triggerEventType as SecurityEventType,
    affectedUserId: activity.userId,
    affectedIp: (metadata.affectedIp as string) ?? null,
    eventCount: (metadata.eventCount as number) ?? 0,
    windowMinutes: (metadata.windowMinutes as number) ?? 0,
    metadata,
    acknowledgedBy: (metadata.acknowledgedBy as string) ?? null,
    acknowledgedAt: metadata.acknowledgedAt
      ? new Date(metadata.acknowledgedAt as string)
      : null,
    resolvedBy: activity.resolvedBy,
    resolvedAt: activity.resolvedAt,
    resolutionNotes: (metadata.resolutionNotes as string) ?? null,
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt ?? activity.createdAt,
  };
}
