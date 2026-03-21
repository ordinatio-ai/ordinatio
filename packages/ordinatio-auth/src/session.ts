// ===========================================
// @ordinatio/auth — Session Security & Suspicious Activity Detection
// ===========================================
// Session validity, timeout management, suspicious activity detection.
// In-memory storage (replace with Redis in production).
// ===========================================

import type { AuthCallbacks, Session, SessionValidityResult, SuspiciousActivityResult, SuspiciousFlag } from './types';
import { buildManifest } from './manifest';
import { InMemoryStore } from './store';
import type { SecurityStore } from './store';

// ===========================================
// CONFIGURATION CONSTANTS
// ===========================================

export const AUTH_SESSION_CONFIG = {
  /** Session timeout after inactivity (30 minutes) */
  inactivityTimeoutMs: 30 * 60 * 1000,
  /** Absolute session lifetime (24 hours) */
  absoluteLifetimeMs: 24 * 60 * 60 * 1000,
  /** Warning before timeout (5 minutes) */
  timeoutWarningMs: 5 * 60 * 1000,
  /** Refresh session activity threshold (5 minutes) */
  activityRefreshThresholdMs: 5 * 60 * 1000,
  /** Maximum entries in the session activity store before LRU eviction */
  maxStoreEntries: 50_000,
} as const;

export const AUTH_SUSPICIOUS_CONFIG = {
  /** Maximum IPs per session before flagging */
  maxIpsPerSession: 2,
  /** Impossible travel speed threshold (km/h) */
  impossibleTravelSpeedKmh: 1000,
  /** Minimum time between location checks (5 minutes) */
  locationCheckIntervalMs: 5 * 60 * 1000,
  /** Unusual hours definition (local time) */
  unusualHoursStart: 2, // 2 AM
  unusualHoursEnd: 5,   // 5 AM
  /** Rapid request threshold (requests per minute) */
  rapidRequestThreshold: 60,
} as const;

// ===========================================
// PLUGGABLE STORES
// ===========================================

interface SessionActivityRecord {
  ips: Set<string>;
  locations: Array<{ ip: string; country?: string; time: Date }>;
  requestTimestamps: number[];
}

let sessionActivityStore: SecurityStore<SessionActivityRecord> = new InMemoryStore<SessionActivityRecord>({
  maxEntries: AUTH_SESSION_CONFIG.maxStoreEntries,
});

/**
 * Inject a custom store for session activity tracking.
 * Use this to replace the default InMemoryStore with Redis, etc.
 */
export function setSessionStore(store: SecurityStore<SessionActivityRecord>): void {
  sessionActivityStore = store;
}

let sessionCleanupInterval: NodeJS.Timeout | null = null;

function startSessionCleanup() {
  if (sessionCleanupInterval) return;
  sessionCleanupInterval = setInterval(() => {
    const now = Date.now();
    const maxAge = AUTH_SESSION_CONFIG.absoluteLifetimeMs;

    const toDelete: string[] = [];
    for (const [sessionId, activity] of sessionActivityStore.entries()) {
      // Remove old request timestamps
      activity.requestTimestamps = activity.requestTimestamps.filter(
        t => now - t < 60 * 1000
      );

      // Remove sessions older than max lifetime
      if (activity.locations.length > 0) {
        const oldest = Math.min(...activity.locations.map(l => l.time.getTime()));
        if (now - oldest > maxAge) {
          toDelete.push(sessionId);
        }
      }
    }

    for (const id of toDelete) {
      sessionActivityStore.delete(id);
    }
  }, 10 * 60 * 1000); // Every 10 minutes
  sessionCleanupInterval.unref?.();
}

// ===========================================
// SESSION SECURITY
// ===========================================

/**
 * Check if a session is still valid based on security policies.
 * Validates inactivity timeout and absolute lifetime.
 */
export function checkSessionValidity(session: Session, callbacks?: AuthCallbacks): SessionValidityResult {
  const config = AUTH_SESSION_CONFIG;
  const now = Date.now();

  // Check absolute lifetime
  const sessionAge = now - session.createdAt.getTime();
  if (sessionAge > config.absoluteLifetimeMs) {
    callbacks?.log?.('info', 'Session expired (absolute lifetime)', {
      sessionId: session.id,
      userId: session.userId,
      age: Math.round(sessionAge / 1000 / 60),
    });

    return {
      valid: false,
      reason: 'SESSION_EXPIRED',
      manifest: buildManifest('REQUIRE_REAUTHENTICATION', 1.0),
    };
  }

  // Check inactivity timeout
  const inactiveTime = now - session.lastActiveAt.getTime();
  if (inactiveTime > config.inactivityTimeoutMs) {
    callbacks?.log?.('info', 'Session expired (inactivity)', {
      sessionId: session.id,
      userId: session.userId,
      inactiveMinutes: Math.round(inactiveTime / 1000 / 60),
    });

    return {
      valid: false,
      reason: 'SESSION_INACTIVE',
      manifest: buildManifest('REQUIRE_REAUTHENTICATION', 1.0),
    };
  }

  // Calculate remaining time
  const absoluteRemaining = config.absoluteLifetimeMs - sessionAge;
  const inactivityRemaining = config.inactivityTimeoutMs - inactiveTime;
  const remainingTime = Math.min(absoluteRemaining, inactivityRemaining);

  const shouldRefresh = inactiveTime > config.activityRefreshThresholdMs;

  if (remainingTime < config.timeoutWarningMs) {
    return {
      valid: true,
      shouldRefresh,
      remainingTime,
      manifest: buildManifest('ROTATE_TOKEN', 0.9, false, { remainingMs: remainingTime }),
    };
  }

  return {
    valid: true,
    shouldRefresh,
    remainingTime,
    manifest: buildManifest('ALLOW', 1.0),
  };
}

/**
 * Invalidate all sessions for a user (e.g., after password change).
 */
export function invalidateUserSessions(userId: string, reason: string, callbacks?: AuthCallbacks): void {
  callbacks?.log?.('info', 'Invalidating user sessions', {
    userId,
    reason,
  });

  sessionActivityStore.clear();
}

/**
 * Detect suspicious activity for a session.
 * Checks: multiple IPs, impossible travel, unusual times, rapid requests.
 */
export function detectSuspiciousActivity(
  session: Session,
  ip: string,
  options?: {
    country?: string;
    userAgent?: string;
    timezone?: string;
  },
  callbacks?: AuthCallbacks,
): SuspiciousActivityResult {
  startSessionCleanup();

  const config = AUTH_SUSPICIOUS_CONFIG;
  const flags: SuspiciousFlag[] = [];
  const now = new Date();

  // Get or create session activity record
  let activity = sessionActivityStore.get(session.id);
  if (!activity) {
    activity = {
      ips: new Set(),
      locations: [],
      requestTimestamps: [],
    };
    sessionActivityStore.set(session.id, activity);
  }

  // Record this request
  activity.ips.add(ip);
  activity.locations.push({
    ip,
    country: options?.country,
    time: now,
  });
  activity.requestTimestamps.push(now.getTime());

  // Keep only recent timestamps (last minute)
  const oneMinuteAgo = now.getTime() - 60 * 1000;
  activity.requestTimestamps = activity.requestTimestamps.filter(
    t => t > oneMinuteAgo
  );

  // CHECK 1: Multiple IPs
  if (activity.ips.size > config.maxIpsPerSession) {
    flags.push({
      type: 'MULTIPLE_IPS',
      description: `Session accessed from ${activity.ips.size} different IP addresses`,
      severity: activity.ips.size > 3 ? 'high' : 'medium',
      metadata: {
        ips: Array.from(activity.ips),
        threshold: config.maxIpsPerSession,
      },
    });
  }

  // CHECK 2: Impossible travel
  if (options?.country && activity.locations.length >= 2) {
    const recentLocations = activity.locations
      .filter(l => l.country && now.getTime() - l.time.getTime() < config.locationCheckIntervalMs)
      .slice(-5);

    for (let i = 1; i < recentLocations.length; i++) {
      const prev = recentLocations[i - 1];
      const curr = recentLocations[i];

      if (prev.country && curr.country && prev.country !== curr.country) {
        const timeDiffMs = curr.time.getTime() - prev.time.getTime();
        const timeDiffHours = timeDiffMs / (1000 * 60 * 60);

        if (timeDiffHours < 1) {
          flags.push({
            type: 'IMPOSSIBLE_TRAVEL',
            description: `Location changed from ${prev.country} to ${curr.country} in ${Math.round(timeDiffMs / 60000)} minutes`,
            severity: 'high',
            metadata: {
              fromCountry: prev.country,
              toCountry: curr.country,
              timeDiffMinutes: Math.round(timeDiffMs / 60000),
            },
          });
        }
      }
    }
  }

  // CHECK 3: Unusual time (use UTC for consistency)
  const hour = now.getUTCHours();
  if (hour >= config.unusualHoursStart && hour < config.unusualHoursEnd) {
    flags.push({
      type: 'UNUSUAL_TIME',
      description: `Login at unusual hour (${hour}:00 local time)`,
      severity: 'low',
      metadata: {
        hour,
        unusualRange: `${config.unusualHoursStart}:00 - ${config.unusualHoursEnd}:00`,
      },
    });
  }

  // CHECK 4: Rapid requests
  if (activity.requestTimestamps.length > config.rapidRequestThreshold) {
    flags.push({
      type: 'RAPID_REQUESTS',
      description: `${activity.requestTimestamps.length} requests in the last minute`,
      severity: activity.requestTimestamps.length > config.rapidRequestThreshold * 2 ? 'high' : 'medium',
      metadata: {
        requestCount: activity.requestTimestamps.length,
        threshold: config.rapidRequestThreshold,
      },
    });
  }

  // CHECK 5: Known bad patterns in IP (simplified)
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip === '127.0.0.1') {
    if (process.env.NODE_ENV === 'production') {
      flags.push({
        type: 'KNOWN_BAD_IP',
        description: 'Request from internal/localhost IP in production',
        severity: 'medium',
        metadata: { ip },
      });
    }
  }

  // Determine risk level and recommendation
  const highFlags = flags.filter(f => f.severity === 'high').length;
  const mediumFlags = flags.filter(f => f.severity === 'medium').length;

  let riskLevel: SuspiciousActivityResult['riskLevel'];
  let recommendation: SuspiciousActivityResult['recommendation'];

  if (highFlags >= 2) {
    riskLevel = 'critical';
    recommendation = 'block';
  } else if (highFlags === 1) {
    riskLevel = 'high';
    recommendation = 'challenge';
  } else if (mediumFlags >= 2) {
    riskLevel = 'medium';
    recommendation = 'challenge';
  } else if (mediumFlags === 1 || flags.length > 0) {
    riskLevel = 'low';
    recommendation = 'notify';
  } else {
    riskLevel = 'low';
    recommendation = 'allow';
  }

  // Log if suspicious
  if (flags.length > 0) {
    callbacks?.log?.('warn', 'Suspicious activity detected', {
      sessionId: session.id,
      userId: session.userId,
      riskLevel,
      recommendation,
      flags: flags.map(f => f.type),
    });
  }

  // Build agentic manifest based on risk
  const manifestAction = riskLevel === 'critical'
    ? 'TERMINATE_SESSION' as const
    : riskLevel === 'high'
      ? 'REQUEST_MFA_CHALLENGE' as const
      : riskLevel === 'medium'
        ? 'REQUEST_MFA_CHALLENGE' as const
        : flags.length > 0
          ? 'ALLOW' as const
          : 'ALLOW' as const;

  const manifestConfidence = riskLevel === 'critical' ? 0.9
    : riskLevel === 'high' ? 0.85
    : riskLevel === 'medium' ? 0.7
    : 1.0;

  const requiresHumanReview = riskLevel === 'critical' || riskLevel === 'high';

  return {
    suspicious: flags.length > 0,
    riskLevel,
    flags,
    recommendation,
    manifest: buildManifest(manifestAction, manifestConfidence, requiresHumanReview),
  };
}

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

/**
 * Reset session activity store for testing purposes.
 * @internal
 */
export function _resetSessionActivityStore(): void {
  sessionActivityStore.clear();
}

/**
 * Get session activity (for admin/debugging).
 * @internal
 */
export function _getSessionActivity(sessionId: string) {
  return sessionActivityStore.get(sessionId);
}
