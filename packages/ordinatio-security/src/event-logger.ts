// ===========================================
// @ordinatio/security — Event Logger
// ===========================================
// Core function for logging security events.
// Uses SecurityDb interface instead of PrismaClient.
// ===========================================

import type {
  SecurityDb,
  SecurityCallbacks,
  ExtendedSecurityCallbacks,
  SecurityEventInput,
  SecurityEvent,
  RiskLevel,
  SecurityEventType,
} from './types';
import { SECURITY_EVENT_TYPES } from './types';
import { SECURITY_EVENT_CONFIG } from './event-config';
import { getSecurityEventConfig, shouldAlwaysAlert } from './event-helpers';
import { buildIntegrityMetadata, getLastHash } from './integrity/chain-state';
import { describePrincipal } from './principal-context';

// ===========================================
// SANITIZATION HELPERS (exported for reuse)
// ===========================================

export function sanitizeIp(ip: string | null | undefined): string | null {
  if (!ip) return null;

  const firstIp = ip.split(',')[0].trim();
  const withoutPort = firstIp.split(':').slice(0, -1).join(':') || firstIp;
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

  const bracketMatch = firstIp.match(/^\[(.+)\](?::\d+)?$/);
  if (bracketMatch) {
    return bracketMatch[1];
  }

  if (ipv4Regex.test(withoutPort) || ipv6Regex.test(firstIp)) {
    return ipv4Regex.test(withoutPort) ? withoutPort : firstIp;
  }

  return firstIp;
}

export function sanitizeUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const cleaned = userAgent.replace(/[\x00-\x1F\x7F]/g, '');
  return cleaned.length > 256 ? cleaned.substring(0, 256) + '...' : cleaned;
}

function buildEventDescription(
  eventType: SecurityEventType,
  details?: Record<string, unknown>
): string {
  const config = SECURITY_EVENT_CONFIG[eventType];
  let description = config.description;

  if (details) {
    switch (eventType) {
      case SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED:
        if (details.email) description += ` for ${details.email}`;
        if (details.reason) description += ` (${details.reason})`;
        break;
      case SECURITY_EVENT_TYPES.PERMISSION_DENIED:
        if (details.resource) description += ` to ${details.resource}`;
        if (details.permission) description += ` (required: ${details.permission})`;
        break;
      case SECURITY_EVENT_TYPES.RATE_LIMIT_EXCEEDED:
        if (details.endpoint) description += ` on ${details.endpoint}`;
        if (details.limit) description += ` (limit: ${details.limit})`;
        break;
      case SECURITY_EVENT_TYPES.INVALID_INPUT_BLOCKED:
        if (details.field) description += ` in field "${details.field}"`;
        if (details.reason) description += ` (${details.reason})`;
        break;
      case SECURITY_EVENT_TYPES.SENSITIVE_DATA_EXPORTED:
        if (details.dataType) description += `: ${details.dataType}`;
        if (details.recordCount) description += ` (${details.recordCount} records)`;
        break;
      case SECURITY_EVENT_TYPES.ROLE_CHANGED:
        if (details.fromRole && details.toRole) {
          description += `: ${details.fromRole} -> ${details.toRole}`;
        }
        break;
      default:
        if (details.message) description += `: ${details.message}`;
    }
  }

  return description;
}

// ===========================================
// CORE FUNCTION
// ===========================================

export async function logSecurityEvent(
  db: SecurityDb,
  input: SecurityEventInput,
  callbacks?: SecurityCallbacks
): Promise<SecurityEvent> {
  const config = getSecurityEventConfig(input.eventType);

  if (!config) {
    callbacks?.log?.error('Unknown security event type', { eventType: input.eventType });
    throw new Error(`Unknown security event type: ${input.eventType}`);
  }

  const riskLevel = input.riskLevel ?? config.defaultRiskLevel;

  const severityMap: Record<RiskLevel, 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'> = {
    LOW: 'INFO',
    MEDIUM: 'WARNING',
    HIGH: 'ERROR',
    CRITICAL: 'CRITICAL',
  };

  const metadata: Record<string, unknown> = {
    securityEvent: true,
    eventType: input.eventType,
    riskLevel,
    ip: sanitizeIp(input.ip),
    userAgent: sanitizeUserAgent(input.userAgent),
    targetUserId: input.targetUserId ?? null,
    resourceId: input.resourceId ?? null,
    resourceType: input.resourceType ?? null,
    requestId: input.requestId ?? null,
    detailsJson: input.details ? JSON.stringify(input.details) : null,
    tags: config.tags,
  };

  // Store principal context if provided
  if (input.principal) {
    metadata.principal = {
      principalId: input.principal.principalId,
      principalType: input.principal.principalType,
      orgId: input.principal.orgId ?? null,
      authMethod: input.principal.authMethod ?? null,
      trustTier: input.principal.trustTier ?? null,
      description: describePrincipal(input.principal),
    };
  }

  // Compute integrity hash if enabled (opt-in)
  const extCallbacks = callbacks as ExtendedSecurityCallbacks | undefined;
  if (extCallbacks?.integrityEnabled) {
    try {
      const prevHash = await getLastHash(db);
      const integrity = buildIntegrityMetadata(input, prevHash);
      metadata.integrity = integrity;
    } catch {
      // Integrity is best-effort — don't block logging
    }
  }

  const description = buildEventDescription(input.eventType, input.details);

  try {
    const activity = await db.activityLog.create({
      data: {
        action: input.eventType,
        description,
        severity: severityMap[riskLevel],
        requiresResolution: shouldAlwaysAlert(input.eventType),
        system: true,
        userId: input.userId ?? null,
        metadata,
      },
    });

    const logContext = {
      eventId: activity.id,
      eventType: input.eventType,
      riskLevel,
      userId: input.userId ?? 'anonymous',
      ip: sanitizeIp(input.ip),
    };

    if (riskLevel === 'CRITICAL') {
      callbacks?.log?.error(`SECURITY ALERT: ${config.label}`, logContext);
    } else if (riskLevel === 'HIGH') {
      callbacks?.log?.warn(`SECURITY WARNING: ${config.label}`, logContext);
    } else if (riskLevel === 'MEDIUM') {
      callbacks?.log?.info(`Security Event: ${config.label}`, logContext);
    } else {
      callbacks?.log?.debug(`Security Event: ${config.label}`, logContext);
    }

    const event: SecurityEvent = {
      id: activity.id,
      eventType: input.eventType,
      userId: input.userId ?? null,
      targetUserId: input.targetUserId ?? null,
      ip: sanitizeIp(input.ip),
      userAgent: sanitizeUserAgent(input.userAgent),
      riskLevel,
      details: input.details ?? {},
      resourceId: input.resourceId ?? null,
      resourceType: input.resourceType ?? null,
      requestId: input.requestId ?? null,
      createdAt: activity.createdAt,
    };

    await callbacks?.onEventLogged?.(event);

    return event;
  } catch (error) {
    callbacks?.log?.error('Failed to log security event', {
      eventType: input.eventType,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      id: 'failed-to-log',
      eventType: input.eventType,
      userId: input.userId ?? null,
      targetUserId: input.targetUserId ?? null,
      ip: sanitizeIp(input.ip),
      userAgent: sanitizeUserAgent(input.userAgent),
      riskLevel,
      details: input.details ?? {},
      resourceId: input.resourceId ?? null,
      resourceType: input.resourceType ?? null,
      requestId: input.requestId ?? null,
      createdAt: new Date(),
    };
  }
}
