// ===========================================
// @ordinatio/security — Core Types
// ===========================================
// Database interface, callbacks, and shared types.
// Zero external dependencies.
// ===========================================

// ===========================================
// DATABASE INTERFACE
// ===========================================

/**
 * Shape of an ActivityLog row as returned from the database.
 * Security events and alerts are stored as ActivityLog entries
 * with special action prefixes and metadata markers.
 */
export interface ActivityLogRecord {
  id: string;
  action: string;
  description: string;
  severity: string;
  requiresResolution: boolean;
  system: boolean;
  userId: string | null;
  metadata: unknown;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  createdAt: Date;
  updatedAt?: Date;
}

/**
 * Minimal database interface for security operations.
 * Abstracts ActivityLog access — a Prisma client satisfies this naturally.
 */
export interface SecurityDb {
  activityLog: {
    create: (args: {
      data: {
        action: string;
        description: string;
        severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
        requiresResolution: boolean;
        system: boolean;
        userId: string | null;
        metadata: Record<string, unknown> | null;
      };
    }) => Promise<ActivityLogRecord>;

    findMany: (args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'> | Record<string, 'asc' | 'desc'>[];
      take?: number;
      skip?: number;
      select?: Record<string, boolean>;
    }) => Promise<ActivityLogRecord[]>;

    findFirst: (args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'> | Record<string, 'asc' | 'desc'>[];
    }) => Promise<ActivityLogRecord | null>;

    findUnique: (args: {
      where: { id: string };
    }) => Promise<ActivityLogRecord | null>;

    count: (args: {
      where: Record<string, unknown>;
    }) => Promise<number>;

    update: (args: {
      where: { id: string };
      data: {
        metadata?: Record<string, unknown>;
        resolvedAt?: Date;
        resolvedBy?: string;
      };
    }) => Promise<ActivityLogRecord>;
  };
}

// ===========================================
// CALLBACKS
// ===========================================

/**
 * Optional callbacks for security operations.
 * Replaces hardcoded logger and feature flag dependencies.
 */
export interface SecurityCallbacks {
  /** Called when a security event is logged. */
  onEventLogged?: (event: SecurityEvent) => Promise<void>;
  /** Called when an alert is created. */
  onAlertCreated?: (alert: SecurityAlert) => Promise<void>;
  /** Called when an alert is resolved. */
  onAlertResolved?: (alert: SecurityAlert) => Promise<void>;
  /** Logger interface — replaces hardcoded createLogger dependency. */
  log?: SecurityLogger;
}

export interface SecurityLogger {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>, err?: Error) => void;
}

// ===========================================
// SECURITY EVENT TYPES
// ===========================================

export const SECURITY_EVENT_TYPES = {
  // Authentication Events
  AUTH_LOGIN_SUCCESS: 'security.auth.login_success',
  AUTH_LOGIN_FAILED: 'security.auth.login_failed',
  AUTH_LOGOUT: 'security.auth.logout',
  AUTH_PASSWORD_CHANGED: 'security.auth.password_changed',
  AUTH_SESSION_EXPIRED: 'security.auth.session_expired',
  AUTH_ACCOUNT_LOCKED: 'security.auth.account_locked',
  AUTH_SUSPICIOUS_ACTIVITY: 'security.auth.suspicious_activity',
  AUTH_MFA_ENABLED: 'security.auth.mfa_enabled',
  AUTH_MFA_DISABLED: 'security.auth.mfa_disabled',
  AUTH_PASSWORD_RESET_REQUESTED: 'security.auth.password_reset_requested',
  AUTH_PASSWORD_RESET_COMPLETED: 'security.auth.password_reset_completed',

  // Access Control Events
  PERMISSION_DENIED: 'security.access.permission_denied',
  PERMISSION_GRANTED: 'security.access.permission_granted',
  PERMISSION_REVOKED: 'security.access.permission_revoked',
  ROLE_CHANGED: 'security.access.role_changed',
  UNAUTHORIZED_RESOURCE_ACCESS: 'security.access.unauthorized_resource',

  // API Security Events
  RATE_LIMIT_EXCEEDED: 'security.api.rate_limit_exceeded',
  API_KEY_USED: 'security.api.key_used',
  API_KEY_CREATED: 'security.api.key_created',
  API_KEY_REVOKED: 'security.api.key_revoked',
  SECURITY_HEADER_MISSING: 'security.api.header_missing',
  CSRF_VALIDATION_FAILED: 'security.api.csrf_failed',
  INVALID_INPUT_BLOCKED: 'security.api.invalid_input_blocked',

  // Data Security Events
  SENSITIVE_DATA_ACCESSED: 'security.data.accessed',
  SENSITIVE_DATA_EXPORTED: 'security.data.exported',
  BULK_DATA_OPERATION: 'security.data.bulk_operation',
  PII_ACCESSED: 'security.data.pii_accessed',

  // System Security Events
  CONFIG_CHANGED: 'security.system.config_changed',
  FEATURE_FLAG_CHANGED: 'security.system.feature_flag_changed',
  SECURITY_SCAN_COMPLETED: 'security.system.scan_completed',
  VULNERABILITY_DETECTED: 'security.system.vulnerability_detected',
  ANOMALY_DETECTED: 'security.system.anomaly_detected',

  // Agent Security Events
  AGENT_SENSITIVE_DATA_TO_LLM: 'security.agent.sensitive_data_to_llm',
  AGENT_TOOL_BLOCKED_BY_POLICY: 'security.agent.tool_blocked_by_policy',

  // Integration Security Events
  OAUTH_TOKEN_REFRESHED: 'security.integration.oauth_refreshed',
  OAUTH_TOKEN_REVOKED: 'security.integration.oauth_revoked',
  WEBHOOK_SIGNATURE_INVALID: 'security.integration.webhook_invalid',
  EXTERNAL_API_ERROR: 'security.integration.api_error',
} as const;

export type SecurityEventType = typeof SECURITY_EVENT_TYPES[keyof typeof SECURITY_EVENT_TYPES];

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const RISK_LEVELS: Record<RiskLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

// ===========================================
// EVENT CONFIGURATION
// ===========================================

export interface SecurityEventConfig {
  label: string;
  description: string;
  defaultRiskLevel: RiskLevel;
  alwaysAlert: boolean;
  retentionDays: number;
  tags: string[];
}

// ===========================================
// SECURITY EVENT INTERFACES
// ===========================================

export interface SecurityEventInput {
  eventType: SecurityEventType;
  userId?: string | null;
  targetUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
  riskLevel?: RiskLevel;
  resourceId?: string | null;
  resourceType?: string | null;
  requestId?: string | null;
  /** Optional principal context — binds event to a specific actor */
  principal?: import('./principal-context').PrincipalContext;
}

export interface SecurityEvent {
  id: string;
  eventType: SecurityEventType;
  userId: string | null;
  targetUserId: string | null;
  ip: string | null;
  userAgent: string | null;
  riskLevel: RiskLevel;
  details: Record<string, unknown>;
  resourceId: string | null;
  resourceType: string | null;
  requestId: string | null;
  createdAt: Date;
}

export interface SecurityEventQueryOptions {
  userId?: string;
  eventTypes?: SecurityEventType[];
  minRiskLevel?: RiskLevel;
  ip?: string;
  startDate?: Date;
  endDate?: Date;
  tags?: string[];
  limit?: number;
  offset?: number;
}

// ===========================================
// ALERT TYPES
// ===========================================

export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'FALSE_POSITIVE';

export interface SecurityAlert {
  id: string;
  alertType: string;
  riskLevel: RiskLevel;
  status: AlertStatus;
  title: string;
  description: string;
  triggerEventId: string | null;
  triggerEventType: SecurityEventType;
  affectedUserId: string | null;
  affectedIp: string | null;
  eventCount: number;
  windowMinutes: number;
  metadata: Record<string, unknown>;
  acknowledgedBy: string | null;
  acknowledgedAt: Date | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  resolutionNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAlertInput {
  alertType: string;
  riskLevel: RiskLevel;
  title: string;
  description: string;
  triggerEventId?: string;
  triggerEventType: SecurityEventType;
  affectedUserId?: string;
  affectedIp?: string;
  eventCount: number;
  windowMinutes: number;
  metadata?: Record<string, unknown>;
}

// ===========================================
// ALERT THRESHOLDS
// ===========================================

export interface AlertThreshold {
  eventType: SecurityEventType;
  windowMinutes: number;
  threshold: number;
  alertLevel: RiskLevel;
  description: string;
}

// ===========================================
// AUDIT TYPES
// ===========================================

export interface AuditResult {
  vulnerabilities: {
    critical: number;
    high: number;
    moderate: number;
    low: number;
    total: number;
  };
  outdatedPackages: OutdatedPackage[];
  timestamp: Date;
  success: boolean;
  error?: string;
}

export interface OutdatedPackage {
  name: string;
  current: string;
  wanted: string;
  latest: string;
  location: string;
}

/**
 * Pluggable audit runner — app layer provides the real pnpm audit implementation.
 */
export interface AuditRunner {
  runVulnerabilityCheck: () => Promise<AuditResult['vulnerabilities']>;
  runOutdatedCheck: () => Promise<OutdatedPackage[]>;
}

// ===========================================
// EXTENDED CALLBACKS (opt-in capabilities)
// ===========================================

export interface ExtendedSecurityCallbacks extends SecurityCallbacks {
  /** Enable integrity hash chain on events */
  integrityEnabled?: boolean;
}
