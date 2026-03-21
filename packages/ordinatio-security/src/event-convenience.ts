// ===========================================
// @ordinatio/security — Convenience Functions
// ===========================================
// Pre-built functions for common security events.
// ===========================================

import type { SecurityDb, SecurityCallbacks, SecurityEvent } from './types';
import { SECURITY_EVENT_TYPES } from './types';
import { logSecurityEvent } from './event-logger';

export async function logLoginSuccess(db: SecurityDb, options: {
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
  method?: string;
}, callbacks?: SecurityCallbacks): Promise<SecurityEvent> {
  return logSecurityEvent(db, {
    eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
    userId: options.userId,
    ip: options.ip,
    userAgent: options.userAgent,
    details: { method: options.method ?? 'password' },
  }, callbacks);
}

export async function logLoginFailure(db: SecurityDb, options: {
  email?: string;
  ip?: string | null;
  userAgent?: string | null;
  reason: string;
  userId?: string | null;
}, callbacks?: SecurityCallbacks): Promise<SecurityEvent> {
  return logSecurityEvent(db, {
    eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
    userId: options.userId,
    ip: options.ip,
    userAgent: options.userAgent,
    details: { email: options.email, reason: options.reason },
  }, callbacks);
}

export async function logRateLimitExceeded(db: SecurityDb, options: {
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  endpoint: string;
  limit: number;
}, callbacks?: SecurityCallbacks): Promise<SecurityEvent> {
  return logSecurityEvent(db, {
    eventType: SECURITY_EVENT_TYPES.RATE_LIMIT_EXCEEDED,
    userId: options.userId,
    ip: options.ip,
    userAgent: options.userAgent,
    details: { endpoint: options.endpoint, limit: options.limit },
  }, callbacks);
}

export async function logPermissionDenied(db: SecurityDb, options: {
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
  resource: string;
  permission: string;
}, callbacks?: SecurityCallbacks): Promise<SecurityEvent> {
  return logSecurityEvent(db, {
    eventType: SECURITY_EVENT_TYPES.PERMISSION_DENIED,
    userId: options.userId,
    ip: options.ip,
    userAgent: options.userAgent,
    details: { resource: options.resource, permission: options.permission },
  }, callbacks);
}

export async function logSuspiciousActivity(db: SecurityDb, options: {
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  reason: string;
  details?: Record<string, unknown>;
}, callbacks?: SecurityCallbacks): Promise<SecurityEvent> {
  return logSecurityEvent(db, {
    eventType: SECURITY_EVENT_TYPES.AUTH_SUSPICIOUS_ACTIVITY,
    userId: options.userId,
    ip: options.ip,
    userAgent: options.userAgent,
    riskLevel: 'HIGH',
    details: { reason: options.reason, ...options.details },
  }, callbacks);
}
