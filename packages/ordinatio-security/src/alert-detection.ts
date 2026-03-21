// ===========================================
// @ordinatio/security — Alert Detection Engine
// ===========================================
// Pattern matching: thresholds, brute force, account takeover, suspicious patterns.
// ===========================================

import type {
  SecurityDb,
  SecurityCallbacks,
  SecurityAlert,
  SecurityEvent,
  AlertThreshold,
} from './types';
import { SECURITY_EVENT_TYPES } from './types';
import { ALERT_THRESHOLDS } from './alert-thresholds';
import { getSecurityEventConfig } from './event-helpers';
import { countSecurityEventsInWindow } from './event-queries';
import { createAlert, findExistingAlert } from './alert-management';

/**
 * Check all security patterns after a security event is logged.
 * Returns any alerts that were triggered.
 */
export async function checkSecurityPatterns(
  db: SecurityDb,
  event: SecurityEvent,
  callbacks?: SecurityCallbacks
): Promise<SecurityAlert[]> {
  const alerts: SecurityAlert[] = [];

  try {
    const thresholdAlerts = await checkThresholdAlerts(db, event, callbacks);
    alerts.push(...thresholdAlerts);

    const bruteForceAlert = await checkForBruteForce(
      db,
      event.details?.email as string | undefined,
      event.ip,
      callbacks
    );
    if (bruteForceAlert && !alerts.find(a => a.alertType === bruteForceAlert.alertType)) {
      alerts.push(bruteForceAlert);
    }

    if (event.userId) {
      const takeoverAlert = await checkForAccountTakeover(db, event.userId, callbacks);
      if (takeoverAlert) {
        alerts.push(takeoverAlert);
      }
    }

    const patternAlerts = await checkForSuspiciousPatterns(db, [event], callbacks);
    alerts.push(...patternAlerts);

    if (alerts.length > 0) {
      callbacks?.log?.warn('Security alerts generated', {
        eventId: event.id,
        eventType: event.eventType,
        alertCount: alerts.length,
        alertTypes: alerts.map(a => a.alertType),
      });
    }
  } catch (error) {
    callbacks?.log?.error('Failed to check security patterns', {
      eventId: event.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return alerts;
}

async function checkThresholdAlerts(
  db: SecurityDb,
  event: SecurityEvent,
  callbacks?: SecurityCallbacks
): Promise<SecurityAlert[]> {
  const alerts: SecurityAlert[] = [];

  const applicableThresholds = ALERT_THRESHOLDS.filter(
    t => t.eventType === event.eventType
  );

  for (const threshold of applicableThresholds) {
    const count = await countSecurityEventsInWindow(db, {
      eventType: threshold.eventType,
      windowMinutes: threshold.windowMinutes,
      userId: event.userId ?? undefined,
      ip: event.ip ?? undefined,
    });

    if (count >= threshold.threshold) {
      const existingAlert = await findExistingAlert(db, {
        alertType: `threshold_${event.eventType}`,
        affectedUserId: event.userId,
        affectedIp: event.ip,
        windowMinutes: threshold.windowMinutes,
      });

      if (!existingAlert) {
        const alert = await createAlert(db, {
          alertType: `threshold_${event.eventType}`,
          riskLevel: threshold.alertLevel,
          title: getThresholdAlertTitle(threshold, count),
          description: threshold.description,
          triggerEventId: event.id,
          triggerEventType: event.eventType,
          affectedUserId: event.userId ?? undefined,
          affectedIp: event.ip ?? undefined,
          eventCount: count,
          windowMinutes: threshold.windowMinutes,
          metadata: { threshold: threshold.threshold, actualCount: count },
        }, callbacks);

        if (alert) alerts.push(alert);
      }
    }
  }

  return alerts;
}

export async function checkForBruteForce(
  db: SecurityDb,
  email?: string,
  ip?: string | null,
  callbacks?: SecurityCallbacks
): Promise<SecurityAlert | null> {
  if (!email && !ip) return null;

  const windowMinutes = 15;
  const threshold = 5;

  if (ip) {
    const ipCount = await countSecurityEventsInWindow(db, {
      eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
      windowMinutes,
      ip,
    });

    if (ipCount >= threshold) {
      const existingAlert = await findExistingAlert(db, {
        alertType: 'brute_force_ip',
        affectedIp: ip,
        windowMinutes,
      });

      if (!existingAlert) {
        return createAlert(db, {
          alertType: 'brute_force_ip',
          riskLevel: 'HIGH',
          title: `Brute Force Attack Detected from IP ${ip}`,
          description: `${ipCount} failed login attempts from IP ${ip} in the last ${windowMinutes} minutes. This may indicate a brute force attack.`,
          triggerEventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
          affectedIp: ip,
          eventCount: ipCount,
          windowMinutes,
          metadata: { ip, threshold },
        }, callbacks);
      }
    }
  }

  return null;
}

export async function checkForAccountTakeover(
  db: SecurityDb,
  userId: string,
  callbacks?: SecurityCallbacks
): Promise<SecurityAlert | null> {
  const windowHours = 24;
  const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const recentPasswordChange = await db.activityLog.findFirst({
    where: {
      userId,
      action: SECURITY_EVENT_TYPES.AUTH_PASSWORD_CHANGED,
      createdAt: { gte: windowStart },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (recentPasswordChange) {
    const loginsAfterChange = await db.activityLog.findMany({
      where: {
        userId,
        action: SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
        createdAt: { gt: recentPasswordChange.createdAt },
      },
      select: { metadata: true, createdAt: true },
    });

    const newIps = new Set<string>();
    for (const login of loginsAfterChange) {
      const metadata = login.metadata as Record<string, unknown> | null;
      const ip = metadata?.ip as string;
      if (ip) newIps.add(ip);
    }

    if (newIps.size > 0) {
      const previousLogins = await db.activityLog.findMany({
        where: {
          userId,
          action: SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            lt: recentPasswordChange.createdAt,
          },
        },
        select: { metadata: true },
      });

      const knownIps = new Set<string>();
      for (const login of previousLogins) {
        const metadata = login.metadata as Record<string, unknown> | null;
        const ip = metadata?.ip as string;
        if (ip) knownIps.add(ip);
      }

      const trulyNewIps = Array.from(newIps).filter(ip => !knownIps.has(ip));

      if (trulyNewIps.length > 0) {
        const existingAlert = await findExistingAlert(db, {
          alertType: 'account_takeover_new_ip',
          affectedUserId: userId,
          windowMinutes: windowHours * 60,
        });

        if (!existingAlert) {
          return createAlert(db, {
            alertType: 'account_takeover_new_ip',
            riskLevel: 'CRITICAL',
            title: 'Potential Account Takeover Detected',
            description: `Login from new IP address(es) ${trulyNewIps.join(', ')} after password change. This may indicate account takeover.`,
            triggerEventType: SECURITY_EVENT_TYPES.AUTH_PASSWORD_CHANGED,
            affectedUserId: userId,
            eventCount: trulyNewIps.length,
            windowMinutes: windowHours * 60,
            metadata: {
              newIps: trulyNewIps,
              passwordChangedAt: recentPasswordChange.createdAt.toISOString(),
            },
          }, callbacks);
        }
      }
    }
  }

  return null;
}

export async function checkForSuspiciousPatterns(
  db: SecurityDb,
  events: SecurityEvent[],
  callbacks?: SecurityCallbacks
): Promise<SecurityAlert[]> {
  const alerts: SecurityAlert[] = [];

  for (const event of events) {
    if (event.eventType === SECURITY_EVENT_TYPES.PERMISSION_DENIED && event.userId) {
      const recentDenials = await countSecurityEventsInWindow(db, {
        eventType: SECURITY_EVENT_TYPES.PERMISSION_DENIED,
        windowMinutes: 10,
        userId: event.userId,
      });

      if (recentDenials >= 5) {
        const existingAlert = await findExistingAlert(db, {
          alertType: 'privilege_escalation_attempt',
          affectedUserId: event.userId,
          windowMinutes: 10,
        });

        if (!existingAlert) {
          const alert = await createAlert(db, {
            alertType: 'privilege_escalation_attempt',
            riskLevel: 'HIGH',
            title: 'Potential Privilege Escalation Attempt',
            description: `User has ${recentDenials} permission denials in the last 10 minutes. This may indicate an attempt to access unauthorized resources.`,
            triggerEventId: event.id,
            triggerEventType: SECURITY_EVENT_TYPES.PERMISSION_DENIED,
            affectedUserId: event.userId,
            eventCount: recentDenials,
            windowMinutes: 10,
          }, callbacks);

          if (alert) alerts.push(alert);
        }
      }
    }

    if (
      event.eventType === SECURITY_EVENT_TYPES.SENSITIVE_DATA_EXPORTED ||
      event.eventType === SECURITY_EVENT_TYPES.BULK_DATA_OPERATION
    ) {
      const recentExports = await countSecurityEventsInWindow(db, {
        eventType: event.eventType,
        windowMinutes: 60,
        userId: event.userId ?? undefined,
      });

      if (recentExports >= 3) {
        const existingAlert = await findExistingAlert(db, {
          alertType: 'data_exfiltration_risk',
          affectedUserId: event.userId,
          windowMinutes: 60,
        });

        if (!existingAlert) {
          const alert = await createAlert(db, {
            alertType: 'data_exfiltration_risk',
            riskLevel: 'CRITICAL',
            title: 'Potential Data Exfiltration',
            description: `${recentExports} data export operations in the last hour. Review immediately.`,
            triggerEventId: event.id,
            triggerEventType: event.eventType,
            affectedUserId: event.userId ?? undefined,
            eventCount: recentExports,
            windowMinutes: 60,
          }, callbacks);

          if (alert) alerts.push(alert);
        }
      }
    }
  }

  return alerts;
}

function getThresholdAlertTitle(threshold: AlertThreshold, count: number): string {
  const config = getSecurityEventConfig(threshold.eventType);
  return `${config.label}: ${count} events in ${threshold.windowMinutes} minutes`;
}
